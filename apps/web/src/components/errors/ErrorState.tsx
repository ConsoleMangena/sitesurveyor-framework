import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Compass,
  Home,
  LifeBuoy,
  RefreshCw,
  RotateCw,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { clearSiteData } from "@/lib/clearSiteData.ts";
import { isDynamicImportError } from "@/components/appErrorUtils.ts";

export type AppErrorKind = "runtime" | "chunk" | "offline" | "not-found";

interface ErrorStateProps {
  kind?: AppErrorKind;
  error?: Error | null;
  onRetry?: () => void;
  onHome?: () => void;
}

const content: Record<
  AppErrorKind,
  {
    code: string;
    title: string;
    message: string;
    steps: string[];
  }
> = {
  runtime: {
    code: "ERR_RUNTIME",
    title: "We hit a temporary problem",
    message:
      "The page could not finish loading. Your work is safe. Try again or return to the home page.",
    steps: [
      "Retry the page — most interruptions clear on a second load.",
      "Check that your connection is stable.",
      "Go home and reopen the page you were working on.",
    ],
  },
  chunk: {
    code: "ERR_UPDATE",
    title: "This page needs a fresh copy",
    message:
      "The app was updated while this page was open. Refreshing the app cache should restore the latest version.",
    steps: [
      "Refresh the app to pull the latest version.",
      "The app cache is cleared during this step, so you may need to sign in again.",
      "Reopen the page you were working on.",
    ],
  },
  offline: {
    code: "ERR_OFFLINE",
    title: "You appear to be offline",
    message:
      "Reconnect to the internet and try again. Previously loaded workspace data may still be available.",
    steps: [
      "Reconnect to Wi-Fi or mobile data.",
      "Cached pages and recent changes stay available.",
      "Try again once you are back online.",
    ],
  },
  "not-found": {
    code: "404",
    title: "That page moved or does not exist",
    message: "Check the address or return to your workspace and continue from there.",
    steps: [
      "Check the address for typos or a missing segment.",
      "Return home and navigate to the page from there.",
      "The page may have been moved or removed.",
    ],
  },
};

const icons: Record<AppErrorKind, LucideIcon> = {
  runtime: AlertTriangle,
  chunk: RotateCw,
  offline: WifiOff,
  "not-found": Compass,
};

export default function ErrorState({
  kind = "runtime",
  error,
  onRetry,
  onHome,
}: ErrorStateProps) {
  const resolvedKind: AppErrorKind =
    kind === "runtime" && error && isDynamicImportError(error) ? "chunk" : kind;
  const copy = content[resolvedKind];
  const Icon = icons[resolvedKind];
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [resolvedKind]);

  const handleHome = () => {
    if (onHome) {
      onHome();
      return;
    }
    window.location.href = "/";
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    handleHome();
  };

  const handlePrimary = () => {
    if (resolvedKind === "chunk") {
      void clearSiteData();
      return;
    }
    if (onRetry) {
      onRetry();
      return;
    }
    window.location.reload();
  };

  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-xl gap-0 py-0">
        <CardHeader className="gap-4 border-b py-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            <Icon className="size-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl tracking-tight">
            <h1 ref={headingRef} id="error-state-title" tabIndex={-1}>
              {copy.title}
            </h1>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6 py-6">
          <p className="text-sm text-muted-foreground">{copy.message}</p>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">What you can try</p>
            <ol className="space-y-2">
              {copy.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium tabular-nums text-muted-foreground"
                  >
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {import.meta.env.DEV && error ? (
            <details className="rounded-lg border bg-muted/40 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-foreground">
                Technical details
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
                {error.message}
              </pre>
            </details>
          ) : null}
        </CardContent>

        <CardFooter className="flex-wrap gap-2 border-t py-4">
          {resolvedKind !== "not-found" ? (
            <Button type="button" onClick={handlePrimary}>
              {resolvedKind === "chunk" ? (
                <RefreshCw size={16} aria-hidden="true" />
              ) : (
                <RotateCw size={16} aria-hidden="true" />
              )}
              {resolvedKind === "chunk" ? "Refresh app" : "Try again"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={resolvedKind === "not-found" ? "default" : "outline"}
            onClick={handleHome}
          >
            <Home size={16} aria-hidden="true" />
            Go home
          </Button>
          {resolvedKind === "not-found" ? (
            <Button type="button" variant="ghost" onClick={handleBack}>
              <ArrowLeft size={16} aria-hidden="true" />
              Go back
            </Button>
          ) : null}

          <p className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {copy.code}
            </code>
            <LifeBuoy size={14} aria-hidden="true" />
            Still stuck? Ask your workspace administrator to check your access.
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
