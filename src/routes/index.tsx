import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardPaste, Download, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/ddm/AppShell";
import { AddDownloadDialog } from "@/components/ddm/AddDownloadDialog";
import { DownloadRow } from "@/components/ddm/DownloadRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDdm } from "@/lib/ddm/store";
import { formatBytes, formatSpeed } from "@/lib/ddm/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DDM — Dev Download Manager" },
      {
        name: "description",
        content:
          "Grab media and file links, pick quality and format, then download at full speed with pause, resume and link refresh.",
      },
      { property: "og:title", content: "DDM — Dev Download Manager" },
      {
        property: "og:description",
        content:
          "Grab media and file links, pick quality and format, then download at full speed with pause, resume and link refresh.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const FILTERS = ["all", "downloading", "queued", "paused", "completed", "failed"] as const;

function Index() {
  const { items, totalSpeed } = useDdm();
  const [open, setOpen] = useState(false);
  const [initialUrl, setInitialUrl] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");

  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          (filter === "all" || i.status === filter) &&
          (!q || i.name.toLowerCase().includes(q.toLowerCase())),
      ),
    [items, filter, q],
  );

  const totalBytes = items.reduce((a, i) => a + i.received, 0);
  const done = items.filter((i) => i.status === "completed").length;

  const pasteAndAdd = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !/^https?:\/\//i.test(text.trim())) {
        toast.error("Clipboard has no link");
        return;
      }
      setInitialUrl(text.trim());
      setOpen(true);
    } catch {
      setInitialUrl("");
      setOpen(true);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Downloads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} in library · {done} completed · {formatBytes(totalBytes)} transferred ·{" "}
            {formatSpeed(totalSpeed)} now
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={pasteAndAdd} className="gap-2">
            <ClipboardPaste className="h-4 w-4" /> Paste link
          </Button>
          <Button
            onClick={() => {
              setInitialUrl("");
              setOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> New download
          </Button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f} value={f} className="capitalize text-xs">
                {f}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by file name"
            className="pl-9"
          />
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {shown.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <Download className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Nothing here yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste a link, or install the browser catcher from the Detector tab so DDM intercepts
              downloads before the browser takes them.
            </p>
          </div>
        ) : (
          shown.map((item) => <DownloadRow key={item.id} item={item} />)
        )}
      </div>

      <AddDownloadDialog open={open} onOpenChange={setOpen} initialUrl={initialUrl} />
    </AppShell>
  );
}
