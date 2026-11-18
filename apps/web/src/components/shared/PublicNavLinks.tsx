import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";

const PUBLIC_LINKS = [
  { to: "/", label: "Home", title: "SiteSurveyor home" },
  { to: "/market", label: "Marketplace", title: "Instruments, people, jobs and training from the market" },
  { to: "/transport", label: "Transport", title: "Runs and routes for what you hire or buy" },
  { to: "/downloads", label: "Desktop", title: "Installers for the native desktop app" },
  { to: "/journal", label: "Blogs", title: "Working notes on the product and the trade" },
  { to: "/paper", label: "Paper", title: "The preprint manuscript and its Zenodo DOI" },
  { to: "/help", label: "Help", title: "How the workspace works, from sign-in to settlement" },
  { to: "/about", label: "About", title: "What SiteSurveyor is and how the project fits together" },
];

const PRIMARY_TO = new Set(["/market", "/transport", "/paper"]);
const PRIMARY_LINKS = PUBLIC_LINKS.filter((link) => PRIMARY_TO.has(link.to));
const MORE_LINKS = PUBLIC_LINKS.filter((link) => link.to !== "/" && !PRIMARY_TO.has(link.to));

interface PublicNavLinksProps {
  onNavigate?: () => void;
  /** Render every destination as a flat list (mobile disclosure) instead of the bar + dropdown. */
  flat?: boolean;
}

/** Public destinations: a short primary row plus a More dropdown, or a flat list on mobile. */
export function PublicNavLinks({ onNavigate, flat = false }: PublicNavLinksProps) {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMoreOpen(false);
      moreToggleRef.current?.focus();
    };
    const closeOnOutside = (event: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutside);
    };
  }, [moreOpen]);

  const isCurrent = (to: string) =>
    pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));

  const renderLink = ({ to, label, title }: (typeof PUBLIC_LINKS)[number]) => (
    <Link
      key={to}
      to={to}
      title={title}
      className="public-site-nav-link"
      onClick={onNavigate}
      aria-current={isCurrent(to) ? "page" : undefined}
    >
      {label}
    </Link>
  );

  if (flat) {
    return (
      <nav className="public-site-nav" aria-label="Main navigation">
        {PUBLIC_LINKS.map(renderLink)}
      </nav>
    );
  }

  const moreActive = MORE_LINKS.some((link) => isCurrent(link.to));

  return (
    <nav className="public-site-nav" aria-label="Main navigation">
      {PRIMARY_LINKS.map(renderLink)}
      <div className="public-nav-more" ref={moreRef}>
        <button
          ref={moreToggleRef}
          type="button"
          className="public-site-nav-link public-nav-more-toggle"
          aria-expanded={moreOpen}
          aria-controls="public-more-menu"
          aria-current={moreActive ? "page" : undefined}
          onClick={() => setMoreOpen((open) => !open)}
        >
          More
          <ChevronDown aria-hidden="true" />
        </button>
        <div id="public-more-menu" className="public-nav-more-menu" hidden={!moreOpen}>
          {MORE_LINKS.map(({ to, label, title }) => (
            <Link
              key={to}
              to={to}
              title={title}
              className="public-nav-more-link"
              onClick={() => {
                setMoreOpen(false);
                onNavigate?.();
              }}
              aria-current={isCurrent(to) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
