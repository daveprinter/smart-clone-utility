import { ExternalLink, RefreshCw, X } from "lucide-react";
import { useDdm } from "@/lib/ddm/store";
import { Button } from "@/components/ui/button";

/**
 * "Waiting" floating bubble — mirrors the Android overlay. Shown when a
 * download link expired and the transfer needs a fresh URL.
 */
export function FloatingBubble() {
  const { waitingItem, refreshLink, remove } = useDdm();
  if (!waitingItem) return null;

  const openSource = () => {
    try {
      const origin = new URL(waitingItem.url).origin;
      window.open(origin, "_blank", "noopener");
    } catch {
      /* invalid url */
    }
  };

  return (
    <div className="fixed bottom-24 right-4 z-40 w-[min(20rem,calc(100vw-2rem))] panel p-3 shadow-glow md:bottom-6">
      <div className="flex items-start gap-3">
        <span className="relative mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warning/15">
          <span className="absolute inset-0 animate-ping rounded-full bg-warning/20" />
          <RefreshCw className="h-4 w-4 animate-spin text-warning" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Waiting…</p>
          <p className="truncate text-xs text-muted-foreground">{waitingItem.name}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Open the source page, then press Download again to refresh the link. Progress is kept.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={openSource}>
              <ExternalLink className="h-3.5 w-3.5" /> Open source
            </Button>
            <Button size="sm" onClick={() => refreshLink(waitingItem.id)}>
              Download
            </Button>
          </div>
        </div>
        <button
          onClick={() => remove(waitingItem.id)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
