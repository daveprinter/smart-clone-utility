import type { MediaKind } from "./types";

export function formatBytes(bytes: number, digits = 1): string {
  if (!bytes || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatSpeed(bps: number): string {
  if (!bps || bps < 1) return "0 B/s";
  return `${formatBytes(bps)}/s`;
}

export function formatEta(remaining: number, bps: number): string {
  if (!bps || !remaining || remaining <= 0) return "—";
  const s = Math.round(remaining / bps);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

const EXT_KIND: Record<string, MediaKind> = {
  mp4: "video",
  webm: "video",
  mkv: "video",
  ts: "video",
  m3u8: "video",
  mpd: "video",
  mov: "video",
  avi: "video",
  mp3: "audio",
  m4a: "audio",
  aac: "audio",
  wav: "audio",
  flac: "audio",
  ogg: "audio",
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  tar: "archive",
  gz: "archive",
  iso: "archive",
  apk: "archive",
  exe: "archive",
  pdf: "document",
  doc: "document",
  docx: "document",
  xlsx: "document",
  pptx: "document",
  txt: "document",
};

export function guessExt(url: string): string {
  try {
    const clean = (url.split("?")[0] ?? "").split("#")[0] ?? "";
    const last = clean.split("/").filter(Boolean).pop() ?? "";
    const parts = last.split(".");
    if (parts.length > 1) return parts.pop()!.toLowerCase();
  } catch {
    /* noop */
  }
  return "bin";
}

export function kindFromUrl(url: string): MediaKind {
  return EXT_KIND[guessExt(url)] ?? "file";
}

export function fileNameFromUrl(url: string): string {
  try {
    const clean = (url.split("?")[0] ?? "").split("#")[0] ?? "";
    const last = decodeURIComponent(clean.split("/").filter(Boolean).pop() ?? "");
    return last || `download-${Date.now()}.${guessExt(url)}`;
  } catch {
    return `download-${Date.now()}`;
  }
}
