import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen, Gauge, HardDrive, Monitor, Shield, Smartphone, Zap } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/ddm/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDdm } from "@/lib/ddm/store";
import type { DeviceMode, PermissionKey } from "@/lib/ddm/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — DDM" },
      {
        name: "description",
        content:
          "Set the save folder, speed cap, simultaneous downloads, segments and device profile for DDM.",
      },
      { property: "og:title", content: "Settings — DDM" },
      {
        property: "og:description",
        content:
          "Set the save folder, speed cap, simultaneous downloads, segments and device profile for DDM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const PERMISSIONS: Array<{ key: PermissionKey; label: string; hint: string }> = [
  { key: "storage", label: "Device storage", hint: "Choose the folder downloads are written to" },
  { key: "notifications", label: "Notifications", hint: "Alert when a download finishes or fails" },
  { key: "background", label: "Background transfers", hint: "Keep downloading while minimised" },
  { key: "overlay", label: "Floating bubble", hint: "Show the catch bubble over the browser" },
  { key: "clipboard", label: "Clipboard", hint: "Catch links copied from the browser" },
  { key: "network", label: "Network access", hint: "Required for all transfers" },
];

const DEVICES: Array<{ value: DeviceMode; label: string; icon: typeof Monitor }> = [
  { value: "auto", label: "Automatic", icon: Zap },
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "android", label: "Android", icon: Smartphone },
];

function SettingsPage() {
  const { settings, updateSettings, detectedDevice, device } = useDdm();

  const pickFolder = async () => {
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<{ name: string }> })
      .showDirectoryPicker;
    if (!picker) {
      toast.info("This browser can't pick a folder — type a path instead");
      return;
    }
    try {
      const handle = await picker();
      updateSettings({
        defaultSavePath: handle.name,
        permissions: { ...settings.permissions, storage: true },
      });
      toast.success(`Saving to ${handle.name}`);
    } catch {
      /* cancelled */
    }
  };

  const requestPermission = async (key: PermissionKey) => {
    if (key === "notifications" && "Notification" in window) {
      const res = await Notification.requestPermission();
      updateSettings({
        permissions: { ...settings.permissions, notifications: res === "granted" },
      });
      return;
    }
    if (key === "storage") {
      void pickFolder();
      return;
    }
    updateSettings({
      permissions: { ...settings.permissions, [key]: !settings.permissions[key] },
    });
  };

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Running the <span className="text-foreground">{device}</span> profile
        {settings.deviceMode === "auto" && ` (auto-detected ${detectedDevice})`}.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-4 w-4 text-primary" /> Device profile
            </CardTitle>
            <CardDescription>
              The layout, background service and bubble adapt to this choice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {DEVICES.map((d) => {
                const Icon = d.icon;
                const active = settings.deviceMode === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => updateSettings({ deviceMode: d.value })}
                    className={cn(
                      "rounded-lg border p-3 text-center text-sm transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    <Icon className="mx-auto mb-1 h-4 w-4" />
                    {d.label}
                  </button>
                );
              })}
            </div>
            {device === "android" && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <ToggleRow
                  label="Background service"
                  hint="Keep transfers alive while the app is minimised"
                  checked={settings.backgroundServiceAndroid}
                  onChange={(v) => updateSettings({ backgroundServiceAndroid: v })}
                />
                <ToggleRow
                  label="Floating catch bubble"
                  hint="Overlay button while you browse"
                  checked={settings.floatingBubbleAndroid}
                  onChange={(v) => updateSettings({ floatingBubbleAndroid: v })}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="h-4 w-4 text-primary" /> Save location
            </CardTitle>
            <CardDescription>Every new download defaults to this folder.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="path">Default folder</Label>
            <div className="flex gap-2">
              <Input
                id="path"
                value={settings.defaultSavePath}
                onChange={(e) => updateSettings({ defaultSavePath: e.target.value })}
                placeholder={device === "android" ? "/storage/emulated/0/Download" : "Downloads"}
              />
              <Button variant="outline" onClick={pickFolder} className="shrink-0 gap-2">
                <FolderOpen className="h-4 w-4" /> Browse
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-primary" /> Speed & concurrency
            </CardTitle>
            <CardDescription>
              Leave the cap at zero so DDM uses the maximum speed your line can reach.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <Label>Maximum speed</Label>
                <Badge variant="outline" className="font-mono text-[11px]">
                  {settings.maxSpeedKbps === 0
                    ? "Unlimited"
                    : `${(settings.maxSpeedKbps / 1024).toFixed(1)} MB/s`}
                </Badge>
              </div>
              <Slider
                className="mt-3"
                min={0}
                max={102400}
                step={512}
                value={[settings.maxSpeedKbps]}
                onValueChange={([v]) => updateSettings({ maxSpeedKbps: v ?? 0 })}
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Simultaneous downloads</Label>
                <Badge variant="outline" className="font-mono text-[11px]">
                  {settings.maxConcurrent}
                </Badge>
              </div>
              <Slider
                className="mt-3"
                min={1}
                max={12}
                step={1}
                value={[settings.maxConcurrent]}
                onValueChange={([v]) => updateSettings({ maxConcurrent: v ?? 1 })}
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Connections per file</Label>
                <Badge variant="outline" className="font-mono text-[11px]">
                  {settings.segmentsPerDownload}
                </Badge>
              </div>
              <Slider
                className="mt-3"
                min={1}
                max={16}
                step={1}
                value={[settings.segmentsPerDownload]}
                onValueChange={([v]) => updateSettings({ segmentsPerDownload: v ?? 1 })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-primary" /> Permissions & behaviour
            </CardTitle>
            <CardDescription>Grant what DDM needs to catch and store files.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {PERMISSIONS.map((p) => (
              <div key={p.key} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{p.hint}</p>
                </div>
                <Button
                  size="sm"
                  variant={settings.permissions[p.key] ? "secondary" : "outline"}
                  onClick={() => void requestPermission(p.key)}
                >
                  {settings.permissions[p.key] ? "Granted" : "Grant"}
                </Button>
              </div>
            ))}
            <div className="space-y-3 border-t border-border pt-3">
              <ToggleRow
                label="Intercept browser downloads"
                hint="Catch the link before the browser saves it"
                checked={settings.interceptBrowserDownloads}
                onChange={(v) => updateSettings({ interceptBrowserDownloads: v })}
              />
              <ToggleRow
                label="Detect streaming media"
                hint="Offer video qualities and formats on media pages"
                checked={settings.detectStreamingMedia}
                onChange={(v) => updateSettings({ detectStreamingMedia: v })}
              />
              <ToggleRow
                label="Start downloads automatically"
                checked={settings.autoStart}
                onChange={(v) => updateSettings({ autoStart: v })}
              />
              <ToggleRow
                label="Auto-pause and checkpoint"
                hint="Save progress when the app is backgrounded or the network drops"
                checked={settings.autoPauseOnLowBattery}
                onChange={(v) => updateSettings({ autoPauseOnLowBattery: v })}
              />
              <ToggleRow
                label="Verify integrity"
                hint="Byte-count and SHA-256 checks on finish and resume — a mismatched partial is restarted, never kept"
                checked={settings.verifyIntegrity}
                onChange={(v) => updateSettings({ verifyIntegrity: v })}
              />
              <ToggleRow
                label="Notify on completion"
                checked={settings.notifyOnComplete}
                onChange={(v) => updateSettings({ notifyOnComplete: v })}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
