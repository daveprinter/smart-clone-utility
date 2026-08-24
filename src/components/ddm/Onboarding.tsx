import { useState } from "react";
import {
  Bell,
  Check,
  FolderOpen,
  HardDrive,
  Layers,
  Monitor,
  Smartphone,
  Wand2,
  Wifi,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useDdm } from "@/lib/ddm/store";
import type { DeviceMode, PermissionKey } from "@/lib/ddm/types";

const DEVICES: Array<{ id: DeviceMode; title: string; blurb: string; icon: typeof Monitor }> = [
  { id: "desktop", title: "Desktop / PC", blurb: "Full panel, columns, keyboard shortcuts", icon: Monitor },
  { id: "android", title: "Android device", blurb: "Compact tabs, background service, bubble", icon: Smartphone },
  { id: "auto", title: "Automatic detection", blurb: "Detect the device on every launch", icon: Wand2 },
];

const PERMS: Array<{ id: PermissionKey; title: string; blurb: string; icon: typeof HardDrive }> = [
  { id: "storage", title: "Device storage", blurb: "Write downloads to your chosen folder", icon: HardDrive },
  { id: "network", title: "Network access", blurb: "Fetch links, probe sizes, speed test", icon: Wifi },
  { id: "notifications", title: "Notifications", blurb: "Progress and completion alerts", icon: Bell },
  { id: "background", title: "Background service", blurb: "Keep transfers alive when minimised", icon: Layers },
  { id: "overlay", title: "Display over other apps", blurb: "Floating download bubble on Android", icon: Smartphone },
  { id: "clipboard", title: "Clipboard monitor", blurb: "Catch copied links automatically", icon: FolderOpen },
];

export function Onboarding() {
  const { ready, settings, updateSettings, detectedDevice } = useDdm();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<DeviceMode>("auto");
  const [path, setPath] = useState("");
  const [perms, setPerms] = useState(settings.permissions);
  const [granting, setGranting] = useState(false);

  if (!ready || settings.onboarded) return null;

  const resolved = mode === "auto" ? detectedDevice : mode;
  const suggestion = resolved === "android" ? "/storage/emulated/0/Download/DDM" : "C:\\Users\\Public\\Downloads\\DDM";

  const grantAll = async () => {
    setGranting(true);
    const next = { ...perms, storage: true, network: true, background: true, overlay: true, clipboard: true };
    if ("Notification" in window) {
      try {
        const res = await Notification.requestPermission();
        next.notifications = res === "granted";
      } catch {
        next.notifications = false;
      }
    }
    setPerms(next);
    setGranting(false);
  };

  const pickFolder = async () => {
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<{ name: string }> })
      .showDirectoryPicker;
    if (picker) {
      try {
        const dir = await picker();
        setPath(dir.name);
        setPerms((p) => ({ ...p, storage: true }));
        return;
      } catch {
        /* cancelled */
      }
    }
    setPath(suggestion);
  };

  const finish = () => {
    updateSettings({
      deviceMode: mode,
      defaultSavePath: path || suggestion,
      permissions: perms,
      onboarded: true,
    });
  };

  return (
    <Dialog open>
      <DialogContent className="max-w-lg gap-0 border-border bg-card p-0">
        <div className="border-b border-border px-6 py-5">
          <DialogTitle className="text-lg">
            Set up <span className="text-gradient">DDM</span>
          </DialogTitle>
          <DialogDescription>Step {step + 1} of 3</DialogDescription>
        </div>

        <div className="space-y-4 px-6 py-5">
          {step === 0 && (
            <>
              <p className="text-sm text-muted-foreground">
                Where are you installing the download manager? The interface and background
                behaviour adapt to your answer.
              </p>
              <div className="grid gap-2">
                {DEVICES.map((d) => {
                  const Icon = d.icon;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setMode(d.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3 text-left transition-colors hover:border-primary/60",
                        mode === d.id && "border-primary bg-primary/10",
                      )}
                    >
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{d.title}</span>
                        <span className="block text-xs text-muted-foreground">{d.blurb}</span>
                      </span>
                      {mode === d.id && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
              {mode === "auto" && (
                <p className="text-xs text-muted-foreground">
                  Detected right now: <span className="text-foreground">{detectedDevice}</span>
                </p>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-sm text-muted-foreground">
                DDM needs these permissions to intercept links, run while minimised and write files.
              </p>
              <div className="grid gap-2">
                {PERMS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3"
                    >
                      <Icon className="h-4 w-4 text-accent" />
                      <span className="flex-1">
                        <span className="block text-sm">{p.title}</span>
                        <span className="block text-xs text-muted-foreground">{p.blurb}</span>
                      </span>
                      <Switch
                        checked={perms[p.id]}
                        onCheckedChange={(v) => setPerms((prev) => ({ ...prev, [p.id]: v }))}
                      />
                    </div>
                  );
                })}
              </div>
              <Button variant="secondary" className="w-full" onClick={grantAll} disabled={granting}>
                Grant all permissions
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">
                Choose the default folder where every download is saved.
              </p>
              <Label htmlFor="savePath">Default save location</Label>
              <div className="flex gap-2">
                <Input
                  id="savePath"
                  value={path}
                  placeholder={suggestion}
                  onChange={(e) => setPath(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button variant="secondary" onClick={pickFolder}>
                  <FolderOpen className="h-4 w-4" /> Browse
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                You can override the folder per download later.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-between gap-2 border-t border-border px-6 py-4">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            Back
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)}>Continue</Button>
          ) : (
            <Button onClick={finish}>Finish setup</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
