import { Link, useLocation } from "react-router-dom";

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

/** Every public destination, shared by the wide header and mobile disclosure. */
export function PublicNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();

  return (
    <nav className="public-site-nav" aria-label="Main navigation">
      {PUBLIC_LINKS.map(({ to, label, title }) => (
        <Link
          key={to}
          to={to}
          title={title}
          className="public-site-nav-link"
          onClick={onNavigate}
          aria-current={pathname === to || (to !== "/" && pathname.startsWith(`${to}/`)) ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
