import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Download, Gauge, Puzzle, Settings2, Smartphone, Monitor } from "lucide-react";
import type { ReactNode } from "react";
import { useDdm } from "@/lib/ddm/store";
import { formatSpeed } from "@/lib/ddm/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Onboarding } from "./Onboarding";
import { FloatingBubble } from "./FloatingBubble";

const NAV = [
  { to: "/", label: "Downloads", icon: Download },
  { to: "/speed-test", label: "Speed Test", icon: Gauge },
  { to: "/detector", label: "Detector", icon: Puzzle },
  { to: "/settings", label: "Settings", icon: Settings2 },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { device, items, totalSpeed, settings } = useDdm();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = items.filter((i) => i.status === "downloading").length;
  const mobile = device === "android";

  // Android profile trims the chrome: compact header + bottom tab bar.
  const nav = mobile ? NAV.filter((n) => n.to !== "/detector") : NAV;

  return (
    <div className={cn("min-h-screen", mobile ? "pb-20" : "")}>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Download className="h-4 w-4" />
            </span>
            <span className="font-semibold tracking-tight">
              <span className="text-gradient">DDM</span>
              {!mobile && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Dev Download Manager
                </span>
              )}
            </span>
          </Link>

          {!mobile && (
            <nav className="ml-6 flex items-center gap-1">
              {nav.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                    pathname === n.to && "bg-secondary text-foreground",
                  )}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="gap-1 font-mono text-[11px]">
              <Activity className="h-3 w-3 text-accent" />
              {formatSpeed(totalSpeed)}
            </Badge>
            {!mobile && (
              <Badge variant="secondary" className="text-[11px]">
                {active} active
              </Badge>
            )}
            <Badge variant="outline" className="gap-1 text-[11px]">
              {mobile ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
              {mobile ? "Android" : "Desktop"}
              {settings.deviceMode === "auto" && " · auto"}
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

      {mobile && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-md">
            {nav.map((n) => {
              const Icon = n.icon;
              const isActive = pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px]",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <Onboarding />
      <FloatingBubble />
    </div>
  );
}
