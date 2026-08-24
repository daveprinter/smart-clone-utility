import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 64 * 1024 * 1024;
const CHUNK = 256 * 1024;

/** Streams pseudo-random bytes for the download leg, and drains uploads. */
export const Route = createFileRoute("/api/public/speedtest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const bytes = Math.min(MAX_BYTES, Math.max(1024, Number(url.searchParams.get("bytes")) || 8 * 1024 * 1024));
        const block = new Uint8Array(CHUNK);
        crypto.getRandomValues(block.subarray(0, 65536));
        for (let o = 65536; o < CHUNK; o += 65536) block.set(block.subarray(0, 65536), o);

        let sent = 0;
        const stream = new ReadableStream({
          pull(controller) {
            if (sent >= bytes) {
              controller.close();
              return;
            }
            const n = Math.min(CHUNK, bytes - sent);
            controller.enqueue(n === CHUNK ? block : block.subarray(0, n));
            sent += n;
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "application/octet-stream",
            "content-length": String(bytes),
            "cache-control": "no-store, no-cache, must-revalidate",
            "access-control-allow-origin": "*",
          },
        });
      },
      POST: async ({ request }) => {
        let received = 0;
        const reader = request.body?.getReader();
        if (reader) {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value?.byteLength ?? 0;
          }
        }
        return new Response(JSON.stringify({ received }), {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
