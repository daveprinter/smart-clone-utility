import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bookmark,
  Check,
  ClipboardPaste,
  Copy,
  Download,
  FileDown,
  MousePointerClick,
  Play,
  Puzzle,
  Radar,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/ddm/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useDdm } from "@/lib/ddm/store";
import { buildBookmarklet } from "@/lib/ddm/bookmarklet";
import { fileNameFromUrl, kindFromUrl } from "@/lib/ddm/format";

export const Route = createFileRoute("/detector")({
  head: () => ({
    meta: [
      { title: "Detector — DDM" },
      {
        name: "description",
        content:
          "Install the DDM Catch button to pop a download icon over videos and grab downloads before the browser does.",
      },
      { property: "og:title", content: "Detector — DDM" },
      {
        property: "og:description",
        content:
          "Install the DDM Catch button to pop a download icon over videos and grab downloads before the browser does.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DetectorPage,
});

const DEMO_MEDIA = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const DEMO_LINKS = [
  { url: DEMO_MEDIA, label: "flower.mp4 — sample video" },
  {
    url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    label: "dummy.pdf — sample document",
  },
  { url: "https://speed.hetzner.de/100MB.bin", label: "100MB.bin — large test file" },
];

function catchNow(url: string) {
  window.dispatchEvent(new CustomEvent("ddm:catch", { detail: url }));
}

function DetectorPage() {
  const { settings, updateSettings } = useDdm();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const bookmarklet = origin ? buildBookmarklet(origin) : "#";

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setCopied(true);
      toast.success("Bookmarklet code copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select the code manually");
    }
  };

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Detector</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        DDM watches the web for anything downloadable. Press the catch button on a page and a
        download badge pops up over videos and files — before the browser's own download manager
        ever sees them.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="lg:row-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Puzzle className="h-4 w-4 text-primary" /> DDM Catch button
            </CardTitle>
            <CardDescription>
              One click on any page lists its videos, audio and files with a Download button each.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4 text-center">
              <a
                href={bookmarklet}
                onClick={(e) => e.preventDefault()}
                className="inline-flex cursor-move items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow"
                title="Drag me to your bookmarks bar"
              >
                <Radar className="h-4 w-4" /> DDM Catch
              </a>
              <p className="mt-2 text-xs text-muted-foreground">
                Drag this button to your browser's bookmarks bar
              </p>
            </div>

            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Badge variant="outline" className="h-5 shrink-0 font-mono text-[10px]">1</Badge>
                Show the bookmarks bar (Ctrl/Cmd + Shift + B) and drag the button onto it.
              </li>
              <li className="flex gap-2">
                <Badge variant="outline" className="h-5 shrink-0 font-mono text-[10px]">2</Badge>
                On any page with media, press <span className="text-foreground">DDM Catch</span> —
                a panel pops up listing everything downloadable.
              </li>
              <li className="flex gap-2">
                <Badge variant="outline" className="h-5 shrink-0 font-mono text-[10px]">3</Badge>
                Press Download on an item and DDM opens with qualities, formats and sizes ready.
              </li>
              <li className="flex gap-2">
                <Badge variant="outline" className="h-5 shrink-0 font-mono text-[10px]">4</Badge>
                Optional: arm <span className="text-foreground">click interception</span> in the
                panel so pressing a download link on the page hands it to DDM before the browser
                saves it.
              </li>
            </ol>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Or copy the code and create the bookmark manually:
              </p>
              <div className="flex gap-2">
                <code className="max-h-16 flex-1 overflow-hidden rounded-md border border-border bg-secondary/40 p-2 font-mono text-[10px] text-muted-foreground">
                  {bookmarklet.slice(0, 180)}…
                </code>
                <Button variant="outline" size="sm" onClick={copyBookmarklet} className="shrink-0 gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
              <Bookmark className="mr-1 inline h-3.5 w-3.5 text-primary" />
              On Android Chrome, create the bookmark from the copied code, then run it by typing
              its name in the address bar while on the page.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Video className="h-4 w-4 text-primary" /> Try it right here
            </CardTitle>
            <CardDescription>
              Hover the video — the catch badge pops up, exactly like on a media page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="group relative overflow-hidden rounded-lg border border-border">
              <video src={DEMO_MEDIA} controls preload="metadata" className="aspect-video w-full" />
              <button
                onClick={() => catchNow(DEMO_MEDIA)}
                className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground opacity-0 shadow-glow transition-opacity group-hover:opacity-100"
              >
                <Download className="h-3.5 w-3.5" /> Download this video
              </button>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MousePointerClick className="h-3.5 w-3.5" />
                These links are intercepted — press one and DDM grabs it before the browser:
              </p>
              <div className="space-y-1.5">
                {DEMO_LINKS.map((l) => {
                  const kind = kindFromUrl(l.url);
                  return (
                    <button
                      key={l.url}
                      onClick={() => catchNow(l.url)}
                      className="flex w-full items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-left text-sm transition-colors hover:border-primary/60"
                    >
                      <FileDown className="h-4 w-4 shrink-0 text-primary" />
                      <span className="flex-1 truncate">{l.label}</span>
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {kind}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardPaste className="h-4 w-4 text-primary" /> Clipboard monitor
            </CardTitle>
            <CardDescription>
              Copy a link anywhere, switch back, and DDM pops the download dialog automatically.
              Requires the clipboard permission.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Watch clipboard for links</p>
                <p className="text-xs text-muted-foreground">
                  {settings.permissions.clipboard
                    ? "Permission granted — new links open the download dialog."
                    : "Grant the clipboard permission in Settings first."}
                </p>
              </div>
              <Switch
                checked={settings.permissions.clipboard}
                onCheckedChange={(v) =>
                  updateSettings({ permissions: { ...settings.permissions, clipboard: v } })
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <HowItWorks
          icon={Radar}
          title="Detect"
          text="Videos, audio and direct file links are found on the page and listed with type and name."
        />
        <HowItWorks
          icon={MousePointerClick}
          title="Intercept"
          text="Armed interception catches download clicks before the browser's download manager."
        />
        <HowItWorks
          icon={Play}
          title="Download"
          text="DDM opens with every quality and format, sizes included — pick one and it queues at full speed."
        />
      </div>
    </AppShell>
  );
}

function HowItWorks({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Radar;
  title: string;
  text: string;
}) {
  return (
    <div className="panel p-4">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-2 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
