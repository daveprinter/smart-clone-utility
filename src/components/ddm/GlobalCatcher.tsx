import { useCallback, useEffect, useRef, useState } from "react";
import { useDdm } from "@/lib/ddm/store";
import { AddDownloadDialog } from "./AddDownloadDialog";

const URL_RE = /^https?:\/\//i;

async function readClipboard(): Promise<string> {
  try {
    return (await navigator.clipboard.readText()).trim();
  } catch {
    return "";
  }
}

/**
 * App-wide link catcher. Receives URLs from every detection channel and opens
 * the New Download dialog with the link pre-filled and pre-analysed:
 *  - `?add=<url>` hand-off used by the DDM Catch bookmarklet;
 *  - `ddm:catch` CustomEvents (floating bubble, Detector demo, same-tab catches);
 *  - clipboard monitoring while the app is focused (when permission granted).
 */
export function GlobalCatcher() {
  const { ready, settings } = useDdm();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const lastRef = useRef("");

  const catchLink = useCallback((raw: string) => {
    const clean = raw.trim();
    if (!URL_RE.test(clean)) return;
    lastRef.current = clean;
    setUrl(clean);
    setOpen(true);
  }, []);

  const openEmpty = useCallback(() => {
    setUrl("");
    setOpen(true);
  }, []);

  // Bookmarklet / deep-link hand-off: <origin>/?add=<url>
  useEffect(() => {
    if (!ready) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const add = params.get("add");
      if (!add) return;
      catchLink(add);
      params.delete("add");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
      );
    } catch {
      /* noop */
    }
  }, [ready, catchLink]);

  // Same-tab catches: floating bubble, Detector page demo, in-app intercepts.
  useEffect(() => {
    const onCatch = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && URL_RE.test(detail.trim())) {
        catchLink(detail);
        return;
      }
      // No URL supplied: try the clipboard, else just open the dialog.
      void readClipboard().then((text) => {
        if (URL_RE.test(text)) catchLink(text);
        else openEmpty();
      });
    };
    window.addEventListener("ddm:catch", onCatch);
    return () => window.removeEventListener("ddm:catch", onCatch);
  }, [catchLink, openEmpty]);

  // Clipboard monitor: catches links copied from the browser while DDM runs.
  useEffect(() => {
    if (!ready || !settings.permissions.clipboard) return;
    let checking = false;
    const check = async () => {
      if (checking || !document.hasFocus() || open) return;
      checking = true;
      const text = await readClipboard();
      checking = false;
      if (URL_RE.test(text) && text !== lastRef.current) catchLink(text);
    };
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void check(), 4000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [ready, settings.permissions.clipboard, open, catchLink]);

  return <AddDownloadDialog open={open} onOpenChange={setOpen} initialUrl={url} />;
}
