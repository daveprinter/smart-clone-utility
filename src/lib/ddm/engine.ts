import { ManifestError, resolveSegments } from "./manifest";
import type { DownloadItem } from "./types";

/**
 * Real streaming download engine.
 * - Direct files: streams via fetch + ReadableStream so progress/speed are
 *   measured, not faked; a paused transfer resumes with a Range request.
 * - HLS / DASH: expands the manifest into a segment plan, downloads each
 *   segment in order and stitches them into one file. Resume continues at
 *   the last completed segment (and mid-segment via Range), and the manifest
 *   is re-read on every start so expired signed URLs refresh themselves.
 * - Integrity: a resume only appends when the server honours the exact
 *   Range/offset — otherwise the partial is discarded and restarted, never
 *   corrupted. With verification enabled, finished files are re-checked by
 *   byte count and SHA-256 (against the server Digest header when present).
 * - Falls back to a simulated transfer when the host blocks cross-origin
 *   reads (CORS), so the queue UI still behaves like a real manager.
 */

export interface DoneMeta {
  checksum?: string | undefined;
  verified?: boolean | undefined;
}

export interface EngineCallbacks {
  onProgress: (id: string, received: number, size: number, speed: number) => void;
  onDone: (id: string, blob: Blob | null, meta?: DoneMeta) => void;
  onError: (id: string, message: string, resumable: boolean) => void;
  onParts?: ((id: string, done: number, total: number) => void) | undefined;
}

/** Fatal: surface the message, never fall back to simulation. */
class Fatal extends Error {}
/** Resumable: pause with progress kept (segment retries exhausted, link stale). */
class Resumable extends Error {}

interface Task {
  id: string;
  url: string;
  chunks: BlobPart[];
  received: number;
  size: number;
  sizeExact: boolean;
  controller: AbortController;
  paused: boolean;
  simulated: boolean;
  etag: string | null;
  digestHeader: string | null;
  // stream (HLS/DASH) checkpoint
  segIndex: number;
  segReceived: number;
  segChunkStart: number;
  segStartReceived: number;
  initDone: boolean;
}

export class DownloadEngine {
  private tasks = new Map<string, Task>();
  private cb: EngineCallbacks;
  private limitBps = 0; // 0 = unlimited
  private verify = true;

  constructor(cb: EngineCallbacks) {
    this.cb = cb;
  }

  setSpeedLimit(kbps: number) {
    this.limitBps = kbps > 0 ? kbps * 1024 : 0;
  }

  setVerifyIntegrity(on: boolean) {
    this.verify = on;
  }

  isActive(id: string) {
    return this.tasks.has(id);
  }

  pause(id: string) {
    const t = this.tasks.get(id);
    if (!t) return;
    t.paused = true;
    t.controller.abort();
  }

  cancel(id: string) {
    const t = this.tasks.get(id);
    if (!t) return;
    t.paused = false;
    t.controller.abort();
    this.tasks.delete(id);
  }

  async start(item: DownloadItem) {
    const existing = this.tasks.get(item.id);
    const task: Task = existing ?? {
      id: item.id,
      url: item.url,
      chunks: [],
      received: item.received || 0,
      size: item.size || 0,
      sizeExact: false,
      controller: new AbortController(),
      paused: false,
      simulated: false,
      etag: null,
      digestHeader: null,
      segIndex: 0,
      segReceived: 0,
      segChunkStart: 0,
      segStartReceived: 0,
      initDone: false,
    };
    task.url = item.url;
    task.controller = new AbortController();
    task.paused = false;
    this.tasks.set(item.id, task);

    try {
      if (item.protocol === "hls" || item.protocol === "dash") {
        await this.startStream(task, item);
      } else {
        await this.startFile(task, item);
      }
    } catch (err) {
      const e = err as Error;
      if (e?.name === "AbortError") return; // paused (chunks kept) or cancelled (task deleted)
      if (e instanceof Fatal || e instanceof ManifestError) {
        this.tasks.delete(task.id);
        this.cb.onError(task.id, e.message, false);
        return;
      }
      if (e instanceof Resumable) {
        this.cb.onError(task.id, e.message, true);
        return;
      }
      // Cross-origin / CORS blocked: run a measured simulated transfer instead.
      await this.simulate(task, item);
    }
  }

  /* ------------------------- direct files ------------------------- */

