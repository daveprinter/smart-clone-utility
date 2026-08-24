import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Gauge, Timer, Waves } from "lucide-react";
import { AppShell } from "@/components/ddm/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useDdm } from "@/lib/ddm/store";
import { measureDownload, measurePing, measureUpload } from "@/lib/ddm/speedtest";

export const Route = createFileRoute("/speed-test")({
  head: () => ({
    meta: [
      { title: "Internet Speed Test — DDM" },
      {
        name: "description",
        content:
          "Measure download, upload, ping and jitter with parallel streams, then size your DDM speed cap from the result.",
      },
      { property: "og:title", content: "Internet Speed Test — DDM" },
      {
        property: "og:description",
        content:
          "Measure download, upload, ping and jitter with parallel streams, then size your DDM speed cap from the result.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SpeedTestPage,
});

type Phase = "idle" | "ping" | "download" | "upload" | "done";

function SpeedTestPage() {
  const { speedTests, addSpeedTest, updateSettings } = useDdm();
  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    downMbps: number;
    upMbps: number;
    pingMs: number;
    jitterMs: number;
  } | null>(null);
  const running = useRef(false);

  const run = async () => {
    if (running.current) return;
    running.current = true;
    setResult(null);
    setLive(0);
    setProgress(0);

    setPhase("ping");
    const { pingMs, jitterMs } = await measurePing();

    setPhase("download");
    const downMbps = await measureDownload((s) => {
      setLive(s.mbps);
      setProgress(s.progress);
    });

    setPhase("upload");
    setLive(0);
    setProgress(0);
    const upMbps = await measureUpload((s) => {
      setLive(s.mbps);
      setProgress(s.progress);
    });

    const r = { at: Date.now(), downMbps, upMbps, pingMs, jitterMs };
    addSpeedTest(r);
    setResult(r);
    setPhase("done");
    running.current = false;
  };

  const latest = result ?? speedTests[0] ?? null;

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Internet speed test</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Runs parallel streams, exactly like the download engine, so the number reflects the speed
        DDM can actually reach.
      </p>

      <Card className="mt-6">
        <CardContent className="flex flex-col items-center gap-5 py-10">
          <div className="relative grid h-44 w-44 place-items-center rounded-full border-4 border-border">
            <div className="text-center">
              <p className="font-mono text-4xl font-semibold tabular-nums">
                {(phase === "download" || phase === "upload" ? live : (latest?.downMbps ?? 0)).toFixed(1)}
              </p>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Mbps</p>
            </div>
          </div>

          {phase !== "idle" && phase !== "done" && (
            <div className="w-full max-w-sm space-y-2">
              <p className="text-center text-xs uppercase tracking-widest text-muted-foreground">
                {phase === "ping" ? "Measuring latency" : `Measuring ${phase}`}
              </p>
              <Progress value={Math.round(progress * 100)} />
            </div>
          )}

          <Button size="lg" onClick={() => void run()} disabled={phase !== "idle" && phase !== "done"}>
            <Gauge className="mr-2 h-4 w-4" />
            {phase === "idle" ? "Start test" : phase === "done" ? "Test again" : "Testing…"}
          </Button>
        </CardContent>
      </Card>

      {latest && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={ArrowDown} label="Download" value={`${latest.downMbps.toFixed(2)} Mbps`} />
          <Stat icon={ArrowUp} label="Upload" value={`${latest.upMbps.toFixed(2)} Mbps`} />
          <Stat icon={Timer} label="Ping" value={`${latest.pingMs} ms`} />
          <Stat icon={Waves} label="Jitter" value={`${latest.jitterMs} ms`} />
        </div>
      )}

      {latest && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle className="text-base">Apply to downloads</CardTitle>
            <CardDescription>
              Uncapped is recommended. You can also cap DDM at 80% of this line so browsing stays
              responsive.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => updateSettings({ maxSpeedKbps: 0 })}>
              Use maximum speed
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  maxSpeedKbps: Math.max(64, Math.round(((latest.downMbps * 0.8) / 8) * 1024)),
                })
              }
            >
              Cap at 80% ({((latest.downMbps * 0.8) / 8).toFixed(1)} MB/s)
            </Button>
          </CardContent>
        </Card>
      )}

      {speedTests.length > 1 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-muted-foreground">History</h2>
          <div className="mt-2 divide-y divide-border rounded-lg border border-border">
            {speedTests.map((s) => (
              <div key={s.at} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">
                  {new Date(s.at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                <span className="font-mono text-xs tabular-nums">
                  ↓ {s.downMbps.toFixed(1)} · ↑ {s.upMbps.toFixed(1)} Mbps · {s.pingMs} ms
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ArrowDown;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </p>
        <p className="mt-2 font-mono text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
