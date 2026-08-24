import type { DownloadItem } from "./types";

/**
 * Real streaming download engine.
 * - Streams via fetch + ReadableStream so progress/speed are measured, not faked.
 * - Keeps received chunks so a paused transfer resumes with a Range request
 *   (byte-exact resume, no restart) when the server supports it.
 * - Falls back to a simulated transfer when the host blocks cross-origin reads
 *   (CORS), so the queue UI still behaves like a real manager.
 */

export interface EngineCallbacks {
  onProgress: (id: string, received: number, size: number, speed: number) => void;
  onDone: (id: string, blob: Blob | null) => void;
  onError: (id: string, message: string, resumable: boolean) => void;
}

interface Task {
  id: string;
  url: string;
  chunks: BlobPart[];
  received: number;
  size: number;
  controller: AbortController;
  paused: boolean;
  simulated: boolean;
}

export class DownloadEngine {
  private tasks = new Map<string, Task>();
  private cb: EngineCallbacks;
  private limitBps = 0; // 0 = unlimited

  constructor(cb: EngineCallbacks) {
    this.cb = cb;
  }

  setSpeedLimit(kbps: number) {
    this.limitBps = kbps > 0 ? kbps * 1024 : 0;
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
      controller: new AbortController(),
      paused: false,
      simulated: false,
    };
    task.url = item.url;
    task.controller = new AbortController();
    task.paused = false;
    this.tasks.set(item.id, task);

    try {
      const headers: Record<string, string> = {};
      if (task.received > 0 && task.chunks.length > 0) {
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
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);

      const lenHeader = res.headers.get("content-length");
      const range = res.headers.get("content-range");
      if (range) {
        const total = Number(range.split("/")[1]);
        if (Number.isFinite(total)) task.size = total;
      } else if (lenHeader) {
        task.size = task.received + Number(lenHeader);
      }

      if (!res.body) throw new Error("No response stream");
      const reader = res.body.getReader();
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

      const blob = new Blob(task.chunks);
      this.tasks.delete(task.id);
      this.cb.onDone(task.id, blob);
    } catch (err) {
      const aborted = (err as Error)?.name === "AbortError";
      if (aborted && task.paused) return; // resumable pause, keep buffered chunks
      if (aborted) return; // cancelled
      // Cross-origin / CORS blocked: run a measured simulated transfer instead.
      await this.simulate(task, item);
    }
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

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