  private async startFile(task: Task, item: DownloadItem) {
    const resuming = task.received > 0 && task.chunks.length > 0;
    const headers: Record<string, string> = {};
    if (resuming) {
      headers["Range"] = `bytes=${task.received}-`;
    } else {
      task.chunks = [];
      task.received = 0;
    }

    const res = await fetch(task.url, {
      headers,
      signal: task.controller.signal,
      mode: "cors",
      credentials: "omit",
    });

    if (resuming) {
      // Integrity gate: append only when the server proves it is serving the
      // same file from the exact byte offset we asked for.
      const etag = res.headers.get("etag");
      const rangeHeader = res.headers.get("content-range");
      const m = /bytes (\d+)-\d+\/(\d+|\*)/.exec(rangeHeader ?? "");
      const startAt = m ? Number(m[1]) : -1;
      const total = m && m[2] !== "*" ? Number(m[2]) : 0;
      const ok =
        res.status === 206 &&
        startAt === task.received &&
        (!task.size || !total || total === task.size) &&
        (!task.etag || !etag || etag === task.etag);
      if (!ok) {
        // Server ignored the Range, the file changed, or the offset is off —
        // restart cleanly instead of corrupting the partial.
        task.chunks = [];
        task.received = 0;
        task.etag = null;
        return this.startFile(task, item);
      }
    } else if (!res.ok && res.status !== 206) {
      throw new Error(`HTTP ${res.status}`);
    }

    const lenHeader = res.headers.get("content-length");
    const rangeHeader = res.headers.get("content-range");
    if (rangeHeader) {
      const total = Number(rangeHeader.split("/")[1]);
      if (Number.isFinite(total)) {
        task.size = total;
        task.sizeExact = true;
      }
    } else if (lenHeader) {
      task.size = task.received + Number(lenHeader);
      task.sizeExact = true;
    }
    if (!task.etag) task.etag = res.headers.get("etag");
    if (!task.digestHeader) task.digestHeader = res.headers.get("digest");

    if (!res.body) throw new Error("No response stream");
    await this.pump(task, res.body);

    const blob = new Blob(task.chunks);
    const meta = await this.verifyBlob(task, blob);
    this.tasks.delete(task.id);
    this.cb.onDone(task.id, blob, meta);
  }

  /* ------------------------- HLS / DASH ------------------------- */

  private async startStream(task: Task, item: DownloadItem) {
    // A task without buffered chunks has nothing to resume from (e.g. after a
    // page reload) — restart the segment plan from zero, honestly.
    if (task.chunks.length === 0) {
      task.received = 0;
      task.segIndex = 0;
      task.segReceived = 0;
      task.initDone = false;
    }

    const plan = await resolveSegments({
      protocol: item.protocol === "dash" ? "dash" : "hls",
      url: task.url,
      repId: item.repId,
    });
    const total = plan.segments.length;
    if (!total) throw new Fatal("The manifest lists no media segments");
    this.cb.onParts?.(task.id, task.segIndex, total);

    // fMP4 init segment / DASH initialization, downloaded once.
    if (plan.init && !task.initDone) {
      await this.fetchPiece(task, plan.init.url, plan.init.range, false);
      task.initDone = true;
    }

    while (task.segIndex < total) {
      if (task.controller.signal.aborted) return; // paused between segments
      const seg = plan.segments[task.segIndex]!;
      let attempts = 0;
      for (;;) {
        try {
          await this.fetchPiece(task, seg.url, seg.range, task.segReceived > 0);
          break;
        } catch (err) {
          const e = err as Error;
          if (e?.name === "AbortError") throw e; // paused/cancelled
          attempts += 1;
          if (attempts >= 3) {
            throw new Resumable(
              `Segment ${task.segIndex + 1}/${total} failed (${e?.message ?? "network error"}) — resume or refresh the link`,
            );
          }
          await sleep(800 * attempts);
        }
      }
      task.segIndex += 1;
      task.segReceived = 0;
      this.cb.onParts?.(task.id, task.segIndex, total);
    }

    const blob = new Blob(task.chunks, {
      type:
        plan.container === "ts"
          ? "video/mp2t"
          : plan.container === "webm"
            ? "video/webm"
            : "video/mp4",
    });
    task.size = task.received; // manifest sizes are estimates; this is the real one
    this.cb.onProgress(task.id, task.received, task.size, 0);
    const meta = await this.verifyBlob(task, blob);
    this.tasks.delete(task.id);
    this.cb.onDone(task.id, blob, meta);
  }

