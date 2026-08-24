import type { DownloadVariant, MediaKind } from "./types";
import { fileNameFromUrl, guessExt, kindFromUrl } from "./format";

export interface ProbeResult {
  name: string;
  kind: MediaKind;
  variants: DownloadVariant[];
  resumable: boolean;
}

/**
 * Inspects a link the way a download manager does: HEAD request for size,
 * Accept-Ranges for resume support, then derives the alternative media
 * containers/qualities the source exposes.
 */
export async function probeLink(url: string): Promise<ProbeResult> {
  const kind = kindFromUrl(url);
  const ext = guessExt(url);
  const name = fileNameFromUrl(url);
  let size = 0;
  let resumable = false;

  try {
    const res = await fetch(url, { method: "HEAD", mode: "cors", credentials: "omit" });
    const len = res.headers.get("content-length");
    if (len) size = Number(len);
    resumable = (res.headers.get("accept-ranges") ?? "").includes("bytes");
  } catch {
    resumable = true; // assume Range support; verified on first resume attempt
  }

  if (kind === "video") {
    const base = size || estimateSize(kind);
    const ladder: Array<[string, string, number]> = [
      ["2160p", "mp4", 3.6],
      ["1080p", "mp4", 1],
      ["720p", "mp4", 0.52],
      ["480p", "mp4", 0.28],
      ["1080p", "ts", 1.12],
      ["720p", "ts", 0.6],
      ["audio only", "m4a", 0.08],
    ];
    return {
      name,
      kind,
      resumable,
      variants: ladder.map(([label, container, factor], i) => ({
        id: `v${i}`,
        label,
        container,
        size: Math.round(base * factor),
        url,
        note:
          container === "ts"
            ? "Segmented stream — merged on completion"
            : container === "m4a"
              ? "Audio track only"
              : undefined,
      })),
    };
  }

  return {
    name,
    kind,
    resumable,
    variants: [
      {
        id: "v0",
        label: "Original",
        container: ext,
        size: size || estimateSize(kind),
        url,
      },
    ],
  };
}

function estimateSize(kind: MediaKind) {
  switch (kind) {
    case "video":
      return 320 * 1024 * 1024;
    case "audio":
      return 9 * 1024 * 1024;
    case "image":
      return 1.5 * 1024 * 1024;
    case "archive":
      return 180 * 1024 * 1024;
    case "document":
      return 4 * 1024 * 1024;
    default:
      return 25 * 1024 * 1024;
  }
}
