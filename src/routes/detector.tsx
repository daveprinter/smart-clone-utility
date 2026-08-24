import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/ddm/AppShell";

export const Route = createFileRoute("/detector")({
  head: () => ({
    meta: [
      { title: "Detector — DDM" },
      { name: "description", content: "Capture media and file links detected on the web." },
      { property: "og:title", content: "Detector — DDM" },
      {
        property: "og:description",
        content: "Capture media and file links detected on the web.",
      },
    ],
  }),
  component: DetectorPage,
});

function DetectorPage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Detector</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming next.</p>
    </AppShell>
  );
}
