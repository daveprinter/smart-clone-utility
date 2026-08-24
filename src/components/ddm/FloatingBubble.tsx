import { Download, ExternalLink, RefreshCw, X } from "lucide-react";
import { useDdm } from "@/lib/ddm/store";
import { Button } from "@/components/ui/button";

/**
 * Floating bubble — mirrors the Android overlay.
 * - When a download link expired, shows the "Waiting…" panel so the user can
 *   open the source page and refresh the link without losing progress.
 * - Otherwise (when the bubble is enabled in Settings) shows a small catch
 *   button, like the one DDM floats over the browser while minimised: press
 *   it to grab a copied link and open the download dialog.
 */
export function FloatingBubble() {
  const { waitingItem, refreshLink, remove, settings } = useDdm();

  if (!waitingItem) {
    if (!settings.onboarded || !settings.floatingBubbleAndroid) return null;
    return (
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("ddm:catch"))}
        className="fixed bottom-24 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow transition-transform hover:scale-105 md:bottom-6"
        aria-label="Catch a download link"
        title="Catch a download link"
      >
        <Download className="h-5 w-5" />
      </button>
    );
  }

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
