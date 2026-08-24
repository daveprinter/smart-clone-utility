import {
  FileArchive,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Music,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useDdm } from "@/lib/ddm/store";
import { formatBytes, formatEta, formatSpeed } from "@/lib/ddm/format";
import type { DownloadItem } from "@/lib/ddm/types";
import { cn } from "@/lib/utils";

const ICONS = {
  video: Video,
  audio: Music,
  image: ImageIcon,
  archive: FileArchive,
  document: FileText,
  file: FileText,
};

const STATUS_STYLE: Record<DownloadItem["status"], string> = {
  queued: "text-muted-foreground",
  downloading: "text-accent",
  paused: "text-warning",
  completed: "text-success",
  failed: "text-destructive",
  "waiting-refresh": "text-warning",
};

export function DownloadRow({ item }: { item: DownloadItem }) {
  const { pause, resume, remove, markWaitingRefresh } = useDdm();
  const Icon = ICONS[item.kind] ?? FileText;
  const pct = item.size ? Math.min(100, (item.received / item.size) * 100) : 0;

  return (
    <div className="panel p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-secondary text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</p>
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {item.container}
            </Badge>
            {item.quality && (
              <Badge variant="secondary" className="text-[10px]">
                {item.quality}
              </Badge>
            )}
          </div>

          <Progress
            value={pct}
            className={cn("mt-2 h-2", item.status === "downloading" && "stripes")}
          />

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span className={STATUS_STYLE[item.status]}>
              {item.status === "waiting-refresh" ? "waiting for fresh link" : item.status}
            </span>
            <span>
              {formatBytes(item.received)} / {formatBytes(item.size)} ({pct.toFixed(1)}%)
            </span>
            {item.status === "downloading" && (
              <>
                <span>{formatSpeed(item.speed)}</span>
                <span>ETA {formatEta(item.size - item.received, item.speed)}</span>
              </>
            )}
            <span className="truncate">{item.savePath}</span>
          </div>
          {item.error && <p className="mt-1 text-[11px] text-destructive">{item.error}</p>}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row">
          {item.status === "downloading" ? (
            <Button size="icon" variant="ghost" onClick={() => pause(item.id)} aria-label="Pause">
              <Pause className="h-4 w-4" />
            </Button>
          ) : item.status === "completed" ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Open location"
              onClick={() => toast.info("Opening file location", { description: item.savePath })}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" variant="ghost" onClick={() => resume(item.id)} aria-label="Resume">
              <Play className="h-4 w-4" />
            </Button>
          )}
          {item.status !== "completed" && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Refresh link"
              onClick={() => markWaitingRefresh(item.id)}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => remove(item.id)}
            aria-label="Remove"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
