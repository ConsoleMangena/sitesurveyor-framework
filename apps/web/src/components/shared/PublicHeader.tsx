import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { PublicNavLinks } from "./PublicNavLinks.tsx";
import { ThemeToggle } from "../theme/ThemeToggle.tsx";
import { useAssistant } from "../assistant/assistant-context.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";

interface PublicHeaderProps {
  section?: string;
  /** Page tools such as the market cart or transport trip history. */
  actions?: ReactNode;
  /** Signed-in account menu supplied by pages that have one. */
  account?: ReactNode;
}

/** Public navigation with accessible mobile disclosure and a clear assistant entry point. */
export function PublicHeader({ section, actions, account }: PublicHeaderProps) {
  const user = useAuthStore((state) => state.user);
  const { openAssistant } = useAssistant();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!navigationOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setNavigationOpen(false);
      navigationToggleRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [navigationOpen]);

  return (
    <header className="public-site-header" data-account={user && account ? "true" : undefined}>
      <div className="public-site-header-inner">
        <div className="public-site-header-left">
          <Link to="/" aria-label="SiteSurveyor home" className="web3-brand">
            <img src="/logo.svg" alt="" className="web3-brand-logo" aria-hidden="true" />
            <span className="web3-brand-name">SiteSurveyor</span>
            {section ? <span className="sr-only">: {section}</span> : null}
          </Link>
          <PublicNavLinks />
        </div>

        <div className="public-site-actions">
          {actions}
          <ThemeToggle />
          {user && account ? account : (
            <Link to={user ? "/workspace" : "/login"} className="public-sign-in-link">
              {user ? "Open workspace" : "Sign in"}
            </Link>
          )}
          <Link to={user ? "/workspace" : "/signup"} className="public-header-cta">
            {user ? "Workspace" : "Get started"}
          </Link>
          <button
            ref={navigationToggleRef}
            type="button"
            className="public-nav-toggle"
            aria-label={navigationOpen ? "Hide navigation" : "Show navigation"}
            aria-expanded={navigationOpen}
            aria-controls="public-navigation"
            onClick={() => setNavigationOpen((current) => !current)}
          >
            <ChevronDown aria-hidden="true" />
          </button>
        </div>
      </div>
      <div id="public-navigation" className="public-mobile-navigation" hidden={!navigationOpen}>
        <PublicNavLinks flat onNavigate={() => setNavigationOpen(false)} />
        <button type="button" onClick={() => { setNavigationOpen(false); openAssistant(); }}>
          Ask SiteSurveyor AI
        </button>
      </div>
    </header>
  );
}
