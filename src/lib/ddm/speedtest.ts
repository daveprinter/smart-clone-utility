export interface SpeedSample {
  mbps: number;
  progress: number; // 0..1
}

const ENDPOINT = "/api/public/speedtest";

export async function measurePing(rounds = 6): Promise<{ pingMs: number; jitterMs: number }> {
  const times: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    try {
      await fetch(`${ENDPOINT}?bytes=1024&p=${Math.random()}`, { cache: "no-store" }).then((r) =>
        r.arrayBuffer(),
      );
    } catch {
      /* ignore single round */
    }
    times.push(performance.now() - t0);
  }
  const avg = times.reduce((a, b) => a + b, 0) / (times.length || 1);
  const jitter =
    times.slice(1).reduce((a, t, i) => a + Math.abs(t - (times[i] ?? t)), 0) /
    Math.max(1, times.length - 1);
  return { pingMs: Math.round(avg), jitterMs: Math.round(jitter) };
}

/**
 * Download leg: opens several parallel streams so the measurement saturates
 * the link the same way the multi-segment download engine does.
 */
export async function measureDownload(
  onSample: (s: SpeedSample) => void,
  { streams = 4, bytesPerStream = 12 * 1024 * 1024, durationMs = 8000 } = {},
): Promise<number> {
  const controller = new AbortController();
  const start = performance.now();
  let total = 0;
  let peak = 0;

  const tick = setInterval(() => {
    const secs = (performance.now() - start) / 1000;
    if (secs <= 0) return;
    const mbps = (total * 8) / secs / 1e6;
    peak = Math.max(peak, mbps);
    onSample({ mbps, progress: Math.min(1, (performance.now() - start) / durationMs) });
  }, 200);

  const stopper = setTimeout(() => controller.abort(), durationMs);

  const one = async () => {
    try {
      const res = await fetch(`${ENDPOINT}?bytes=${bytesPerStream}&r=${Math.random()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value?.byteLength ?? 0;
      }
    } catch {
      /* aborted or network stop */
    }
  };

  await Promise.all(Array.from({ length: streams }, one));
  clearInterval(tick);
  clearTimeout(stopper);

  const secs = (performance.now() - start) / 1000;
  const mbps = secs > 0 ? (total * 8) / secs / 1e6 : 0;
  onSample({ mbps, progress: 1 });
  return Number(mbps.toFixed(2));
}

export async function measureUpload(
  onSample: (s: SpeedSample) => void,
  { chunks = 6, chunkBytes = 2 * 1024 * 1024 } = {},
): Promise<number> {
  const payload = new Uint8Array(chunkBytes);
  crypto.getRandomValues(payload.subarray(0, 65536));
  const start = performance.now();
  let sent = 0;

  for (let i = 0; i < chunks; i++) {
    try {
      await fetch(`${ENDPOINT}?u=${Math.random()}`, {
        method: "POST",
        body: payload,
        cache: "no-store",
      });
    } catch {
      break;
    }
    sent += chunkBytes;
    const secs = (performance.now() - start) / 1000;
    onSample({ mbps: secs > 0 ? (sent * 8) / secs / 1e6 : 0, progress: (i + 1) / chunks });
    if (secs > 8) break;
  }

  const secs = (performance.now() - start) / 1000;
  return Number((secs > 0 ? (sent * 8) / secs / 1e6 : 0).toFixed(2));
}
