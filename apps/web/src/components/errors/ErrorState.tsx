import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  Compass,
  Home,
  RefreshCw,
  RotateCw,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearSiteData } from "@/lib/clearSiteData.ts";
import { isDynamicImportError } from "@/components/appErrorUtils.ts";
import "@/styles/error-surfaces.css";

export type AppErrorKind = "runtime" | "chunk" | "offline" | "not-found";

interface ErrorStateProps {
  kind?: AppErrorKind;
  error?: Error | null;
  onRetry?: () => void;
  onHome?: () => void;
}

const content: Record<
  AppErrorKind,
  { code: string; eyebrow: string; title: string; message: string; visualLabel: string }
> = {
  runtime: {
    code: "ERR_RUNTIME",
    eyebrow: "Unexpected interruption",
    title: "We hit a temporary problem",
    message:
      "The page could not finish loading. Your work is safe. Try again or return to the home page.",
    visualLabel: "Signal interrupted",
  },
  chunk: {
    code: "ERR_UPDATE",
    eyebrow: "App update detected",
    title: "This page needs a fresh copy",
    message:
      "The app was updated while this page was open. Refreshing the app cache should restore the latest version.",
    visualLabel: "New version ready",
  },
  offline: {
    code: "ERR_OFFLINE",
    eyebrow: "Connection unavailable",
    title: "You appear to be offline",
    message:
      "Reconnect to the internet and try again. Previously loaded workspace data may still be available.",
    visualLabel: "Signal lost",
  },
  "not-found": {
    code: "404",
    eyebrow: "Page not found",
    title: "That page moved or does not exist",
    message: "Check the address or return to your workspace and continue from there.",
    visualLabel: "Marker missing",
  },
};

const icons: Record<AppErrorKind, LucideIcon> = {
  runtime: AlertTriangle,
  chunk: RotateCw,
  offline: WifiOff,
  "not-found": Compass,
};

export default function ErrorState({ kind = "runtime", error, onRetry, onHome }: ErrorStateProps) {
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
    <main className="error-state-screen" data-state={resolvedKind}>
      <div className="error-state-backdrop" aria-hidden="true" />
      <section className="error-state-card" role="alert" aria-labelledby="error-state-title">
        <div className="error-state-visual" aria-hidden="true">
          <span className="error-state-code">{copy.code}</span>
          <div className="error-state-signal">
            <span className="error-state-signal-ring" />
            <span className="error-state-signal-ring" />
            <span className="error-state-signal-icon">
              <Icon size={38} strokeWidth={1.7} />
            </span>
          </div>
          <span className="error-state-visual-label">{copy.visualLabel}</span>
        </div>

        <div className="error-state-content">
          <div className="error-state-brand">
            <img src="/logo.svg" alt="SiteSurveyor" className="error-state-logo" />
            <span className="error-state-badge">SiteSurveyor</span>
          </div>

          <div>
            <p className="error-state-eyebrow">{copy.eyebrow}</p>
            <h1
              ref={headingRef}
              id="error-state-title"
              className="error-state-title"
              tabIndex={-1}
            >
              {copy.title}
            </h1>
            <p className="error-state-message">{copy.message}</p>
          </div>

          <div className="error-state-actions">
            {resolvedKind !== "not-found" ? (
              <Button type="button" onClick={handlePrimary} className="error-state-primary">
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
              variant="outline"
              onClick={handleHome}
              className="error-state-secondary"
            >
              <Home size={16} aria-hidden="true" />
              Go home
            </Button>
          </div>

          {import.meta.env.DEV && error ? (
            <details className="error-state-dev">
              <summary>Technical details</summary>
              <pre>{error.message}</pre>
            </details>
          ) : null}
        </div>
      </section>
    </main>
  );
}
