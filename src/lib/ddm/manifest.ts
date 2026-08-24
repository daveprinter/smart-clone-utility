import { guessExt } from "./format";
import type { DownloadVariant, StreamProtocol } from "./types";

/**
 * HLS (.m3u8) and DASH (.mpd) manifest support.
 *
 * probeStream() reads a manifest and turns it into real download variants —
 * actual resolutions, bitrates and estimated sizes taken from the manifest
 * itself, not a guessed ladder. resolveSegments() then expands a variant
 * into the ordered list of media segments the engine downloads and stitches
 * into one file. Re-resolving on every (re)start also refreshes expiring
 * signed URLs, which keeps paused downloads resumable.
 */

/** Unrecoverable manifest problem — surfaced to the user, never simulated. */
export class ManifestError extends Error {}

const MAX_VARIANTS = 12;
const MAX_SEGMENTS = 5000;

export interface SegmentRef {
  url: string;
  /** HTTP byte range "start-end" for EXT-X-BYTERANGE style segments. */
  range?: string | undefined;
}

export interface SegmentPlan {
  init?: SegmentRef | undefined;
  segments: SegmentRef[];
  container: string;
  durationSec?: number | undefined;
}

export function isManifestUrl(url: string): boolean {
  const ext = guessExt(url);
  return ext === "m3u8" || ext === "m3u" || ext === "mpd";
}

function abs(ref: string, base: string): string {
  try {
    return new URL(ref, base).href;
  } catch {
    return ref;
  }
}

