import { Copy, FolderOpen, PlayCircle, Repeat } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDdm } from "@/lib/ddm/store";
import type { DownloadItem } from "@/lib/ddm/types";

export function DuplicateDialog({
  item,
  onClose,
  onCopy,
  onOverwrite,
}: {
  item: DownloadItem | null;
  onClose: () => void;
  onCopy: () => void;
  onOverwrite: () => void;
}) {
  const { resume } = useDdm();
  if (!item) return null;
  const finished = item.status === "completed";

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>This file is already in DDM</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{item.name}</span> —{" "}
            {finished ? "already downloaded" : "unfinished transfer"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {finished ? (
            <Button
              variant="secondary"
              onClick={() => {
                toast.info("Opening file location", { description: item.savePath });
                onClose();
              }}
            >
              <FolderOpen className="h-4 w-4" /> Open file location
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                resume(item.id);
                onClose();
              }}
            >
              <PlayCircle className="h-4 w-4" /> Resume existing download
            </Button>
          )}
          <Button variant="outline" onClick={onOverwrite}>
            <Repeat className="h-4 w-4" /> Overwrite
          </Button>
          <Button variant="outline" onClick={onCopy}>
            <Copy className="h-4 w-4" /> Save as a copy
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
