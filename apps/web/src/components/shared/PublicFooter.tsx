import { Link, useLocation } from "react-router-dom";

const FOOTER_LINKS: Array<{ to: string; label: string }> = [
  { to: "/market", label: "Marketplace" },
  { to: "/transport", label: "Transport" },
  { to: "/downloads", label: "Desktop" },
  { to: "/about", label: "About" },
  { to: "/journal", label: "Journal" },
  { to: "/help", label: "Help" },
  { to: "/contact", label: "Contact" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
];

/**
 * The footer every public page carries. One component instead of five
 * hand-copied variants, so adding a public page is one array entry — which is
 * how the journal, help, contact and legal pages got wired in.
 */
export function PublicFooter() {
  const { pathname } = useLocation();

  return (
    <footer className="border-t border-border/60 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 text-xs text-muted-foreground sm:px-6">
        <nav aria-label="Site links" className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {FOOTER_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="hover:text-foreground"
              aria-current={pathname === to ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <p>
          A product of <strong className="text-foreground">Eineva Incorporated</strong> · An
          open-source initiative for safer digital surveying
        </p>
      </div>
    </footer>
  );
}
