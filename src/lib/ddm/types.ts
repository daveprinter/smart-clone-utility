export type DeviceMode = "desktop" | "android" | "auto";
export type ResolvedDevice = "desktop" | "android";

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "waiting-refresh";

export type MediaKind = "video" | "audio" | "image" | "archive" | "document" | "file";

export type StreamProtocol = "hls" | "dash";

export interface DownloadVariant {
  id: string;
  label: string; // e.g. "1080p"
  container: string; // mp4 / ts / webm / m3u8
  size?: number | undefined; // bytes, may be unknown
  url: string;
  note?: string | undefined;
  /** Set when the variant comes from an HLS/DASH manifest. */
  protocol?: StreamProtocol | undefined;
  /** DASH representation id inside the MPD. */
  repId?: string | undefined;
  resolution?: string | undefined;
  bandwidth?: number | undefined; // bits/s from the manifest
  durationSec?: number | undefined;
}

export interface DownloadItem {
  id: string;
  name: string;
  url: string;
  kind: MediaKind;
  container: string;
  quality?: string | undefined;
  size: number; // 0 when unknown
  received: number;
  status: DownloadStatus;
  speed: number; // bytes/s
  savePath: string;
  createdAt: number;
  finishedAt?: number | undefined;
  error?: string | undefined;
  resumable: boolean;
  segments: number;
  /** Streaming downloads (HLS/DASH manifest source). */
  protocol?: StreamProtocol | undefined;
  repId?: string | undefined;
  segmentsTotal?: number | undefined;
  segmentsDone?: number | undefined;
  /** SHA-256 (hex) of the finished file, when integrity verification is on. */
  checksum?: string | undefined;
}

export interface Settings {
  deviceMode: DeviceMode;
  defaultSavePath: string;
  maxSpeedKbps: number; // 0 = unlimited (use maximum attainable)
  maxConcurrent: number;
  autoStart: boolean;
  autoPauseOnLowBattery: boolean;
  verifyIntegrity: boolean;
  backgroundServiceAndroid: boolean;
  floatingBubbleAndroid: boolean;
  interceptBrowserDownloads: boolean;
  detectStreamingMedia: boolean;
  segmentsPerDownload: number;
  notifyOnComplete: boolean;
  onboarded: boolean;
  permissions: Record<PermissionKey, boolean>;
}

export type PermissionKey =
  | "storage"
  | "notifications"
  | "background"
  | "overlay"
  | "network"
  | "clipboard";

export interface SpeedTestResult {
  at: number;
  downMbps: number;
  upMbps: number;
  pingMs: number;
  jitterMs: number;
}
