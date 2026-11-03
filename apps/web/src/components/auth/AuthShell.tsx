import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Globe2 } from "lucide-react";
import AuthBackground from "../AuthBackground";
import { ThemeToggle } from "../theme/ThemeToggle";
import { cn } from "@/lib/utils";

export interface AuthShellProps {
  /** Optional sub-heading rendered above the card. */
  title?: string;
  /** One-line subtitle rendered under the brand block. */
  description?: ReactNode;
  children: ReactNode;
  /**
   * Render the SiteSurveyor brand block (logo + wordmark). Pages that show
   * the brand in their own content — the wallet page, whose tests assert a
   * single "SiteSurveyor" match — pass false and render it themselves.
   */
  showBrand?: boolean;
  /** Extra content pinned under the card (terms, market link, …). */
  footer?: ReactNode;
  className?: string;
}

/**
 * Shared frame for every authentication screen: animated backdrop, brand
 * block, centred card column, theme toggle and the public-market escape
 * hatch.
 *
 * Each page supplies its own card so it can own its form state, validation
 * and loading states; this component owns only the chrome around it, which
 * is what keeps the seven screens visually identical.
 */
export default function AuthShell({
  title,
  description,
  children,
  showBrand = true,
  footer,
  className,
}: AuthShellProps) {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AuthBackground />

      <div className="relative z-10 flex min-h-svh flex-col">
        <header className="flex items-center justify-between px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Globe2 className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Public market</span>
            <span className="sr-only sm:hidden">Home</span>
          </Link>
          <ThemeToggle />
        </header>

        <main
          className={cn(
            "flex flex-1 flex-col items-center justify-center px-4 py-8",
            className,
          )}
        >
          <div className="w-full max-w-md">
            {showBrand ? (
              <div className="mb-6 flex flex-col items-center gap-2 text-center">
                <img
                  src="/logo.svg"
                  alt=""
                  className="size-10"
                  width={40}
                  height={40}
                />
                <div className="space-y-1">
                  <h1 className="text-xl font-bold tracking-tight">
                    SiteSurveyor
                  </h1>
                  {description ? (
                    <p className="text-sm text-muted-foreground">{description}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* The page heading is independent of the brand block: pages that
                render their own brand (the wallet screen) still need one. */}
            {title || (!showBrand && description) ? (
              <div className="mb-6 space-y-1 text-center">
                {title ? (
                  <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                ) : null}
                {!showBrand && description ? (
                  <p className="text-sm text-muted-foreground">{description}</p>
                ) : null}
              </div>
            ) : null}

            {children}
          </div>
        </main>

        {footer ? (
          <footer className="px-4 pb-6 text-center sm:px-6">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}

/** Standard terms line shared by the sign-up and sign-in screens. */
export function AuthTerms() {
  return (
    <p className="text-xs text-muted-foreground">
      By continuing you agree to SiteSurveyor&apos;s terms and privacy policy.
    </p>
  );
}
