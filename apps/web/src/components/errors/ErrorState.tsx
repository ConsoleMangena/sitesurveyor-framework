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
  {
    code: string;
    eyebrow: string;
    title: string;
    message: string;
    visualLabel: string;
    steps: string[];
  }
> = {
  runtime: {
    code: "ERR_RUNTIME",
    eyebrow: "Unexpected interruption",
    title: "We hit a temporary problem",
    message:
      "The page could not finish loading. Your work is safe. Try again or return to the home page.",
    visualLabel: "Signal interrupted",
    steps: [
      "Retry the page — most interruptions clear on a second load.",
      "Check that your connection is stable.",
      "Go home and reopen the page you were working on.",
    ],
  },
  chunk: {
    code: "ERR_UPDATE",
    eyebrow: "App update detected",
    title: "This page needs a fresh copy",
    message:
      "The app was updated while this page was open. Refreshing the app cache should restore the latest version.",
    visualLabel: "New version ready",
    steps: [
      "Refresh the app to pull the latest version.",
      "The app cache is cleared during this step, so you may need to sign in again.",
      "Reopen the page you were working on.",
    ],
  },
  offline: {
    code: "ERR_OFFLINE",
    eyebrow: "Connection unavailable",
    title: "You appear to be offline",
    message:
      "Reconnect to the internet and try again. Previously loaded workspace data may still be available.",
    visualLabel: "Signal lost",
    steps: [
      "Reconnect to Wi-Fi or mobile data.",
      "Cached pages and recent changes stay available.",
      "Try again once you are back online.",
    ],
  },
  "not-found": {
    code: "404",
    eyebrow: "Page not found",
    title: "That page moved or does not exist",
    message: "Check the address or return to your workspace and continue from there.",
    visualLabel: "Marker missing",
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
            <img src="/logo.svg" alt="" className="error-state-logo" />
            <span className="error-state-brand-name">
              SiteSurveyor
              <span className="error-state-brand-sub">Field survey operations</span>
            </span>
          </div>

          <div className="error-state-copy">
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

          <div className="error-state-guide">
            <p className="error-state-guide-title">What you can try</p>
            <ol className="error-state-steps">
              {copy.steps.map((step, index) => (
                <li key={step}>
                  <span className="error-state-step-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
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
              variant={resolvedKind === "not-found" ? "default" : "outline"}
              onClick={handleHome}
              className="error-state-secondary"
            >
              <Home size={16} aria-hidden="true" />
              Go home
            </Button>
            {resolvedKind === "not-found" ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleBack}
                className="error-state-back"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Go back
              </Button>
            ) : null}
          </div>

          {import.meta.env.DEV && error ? (
            <details className="error-state-dev">
              <summary>Technical details</summary>
              <pre>{error.message}</pre>
            </details>
          ) : null}
        </div>
      </section>

      <p className="error-state-footer">
        <LifeBuoy size={14} aria-hidden="true" />
        Still stuck? Ask your workspace administrator to check your access.
      </p>
    </main>
  );
}