function fmtDur(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${r}s`;
  return `${s}s`;
}

/* ============================== HLS ============================== */

type Attrs = Record<string, string>;

function parseAttrs(s: string): Attrs {
  const out: Attrs = {};
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const raw = m[2] ?? "";
    out[m[1]!] = raw.startsWith('"') ? raw.slice(1, -1) : raw;
  }
  return out;
}

interface HlsMasterVariant {
  url: string;
  bandwidth: number;
  avgBandwidth: number;
  width?: number | undefined;
  height?: number | undefined;
  audioGroup?: string | undefined;
}

interface HlsMaster {
  kind: "master";
  variants: HlsMasterVariant[];
  audio: { url: string; name: string }[];
}

interface HlsMedia {
  kind: "media";
  segments: SegmentRef[];
  init?: SegmentRef | undefined;
  durationSec: number;
  live: boolean;
  encrypted: boolean;
  fmp4: boolean;
}

type HlsDoc = HlsMaster | HlsMedia;

export function parseHls(baseUrl: string, text: string): HlsDoc {
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  if (lines.some((l) => l.startsWith("#EXT-X-STREAM-INF"))) {
    const variants: HlsMasterVariant[] = [];
    const audio: { url: string; name: string }[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      if (line.startsWith("#EXT-X-MEDIA:")) {
        const a = parseAttrs(line.slice("#EXT-X-MEDIA:".length));
        if (a["TYPE"] === "AUDIO" && a["URI"]) {
          audio.push({ url: abs(a["URI"], baseUrl), name: a["NAME"] ?? "Audio" });
        }
      } else if (line.startsWith("#EXT-X-STREAM-INF:")) {
        const a = parseAttrs(line.slice("#EXT-X-STREAM-INF:".length));
        let uri = "";
        for (let j = i + 1; j < lines.length; j += 1) {
          if (lines[j] && !lines[j]!.startsWith("#")) {
            uri = lines[j]!;
            break;
          }
        }
        if (!uri) continue;
        const [w, h] = (a["RESOLUTION"] ?? "").split("x").map(Number);
        variants.push({
          url: abs(uri, baseUrl),
          bandwidth: Number(a["BANDWIDTH"]) || 0,
          avgBandwidth: Number(a["AVERAGE-BANDWIDTH"]) || 0,
          width: w || undefined,
          height: h || undefined,
          audioGroup: a["AUDIO"],
        });
      }
    }
    return { kind: "master", variants, audio };
  }

  // Media playlist
  const segments: SegmentRef[] = [];
  let init: SegmentRef | undefined;
  let durationSec = 0;
  let live = true;
  let encrypted = false;
  let fmp4 = false;
  let pendingRange: string | undefined;
  let rangeOffset = 0;

  for (const line of lines) {
    if (line.startsWith("#EXT-X-KEY:")) {
      const a = parseAttrs(line.slice("#EXT-X-KEY:".length));
      if (a["METHOD"] && a["METHOD"] !== "NONE") encrypted = true;
    } else if (line.startsWith("#EXT-X-MAP:")) {
      const a = parseAttrs(line.slice("#EXT-X-MAP:".length));
      if (a["URI"]) {
        fmp4 = true;
        init = { url: abs(a["URI"], baseUrl) };
        if (a["BYTERANGE"]) {
          const [len, off] = a["BYTERANGE"].split("@").map(Number);
          if (len) init.range = `${off || 0}-${(off || 0) + len - 1}`;
        }
      }
    } else if (line.startsWith("#EXT-X-BYTERANGE:")) {
      pendingRange = line.slice("#EXT-X-BYTERANGE:".length).trim();
    } else if (line.startsWith("#EXTINF:")) {
      durationSec += Number(line.slice("#EXTINF:".length).split(",")[0]) || 0;
    } else if (line === "#EXT-X-ENDLIST") {
      live = false;
    } else if (line && !line.startsWith("#")) {
      const url = abs(line, baseUrl);
      if (/\.(m4s|mp4|cmfv|cmfa)([?#]|$)/i.test(url)) fmp4 = true;
      let range: string | undefined;
      if (pendingRange) {
        const [len, off] = pendingRange.split("@").map(Number);
        const startAt = off || rangeOffset;
        if (len) range = `${startAt}-${startAt + len - 1}`;
        rangeOffset = startAt + (len || 0);
      } else {
        rangeOffset = 0;
      }
      segments.push({ url, range });
      pendingRange = undefined;
    }
  }
  return { kind: "media", segments, init, durationSec, live, encrypted, fmp4 };
}

async function hlsVariants(
  url: string,
  text: string,
): Promise<{ variants: DownloadVariant[]; resumable: boolean }> {
  const doc = parseHls(url, text);

  if (doc.kind === "media") {
    if (doc.encrypted) {
      throw new ManifestError("This HLS stream is encrypted — DDM can't save protected media");
    }
    return {
      resumable: true,
      variants: [
        {
          id: "v0",
          label: doc.live ? "Live stream" : "Original",
          container: doc.fmp4 ? "mp4" : "ts",
          size: 0,
          url,
          protocol: "hls",
          durationSec: doc.durationSec || undefined,
          note: [
            `${doc.segments.length} segments`,
            doc.live
              ? "live — captures the current buffer"
              : doc.durationSec
                ? fmtDur(doc.durationSec)
                : "",
          ]
            .filter(Boolean)
            .join(" • "),
        },
      ],
    };
  }

  // Master playlist — fetch a mid-ladder variant once to learn the duration,
  // segment count and container, then size every rung from its bitrate.
  let durationSec: number | undefined;
  let segCount: number | undefined;
  let fmp4 = false;
  let encrypted = false;
  const ascending = [...doc.variants].sort((a, b) => (a.bandwidth || 0) - (b.bandwidth || 0));
  const sample = ascending[Math.floor(ascending.length / 2)] ?? ascending[0];
  if (sample) {
    try {
      const res = await fetch(sample.url, { mode: "cors", credentials: "omit" });
      if (res.ok) {
        const sub = parseHls(sample.url, await res.text());
        if (sub.kind === "media") {
          durationSec = sub.durationSec || undefined;
          segCount = sub.segments.length;
          fmp4 = sub.fmp4;
          encrypted = sub.encrypted;
        }
      }
    } catch {
      /* duration unknown — sizes fall back to "—" */
    }
  }
  if (encrypted) {
    throw new ManifestError("This HLS stream is encrypted — DDM can't save protected media");
  }

  const variants: DownloadVariant[] = [];
  const ladder = [...doc.variants]
    .sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))
    .slice(0, MAX_VARIANTS);
  ladder.forEach((v, i) => {
    const bw = v.avgBandwidth || v.bandwidth;
    const res = v.width && v.height ? `${v.width}×${v.height}` : undefined;
    variants.push({
      id: `v${i}`,
      label: v.height ? `${v.height}p` : `Quality ${i + 1}`,
      container: fmp4 ? "mp4" : "ts",
      size: durationSec && bw ? Math.round((bw / 8) * durationSec) : 0,
      url: v.url,
      protocol: "hls",
      resolution: res,
      bandwidth: bw || undefined,
      durationSec,
      note: [
        res ?? "",
        bw ? `${(bw / 1e6).toFixed(1)} Mbps` : "",
        durationSec ? fmtDur(durationSec) : "",
        segCount ? `~${segCount} segments` : "",
      ]
        .filter(Boolean)
        .join(" • "),
    });
  });

  const seenAudio = new Set<string>();
  for (const a of doc.audio) {
    if (seenAudio.has(a.url) || variants.length >= MAX_VARIANTS + 4) continue;
    seenAudio.add(a.url);
    variants.push({
      id: `a${seenAudio.size}`,
      label: `Audio — ${a.name}`,
      container: fmp4 ? "m4a" : "aac",
      size: durationSec ? Math.round((128_000 / 8) * durationSec) : 0,
      url: a.url,
      protocol: "hls",
      durationSec,
      note: "Audio track only",
    });
  }

  if (!variants.length) throw new ManifestError("The HLS master playlist lists no streams");
  return { variants, resumable: true };
}

/* ============================== DASH ============================== */

function children(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === name);
}

function childOf(el: Element, name: string): Element | undefined {
  return children(el, name)[0];
}

function hasDesc(el: Element, name: string): boolean {
  return el.getElementsByTagNameNS("*", name).length > 0 || el.getElementsByTagName(name).length > 0;
}

function isoDuration(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const m =
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
      s.trim(),
    );
  if (!m) return undefined;
  const sec =
    Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0);
  return sec > 0 ? sec : undefined;
}

function pad(v: string, width?: string): string {
  return width ? v.padStart(Number(width), "0") : v;
}

function fillTemplate(
  tpl: string,
  vals: { repId: string; bandwidth: number; num: number; time: number },
): string {
  return tpl
    .replace(/\$\$/g, " ")
    .replace(/\$RepresentationID\$/g, vals.repId)
    .replace(/\$Bandwidth(?:%0(\d+)d)?\$/g, (_m, w) => pad(String(vals.bandwidth), w))
    .replace(/\$Number(?:%0(\d+)d)?\$/g, (_m, w) => pad(String(vals.num), w))
    .replace(/\$Time(?:%0(\d+)d)?\$/g, (_m, w) => pad(String(vals.time), w))
    .replace(/ /g, "$");
}

interface DashCtx {
  mpd: Element;
  period: Element;
  mpdUrl: string;
  periodDurSec?: number | undefined;
}

function dashBaseUrl(ctx: DashCtx, as: Element, rep: Element): string {
  let base = ctx.mpdUrl;
  for (const el of [ctx.mpd, ctx.period, as, rep]) {
    const txt = childOf(el, "BaseURL")?.textContent?.trim();
    if (txt) base = abs(txt, base);
  }
  return base;
}

function expandDash(ctx: DashCtx, as: Element, rep: Element): SegmentPlan {
  const repId = rep.getAttribute("id") ?? "0";
  const bandwidth = Number(rep.getAttribute("bandwidth")) || 0;
  const base = dashBaseUrl(ctx, as, rep);
  const mime = rep.getAttribute("mimeType") ?? as.getAttribute("mimeType") ?? "";
  const container = mime.includes("webm") ? "webm" : "mp4";

  const scope = [rep, as, ctx.period];
  const tpl = scope.map((el) => childOf(el, "SegmentTemplate")).find(Boolean);
  const list = scope.map((el) => childOf(el, "SegmentList")).find(Boolean);

  if (tpl) {
    const media = tpl.getAttribute("media");
    if (!media) throw new ManifestError("DASH SegmentTemplate without a media pattern");
    const timescale = Number(tpl.getAttribute("timescale")) || 1;
    const startNumber = Number(tpl.getAttribute("startNumber")) || 1;
    const initTpl = tpl.getAttribute("initialization");
    const timeline = childOf(tpl, "SegmentTimeline");
    const segments: SegmentRef[] = [];

    if (timeline) {
      let num = startNumber;
      let t = 0;
      for (const s of children(timeline, "S")) {
        const d = Number(s.getAttribute("d")) || 0;
        if (!d) continue;
        const tAttr = s.getAttribute("t");
        if (tAttr != null) t = Number(tAttr);
        let r = Number(s.getAttribute("r") ?? 0);
        if (r < 0) {
          if (!ctx.periodDurSec) {
            throw new ManifestError(
              "Live DASH streams without a fixed duration aren't supported yet",
            );
          }
          const end = ctx.periodDurSec * timescale;
          r = Math.max(0, Math.ceil((end - t) / d) - 1);
        }
        for (let k = 0; k <= r && segments.length < MAX_SEGMENTS; k += 1) {
          segments.push({ url: abs(fillTemplate(media, { repId, bandwidth, num, time: t }), base) });
          num += 1;
          t += d;
        }
      }
    } else {
      const dur = Number(tpl.getAttribute("duration")) || 0;
      if (!dur || !ctx.periodDurSec) {
        throw new ManifestError("DASH manifest without segment timing isn't supported yet");
      }
      const count = Math.min(Math.ceil((ctx.periodDurSec * timescale) / dur), MAX_SEGMENTS);
      for (let i = 0; i < count; i += 1) {
        segments.push({
          url: abs(fillTemplate(media, { repId, bandwidth, num: startNumber + i, time: 0 }), base),
        });
      }
    }
    return {
      init: initTpl
        ? { url: abs(fillTemplate(initTpl, { repId, bandwidth, num: startNumber, time: 0 }), base) }
        : undefined,
      segments,
      container,
      durationSec: ctx.periodDurSec,
    };
  }

  if (list) {
    const initSrc = childOf(list, "Initialization")?.getAttribute("sourceURL");
    const segments = children(list, "SegmentURL")
      .map((s) => s.getAttribute("media"))
      .filter((u): u is string => !!u)
      .slice(0, MAX_SEGMENTS)
      .map((u) => ({ url: abs(u, base) }));
    return {
      init: initSrc ? { url: abs(initSrc, base) } : undefined,
      segments,
      container,
      durationSec: ctx.periodDurSec,
    };
  }

  // Single-file representation (BaseURL / SegmentBase only).
  return { segments: [{ url: base }], container, durationSec: ctx.periodDurSec };
}

function dashDoc(
  url: string,
  text: string,
): { ctx: DashCtx; adaptations: Element[]; live: boolean } {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const mpd = doc.documentElement;
  if (!mpd || mpd.localName !== "MPD") throw new ManifestError("Not a DASH manifest");
  const period = children(mpd, "Period")[0];
  if (!period) throw new ManifestError("DASH manifest has no Period");
  const periodDurSec =
    isoDuration(period.getAttribute("duration")) ??
    isoDuration(mpd.getAttribute("mediaPresentationDuration"));
  return {
    ctx: { mpd, period, mpdUrl: url, periodDurSec },
    adaptations: children(period, "AdaptationSet"),
    live: mpd.getAttribute("type") === "dynamic",
  };
}

function dashVariants(
  url: string,
  text: string,
): { variants: DownloadVariant[]; resumable: boolean } {
  const { adaptations, ctx, live } = dashDoc(url, text);
  const variants: DownloadVariant[] = [];
  let drm = false;

  for (const as of adaptations) {
    if (hasDesc(as, "ContentProtection")) {
      drm = true;
      continue;
    }
    for (const rep of children(as, "Representation")) {
      const mime = rep.getAttribute("mimeType") ?? as.getAttribute("mimeType") ?? "";
      const ctype =
        as.getAttribute("contentType") ??
        (mime.startsWith("audio") ? "audio" : mime.startsWith("text") ? "text" : "video");
      if (ctype === "text") continue;
      const bw = Number(rep.getAttribute("bandwidth")) || 0;
      const w = Number(rep.getAttribute("width") ?? as.getAttribute("width")) || 0;
      const h = Number(rep.getAttribute("height") ?? as.getAttribute("height")) || 0;
      const isVideo = ctype === "video";
      const res = w && h ? `${w}×${h}` : undefined;
      variants.push({
        id: `r${variants.length}`,
        label: isVideo
          ? h
            ? `${h}p`
            : `Video ${variants.length + 1}`
          : `Audio — ${bw ? `${Math.round(bw / 1000)} kbps` : "track"}`,
        container: mime.includes("webm") ? "webm" : isVideo ? "mp4" : "m4a",
        size: ctx.periodDurSec && bw ? Math.round((bw / 8) * ctx.periodDurSec) : 0,
        url,
        repId: rep.getAttribute("id") ?? String(variants.length),
        protocol: "dash",
        resolution: res,
        bandwidth: bw || undefined,
        durationSec: ctx.periodDurSec,
        note: [
          res ?? "",
          bw ? `${(bw / 1e6).toFixed(2)} Mbps` : "",
          ctx.periodDurSec ? fmtDur(ctx.periodDurSec) : "",
          live ? "live" : "",
          isVideo ? "video track" : "audio track only",
        ]
          .filter(Boolean)
          .join(" • "),
      });
    }
  }

  if (!variants.length) {
    if (drm) {
      throw new ManifestError("This DASH stream is DRM-protected — DDM can't save protected media");
    }
    throw new ManifestError("The DASH manifest lists no playable representations");
  }

  variants.sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0));
  return { variants: variants.slice(0, MAX_VARIANTS), resumable: true };
}

/* ========================= public entry points ========================= */

/**
 * Reads a manifest URL and returns real stream variants, or null when the
 * URL is not actually a manifest (or the host blocks the read).
 * Throws ManifestError for encrypted/DRM streams so the user sees why.
 */
export async function probeStream(
  url: string,
): Promise<{ variants: DownloadVariant[]; resumable: boolean } | null> {
  let text: string;
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    text = await res.text();
  } catch {
    return null; // CORS-blocked — caller falls back to the generic probe
  }
  const head = text.slice(0, 512);
  const ext = guessExt(url);
  if (head.startsWith("#EXTM3U")) return hlsVariants(url, text);
  if (/<MPD[\s>]/.test(head) || ext === "mpd") return dashVariants(url, text);
  if (ext === "m3u8" || ext === "m3u") return hlsVariants(url, text);
  return null;
}

/**
 * Expands a stream variant into the ordered segment list the engine downloads.
 * Always re-reads the manifest so paused/resumed transfers get fresh URLs.
 */
export async function resolveSegments(opts: {
  protocol: StreamProtocol;
  url: string;
  repId?: string | undefined;
}): Promise<SegmentPlan> {
  const res = await fetch(opts.url, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new ManifestError(`Manifest request failed (HTTP ${res.status})`);
  const text = await res.text();

  if (opts.protocol === "hls") {
    let doc = parseHls(opts.url, text);
    if (doc.kind === "master") {
      const best = [...doc.variants].sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
      if (!best) throw new ManifestError("The HLS master playlist lists no streams");
      const r2 = await fetch(best.url, { mode: "cors", credentials: "omit" });
      if (!r2.ok) throw new ManifestError(`Variant playlist failed (HTTP ${r2.status})`);
      doc = parseHls(best.url, await r2.text());
    }
    if (doc.kind !== "media") throw new ManifestError("Could not resolve an HLS media playlist");
    if (doc.encrypted) {
      throw new ManifestError("This HLS stream is encrypted — DDM can't save protected media");
    }
    return {
      init: doc.init,
      segments: doc.segments.slice(0, MAX_SEGMENTS),
      container: doc.fmp4 ? "mp4" : "ts",
      durationSec: doc.durationSec || undefined,
    };
  }

  const { ctx, adaptations } = dashDoc(opts.url, text);
  for (const as of adaptations) {
    if (hasDesc(as, "ContentProtection")) continue;
    for (const rep of children(as, "Representation")) {
      if ((rep.getAttribute("id") ?? "") === (opts.repId ?? "")) {
        return expandDash(ctx, as, rep);
      }
    }
  }
  throw new ManifestError("The chosen quality is no longer in the manifest — refresh the link");
}
