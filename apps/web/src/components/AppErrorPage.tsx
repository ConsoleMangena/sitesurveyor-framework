import { AlertTriangle, Home, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearSiteData } from "@/lib/clearSiteData.ts";

export type AppErrorKind = "runtime" | "chunk" | "offline" | "not-found";

interface AppErrorPageProps {
  kind?: AppErrorKind;
  error?: Error | null;
  onRetry?: () => void;
}

const content: Record<AppErrorKind, { eyebrow: string; title: string; message: string }> = {
  runtime: {
    eyebrow: "Unexpected interruption",
    title: "We hit a temporary problem",
    message: "The page could not finish loading. Your work is safe. Try again or return to the home page.",
  },
  chunk: {
    eyebrow: "App update detected",
    title: "This page needs a fresh copy",
    message: "The app was updated while this page was open. Refreshing the app cache should restore the latest version.",
  },
  offline: {
    eyebrow: "Connection unavailable",
    title: "You appear to be offline",
    message: "Reconnect to the internet and try again. Previously loaded workspace data may still be available.",
  },
  "not-found": {
    eyebrow: "404 · Page not found",
    title: "That page moved or does not exist",
    message: "Check the address or return to your workspace and continue from there.",
  },
};

function isChunkError(error?: Error | null): boolean {
  const text = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return text.includes("dynamically imported module") || text.includes("chunkloaderror") || text.includes("loading chunk");
}

export default function AppErrorPage({ kind = "runtime", error, onRetry }: AppErrorPageProps) {
  const resolvedKind = kind === "runtime" && error && isChunkError(error) ? "chunk" : kind;
  const copy = content[resolvedKind];
  const Icon = resolvedKind === "offline" ? WifiOff : resolvedKind === "not-found" ? Home : AlertTriangle;

  const recover = () => {
    if (resolvedKind === "chunk") {
      void clearSiteData();
      return;
    }
    onRetry?.();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-xl rounded-2xl border border-border/60 bg-card p-6 shadow-xl shadow-primary/5 sm:p-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <img src="/logo.svg" alt="SiteSurveyor" className="h-9 w-auto" />
          <span className="rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">SiteSurveyor</span>
        </div>
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon size={28} /></div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{copy.eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{copy.title}</h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">{copy.message}</p>
        {import.meta.env.DEV && error && <pre className="mt-5 max-h-28 overflow-auto rounded-xl bg-muted p-3 text-xs text-muted-foreground">{error.message}</pre>}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {resolvedKind !== "not-found" && <Button onClick={recover} className="gap-2"><RefreshCw size={16} /> {resolvedKind === "chunk" ? "Refresh app" : "Try again"}</Button>}
          <Button variant="outline" onClick={() => { window.location.href = "/"; }} className="gap-2"><Home size={16} /> Go home</Button>
        </div>
      </section>
    </main>
  );
}
