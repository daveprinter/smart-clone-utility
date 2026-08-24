import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { DownloadEngine, saveBlob } from "./engine";
import type {
  DeviceMode,
  DownloadItem,
  DownloadVariant,
  ResolvedDevice,
  Settings,
  SpeedTestResult,
} from "./types";

const SETTINGS_KEY = "ddm.settings.v1";
const ITEMS_KEY = "ddm.downloads.v1";
const SPEED_KEY = "ddm.speedtests.v1";

export const defaultSettings: Settings = {
  deviceMode: "auto",
  defaultSavePath: "",
  maxSpeedKbps: 0,
  maxConcurrent: 4,
  autoStart: true,
  autoPauseOnLowBattery: true,
  backgroundServiceAndroid: true,
  floatingBubbleAndroid: true,
  interceptBrowserDownloads: true,
  detectStreamingMedia: true,
  segmentsPerDownload: 8,
  notifyOnComplete: true,
  onboarded: false,
  permissions: {
    storage: false,
    notifications: false,
    background: false,
    overlay: false,
    network: true,
    clipboard: false,
  },
};

interface Ctx {
  ready: boolean;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  device: ResolvedDevice;
  detectedDevice: ResolvedDevice;
  items: DownloadItem[];
  addDownload: (input: {
    url: string;
    name: string;
    variant: DownloadVariant;
    savePath: string;
    resumable: boolean;
  }) => DownloadItem;
  findByUrlOrName: (url: string, name: string) => DownloadItem | undefined;
  start: (id: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  remove: (id: string) => void;
  markWaitingRefresh: (id: string) => void;
  refreshLink: (id: string, newUrl?: string) => void;
  waitingItem: DownloadItem | undefined;
  speedTests: SpeedTestResult[];
  addSpeedTest: (r: SpeedTestResult) => void;
  totalSpeed: number;
}

const DdmContext = createContext<Ctx | null>(null);

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function readList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export function DdmProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [speedTests, setSpeedTests] = useState<SpeedTestResult[]>([]);
  const [detectedDevice, setDetectedDevice] = useState<ResolvedDevice>("desktop");

  const itemsRef = useRef<DownloadItem[]>([]);
  itemsRef.current = items;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const patchItem = useCallback((id: string, patch: Partial<DownloadItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const engineRef = useRef<DownloadEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new DownloadEngine({
      onProgress: (id, received, size, speed) =>
        patchItem(id, { received, size: size || 0, speed, status: "downloading" }),
      onDone: (id, blob) => {
        const item = itemsRef.current.find((i) => i.id === id);
        patchItem(id, {
          status: "completed",
          speed: 0,
          received: item?.size || item?.received || 0,
          finishedAt: Date.now(),
        });
        if (blob && item) saveBlob(blob, item.name);
        if (settingsRef.current.notifyOnComplete && item) {
          toast.success("Download complete", { description: item.name });
        }
      },
      onError: (id, message, resumable) =>
        patchItem(id, {
          status: resumable ? "paused" : "failed",
          error: message,
          speed: 0,
        }),
    });
  }

  // hydrate
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const android = /Android/i.test(ua) || (/Mobi/i.test(ua) && !/iPad/i.test(ua));
    setDetectedDevice(android ? "android" : "desktop");

    const s = read<Settings>(SETTINGS_KEY, defaultSettings);
    setSettings(s);
    setItems(
      readList<DownloadItem>(ITEMS_KEY).map((i) =>
        i.status === "downloading" ? { ...i, status: "paused", speed: 0 } : i,
      ),
    );
    setSpeedTests(readList<SpeedTestResult>(SPEED_KEY));
    setReady(true);
  }, []);

  // persist
  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(
      ITEMS_KEY,
      JSON.stringify(items.map((i) => ({ ...i, speed: i.status === "downloading" ? 0 : i.speed }))),
    );
  }, [items, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(SPEED_KEY, JSON.stringify(speedTests));
  }, [speedTests, ready]);

  // auto-pause and checkpoint when the tab/app goes to background without a service
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (settingsRef.current.backgroundServiceAndroid) return;
      itemsRef.current
        .filter((i) => i.status === "downloading")
        .forEach((i) => {
          engineRef.current?.pause(i.id);
          patchItem(i.id, { status: "paused", speed: 0 });
        });
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [patchItem]);

  useEffect(() => {
    engineRef.current?.setSpeedLimit(settings.maxSpeedKbps);
  }, [settings.maxSpeedKbps]);

  const startEngine = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      patchItem(id, { status: "downloading", error: undefined });
      void engineRef.current?.start({ ...item, status: "downloading" });
    },
    [patchItem],
  );

  // queue scheduler honouring max simultaneous downloads
  useEffect(() => {
    if (!ready) return;
    const active = items.filter((i) => i.status === "downloading").length;
    const free = Math.max(0, settings.maxConcurrent - active);
    if (free === 0) return;
    const next = items.filter((i) => i.status === "queued").slice(0, free);
    next.forEach((i) => startEngine(i.id));
  }, [items, settings.maxConcurrent, ready, startEngine]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const addDownload: Ctx["addDownload"] = useCallback(
    ({ url, name, variant, savePath, resumable }) => {
      const item: DownloadItem = {
        id: `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        url: variant.url || url,
        kind: "file",
        container: variant.container,
        quality: variant.label,
        size: variant.size ?? 0,
        received: 0,
        status: settingsRef.current.autoStart ? "queued" : "paused",
        speed: 0,
        savePath: savePath || settingsRef.current.defaultSavePath,
        createdAt: Date.now(),
        resumable,
        segments: settingsRef.current.segmentsPerDownload,
      };
      setItems((prev) => [item, ...prev]);
      return item;
    },
    [],
  );

  const value = useMemo<Ctx>(() => {
    const device: ResolvedDevice =
      settings.deviceMode === "auto" ? detectedDevice : (settings.deviceMode as ResolvedDevice);
    return {
      ready,
      settings,
      updateSettings,
      device,
      detectedDevice,
      items,
      addDownload,
      findByUrlOrName: (url, name) =>
        itemsRef.current.find((i) => i.url === url || i.name === name),
      start: startEngine,
      pause: (id) => {
        engineRef.current?.pause(id);
        patchItem(id, { status: "paused", speed: 0 });
      },
      resume: (id) => patchItem(id, { status: "queued", error: undefined }),
      remove: (id) => {
        engineRef.current?.cancel(id);
        setItems((prev) => prev.filter((i) => i.id !== id));
      },
      markWaitingRefresh: (id) => {
        engineRef.current?.pause(id);
        patchItem(id, { status: "waiting-refresh", speed: 0 });
      },
      refreshLink: (id, newUrl) => {
        const patch: Partial<DownloadItem> = { status: "queued", error: undefined };
        if (newUrl) patch.url = newUrl;
        patchItem(id, patch);
      },
      waitingItem: items.find((i) => i.status === "waiting-refresh"),
      speedTests,
      addSpeedTest: (r) => setSpeedTests((prev) => [r, ...prev].slice(0, 20)),
      totalSpeed: items.reduce((a, i) => a + (i.status === "downloading" ? i.speed : 0), 0),
    };
  }, [
    ready,
    settings,
    updateSettings,
    detectedDevice,
    items,
    addDownload,
    startEngine,
    patchItem,
    speedTests,
  ]);

  return <DdmContext.Provider value={value}>{children}</DdmContext.Provider>;
}

export function useDdm() {
  const ctx = useContext(DdmContext);
  if (!ctx) throw new Error("useDdm must be used inside DdmProvider");
  return ctx;
}
