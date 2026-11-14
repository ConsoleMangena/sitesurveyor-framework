import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PublicNavLinks } from "./PublicNavLinks.tsx";
import { PublicFooter } from "./PublicFooter.tsx";
import { ThemeToggle } from "../theme/ThemeToggle.tsx";
import { useAuthStore } from "../../lib/auth/auth-store.ts";

interface PublicPageProps {
  /** Brand-bar suffix, e.g. "Journal" — renders after "SiteSurveyor /". */
  section?: string;
  children: ReactNode;
}

/**
 * Shared chrome for the simpler public pages (journal, help, contact, legal):
 * the same brand bar the market and about pages carry, one `<main>`, and the
 * shared footer. Pages own their content sections; this owns the frame, which
 * is what keeps the public surface visually identical.
 */
export function PublicPage({ section, children }: PublicPageProps) {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="web3-surface">
      <header className="web3-header">
        <div className="web3-header-inner">
          <span className="flex min-w-0 items-baseline gap-2">
            <Link to="/" aria-label="SiteSurveyor home" className="web3-brand">
              <img src="/logo.svg" alt="" className="web3-brand-logo" aria-hidden="true" />
              <span className="web3-brand-name">SiteSurveyor</span>
            </Link>
            {section ? (
              <span className="web3-brand-sub hidden truncate sm:inline">/ {section}</span>
            ) : null}
          </span>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <PublicNavLinks />
            <ThemeToggle />
            <Link
              to={user ? "/" : "/login"}
              className="web3-btn web3-btn-primary shrink-0 whitespace-nowrap px-3 text-xs"
            >
              {user ? "Open workspace" : "Sign in"}
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <PublicFooter />
    </div>
  );
}