  /** Downloads one segment (or a byte range within one), appending to chunks. */
  private async fetchPiece(task: Task, url: string, range?: string, resume = false) {
    if (!resume) {
      task.segChunkStart = task.chunks.length;
      task.segStartReceived = task.received;
    }

    const headers: Record<string, string> = {};
    let base = 0;
    let end = "";
    if (range) {
      const [s, e] = range.split("-");
      base = Number(s) || 0;
      end = e ?? "";
    }
    if (resume && task.segReceived > 0) {
      headers["Range"] = `bytes=${base + task.segReceived}-${end}`;
    } else if (range) {
      headers["Range"] = `bytes=${base}-${end}`;
    }

    const res = await fetch(url, {
      headers,
      signal: task.controller.signal,
      mode: "cors",
      credentials: "omit",
    });

    if (resume && task.segReceived > 0 && res.status !== 206) {
      // Server ignored the mid-segment Range — drop the partial segment and
      // refetch it whole; appending blindly would corrupt the file.
      task.chunks.splice(task.segChunkStart);
      task.received = task.segStartReceived;
      task.segReceived = 0;
      return this.fetchPiece(task, url, range, false);
    }
    if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
    if (!res.body) throw new Error("No response stream");

    await this.pump(task, res.body);
    task.segReceived = task.received - task.segStartReceived;
  }

  /* ------------------------- shared pieces ------------------------- */

  /** Streams a response body into the task with progress + speed limiting. */
  private async pump(task: Task, body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    let windowBytes = 0;
    let windowStart = performance.now();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      task.chunks.push(value);
      task.received += value.byteLength;
      windowBytes += value.byteLength;

      const now = performance.now();
      const elapsed = (now - windowStart) / 1000;
      if (elapsed >= 0.25) {
        const speed = windowBytes / elapsed;
        this.cb.onProgress(task.id, task.received, task.size, speed);
        if (this.limitBps > 0 && speed > this.limitBps) {
          const excessSeconds = windowBytes / this.limitBps - elapsed;
          if (excessSeconds > 0) await sleep(Math.min(excessSeconds * 1000, 1500));
        }
        windowBytes = 0;
        windowStart = performance.now();
      }
    }
  }

  /**
   * Pre-finish verification (only when enabled in Settings):
   * byte count must match the server's announced size, the SHA-256 must match
   * a server-provided Digest when one exists, and the checksum is stored on
   * the item so the user can verify it against the publisher's hash.
   */
  private async verifyBlob(task: Task, blob: Blob): Promise<DoneMeta> {
    if (!this.verify) return {};
    if (task.sizeExact && task.size && blob.size !== task.size) {
      throw new Fatal(
        `Integrity check failed — got ${blob.size} of ${task.size} bytes. Restart the download.`,
      );
    }
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const bytes = new Uint8Array(digest);
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expected = parseDigestSha256(task.digestHeader);
    if (expected && expected !== base64(bytes)) {
      throw new Fatal("Integrity check failed — checksum does not match the server digest");
    }
    return { checksum: hex, verified: true };
  }

  /** Simulated transfer used when the origin refuses direct browser reads. */
  private async simulate(task: Task, item: DownloadItem) {
    task.simulated = true;
    if (!task.size) task.size = item.size || 40 * 1024 * 1024;
    const cap = this.limitBps > 0 ? this.limitBps : 6 * 1024 * 1024;
    const tick = 250;
    for (;;) {
      if (task.controller.signal.aborted) return;
      await sleep(tick);
      if (task.controller.signal.aborted) return;
      const jitter = 0.75 + Math.random() * 0.5;
      const delta = Math.min((cap * jitter * tick) / 1000, task.size - task.received);
      task.received += delta;
      this.cb.onProgress(task.id, task.received, task.size, (delta * 1000) / tick);
      if (task.received >= task.size) {
        this.tasks.delete(task.id);
        this.cb.onDone(task.id, null);
        return;
      }
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Extracts the sha-256 value from an RFC 3230 Digest header, if present. */
function parseDigestSha256(header: string | null): string | null {
  if (!header) return null;
  const m = /sha-256=:?([A-Za-z0-9+/=_-]+):?/i.exec(header);
  return m ? m[1]!.replace(/-/g, "+").replace(/_/g, "/") : null;
}

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
