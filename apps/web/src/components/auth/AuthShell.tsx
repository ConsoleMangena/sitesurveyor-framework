import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Globe2 } from "lucide-react";
import AuthBackground from "../AuthBackground";
import AnchorPlat from "./AnchorPlat";
import { ThemeToggle } from "../theme/ThemeToggle";
import { cn } from "@/lib/utils";

export interface AuthShellProps {
  /** Page heading rendered above the working column. */
  title?: string;
  /** One-line subtitle rendered under the brand block. */
  description?: ReactNode;
  children: ReactNode;
  /** Widen the column's measure for the screens that work a wider field. */
  wide?: boolean;
  /**
   * Render the SiteSurveyor wordmark. Pages that show the brand in their own
   * content pass false and render it themselves.
   */
  showBrand?: boolean;
  /** Extra content pinned under the working column (terms, escape links). */
  footer?: ReactNode;
  className?: string;
}

/**
 * Shared frame for every authentication screen: the sheet is split like a
 * plan — the plat of record for one anchor run on the left, the working column
 * (brand, heading, controls, escape hatch) on the right.
 *
 * Each page supplies its own content so it can own its form state, validation
 * and loading states; this component owns only the chrome around it, which
 * is what keeps the seven screens visually identical.
 */
export default function AuthShell({
  title,
  description,
  children,
  showBrand = true,
  wide = false,
  footer,
  className,
}: AuthShellProps) {
  return (
    <div className="auth-board">
      <AuthBackground />

      <div className="auth-sheet">
        <aside className="auth-plat" aria-hidden="true">
          <AnchorPlat />
        </aside>

        <section className="auth-side">
          <header className="auth-side-bar">
            <Link to="/" className="auth-escape">
              <Globe2 className="size-4" aria-hidden="true" />
              <span className="auth-escape-full">Public market</span>
              <span className="auth-escape-short">Home</span>
            </Link>
            <ThemeToggle />
          </header>

          <div className={cn("auth-side-body", wide && "auth-side-body--wide", className)}>
            {showBrand ? (
              <div className="auth-brand">
                <img
                  src="/logo.svg"
                  alt=""
                  className="auth-brand-mark"
                  width={34}
                  height={34}
                />
                <div className="auth-brand-text">
                  <h1 className="auth-wordmark">SiteSurveyor</h1>
                  {description ? (
                    <p className="auth-tagline">{description}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* The page heading is independent of the brand block: pages that
                render their own brand (the wallet screen) still need one. */}
            {title || (!showBrand && description) ? (
              <div className="auth-head">
                {title ? <h2 className="auth-title">{title}</h2> : null}
                {!showBrand && description ? (
                  <p className="auth-tagline">{description}</p>
                ) : null}
              </div>
            ) : null}

            {children}
          </div>

          {footer ? <footer className="auth-side-foot">{footer}</footer> : null}
        </section>
      </div>
    </div>
  );
}

/** Standard terms line shared by the sign-up and sign-in screens. */
export function AuthTerms() {
  return (
    <p className="auth-terms">
      By continuing you agree to SiteSurveyor&apos;s terms and privacy policy.
    </p>
  );
}

/**
 * The monument marker used by the state screens (verify, callback, sent,
 * done). A ruled square with an inset second rule — the mark a surveyor
 * draws around a recovered corner — rather than a generic tinted circle.
 */
export function AuthMark({
  tone = "primary",
  children,
}: {
  tone?: "primary" | "danger" | "success";
  children: ReactNode;
}) {
  return (
    <span className="auth-mark" data-tone={tone} aria-hidden="true">
      {children}
    </span>
  );
}

/** Ruled divider with a drafting annotation in the middle. The annotation is
 *  the point of it, so it stays readable text — `role="separator"` would
 *  claim an empty structural rule and drop the words from the tree. */
export function AuthRule({ children }: { children: ReactNode }) {
  return <p className="auth-rule">{children}</p>;
}
