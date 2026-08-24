import { useEffect, useState } from "react";
import { FolderOpen, Link2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDdm } from "@/lib/ddm/store";
import { probeLink, type ProbeResult } from "@/lib/ddm/probe";
import { formatBytes } from "@/lib/ddm/format";
import type { DownloadItem } from "@/lib/ddm/types";
import { DuplicateDialog } from "./DuplicateDialog";

export function AddDownloadDialog({
  open,
  onOpenChange,
  initialUrl = "",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialUrl?: string;
}) {
  const { addDownload, settings, findByUrlOrName } = useDdm();
  const [url, setUrl] = useState(initialUrl);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [variantId, setVariantId] = useState<string>("");
  const [name, setName] = useState("");
  const [path, setPath] = useState(settings.defaultSavePath);
  const [duplicate, setDuplicate] = useState<DownloadItem | null>(null);

  const reset = () => {
    setProbe(null);
    setVariantId("");
    setName("");
  };

  const analyse = async (target?: string) => {
    const link = (target ?? url).trim();
    if (!link) return;
    setLoading(true);
    try {
      const result = await probeLink(link);
      setProbe(result);
      setVariantId(result.variants[0]?.id ?? "");
      setName(result.name);
      setPath(settings.defaultSavePath);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Could not analyse that link");
    } finally {
      setLoading(false);
    }
  };

  // Sync when opened with a caught link (bookmarklet, clipboard, bubble,
  // intercepted click): prefill the URL and analyse it immediately.
  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl);
    setProbe(null);
    setVariantId("");
    setName("");
    setPath(settings.defaultSavePath);
    if (initialUrl.trim()) void analyse(initialUrl.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialUrl]);

  const pickFolder = async () => {
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<{ name: string }> })
      .showDirectoryPicker;
    if (!picker) return;
    try {
      const dir = await picker();
      setPath(dir.name);
    } catch {
      /* cancelled */
    }
  };

  const commit = (finalName: string) => {
    const variant = probe?.variants.find((v) => v.id === variantId);
    if (!probe || !variant) return;
    addDownload({
      url: url.trim(),
      name: finalName,
      variant,
      savePath: path,
      resumable: probe.resumable,
    });
    toast.success("Added to queue", { description: finalName });
    onOpenChange(false);
    reset();
    setUrl("");
  };

  const submit = () => {
    const variant = probe?.variants.find((v) => v.id === variantId);
    if (!probe || !variant) return;
    const finalName = withExt(name || probe.name, variant.container);
    const existing = findByUrlOrName(url.trim(), finalName);
    if (existing) {
      setDuplicate(existing);
      return;
    }
    commit(finalName);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          onOpenChange(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New download</DialogTitle>
            <DialogDescription>
              Paste a link — DDM inspects it for available formats, qualities and sizes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">Link</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="url"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      reset();
                    }}
                    placeholder="https://example.com/video.mp4"
                    className="pl-9 font-mono text-xs"
                  />
                </div>
                <Button onClick={() => void analyse()} disabled={loading || !url.trim()}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Fetch
                </Button>
              </div>
            </div>

            {probe && (
              <>
                <div className="space-y-2">
                  <Label>Available formats</Label>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {probe.variants.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setVariantId(v.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2 text-left transition-colors hover:border-primary/60",
                          variantId === v.id && "border-primary bg-primary/10",
                        )}
                      >
                        <Badge variant="outline" className="font-mono text-[10px] uppercase">
                          {v.container}
                        </Badge>
                        <span className="flex-1">
                          <span className="block text-sm">{v.label}</span>
                          {v.note && (
                            <span className="block text-[11px] text-muted-foreground">{v.note}</span>
                          )}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatBytes(v.size ?? 0)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="fname">File name</Label>
                  <Input id="fname" value={name} onChange={(e) => setName(e.target.value)} />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="fpath">Save to</Label>
                  <div className="flex gap-2">
                    <Input
                      id="fpath"
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <Button variant="secondary" onClick={pickFolder}>
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                  <span>Resume support</span>
                  <span className={probe.resumable ? "text-success" : "text-warning"}>
                    {probe.resumable ? "Range requests supported" : "Restart required"}
                  </span>
                </div>

                <Button className="w-full" onClick={submit}>
                  Download
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DuplicateDialog
        item={duplicate}
        onClose={() => setDuplicate(null)}
        onCopy={() => {
          const base = name || probe?.name || "download";
          setDuplicate(null);
          commit(copyName(base));
        }}
        onOverwrite={() => {
          setDuplicate(null);
          commit(withExt(name, probe?.variants.find((v) => v.id === variantId)?.container ?? "bin"));
        }}
      />
    </>
  );
}

function withExt(name: string, container: string) {
  if (!name) return `download.${container}`;
  return name.toLowerCase().endsWith(`.${container.toLowerCase()}`)
    ? name
    : `${name.replace(/\.[^.]+$/, "")}.${container}`;
}

function copyName(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name} (1)`;
  return `${name.slice(0, dot)} (1)${name.slice(dot)}`;
}
