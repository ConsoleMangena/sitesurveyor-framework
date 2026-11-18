import { Link, useLocation } from "react-router-dom";

const FOOTER_GROUPS = [
  {
    label: "Products",
    links: [
      { to: "/market", label: "Marketplace" },
      { to: "/transport", label: "Transport" },
      { to: "/downloads", label: "Desktop" },
    ],
  },
  {
    label: "Resources",
    links: [
      { to: "/journal", label: "Blogs" },
      { to: "/paper", label: "Paper" },
      { to: "/help", label: "Help" },
      { to: "/contact", label: "Contact" },
    ],
  },
  {
    label: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/privacy", label: "Privacy" },
      { to: "/terms", label: "Terms" },
    ],
  },
];

export function PublicFooter() {
  const { pathname } = useLocation();

  return (
    <footer className="public-site-footer">
      <div className="public-site-footer-grid">
        <div className="public-site-footer-brand">
          <Link to="/" aria-label="SiteSurveyor home" className="web3-brand">
            <img src="/logo.svg" alt="" className="web3-brand-logo" aria-hidden="true" />
            <span className="web3-brand-name">SiteSurveyor</span>
          </Link>
          <p>Plan the work.<br />Prove the survey.</p>
          <span>An open-source initiative for safer digital surveying.</span>
        </div>
        {FOOTER_GROUPS.map((group) => (
          <nav key={group.label} aria-label={group.label} className="public-site-footer-group">
            <h2>{group.label}</h2>
            {group.links.map(({ to, label }) => (
              <Link key={to} to={to} aria-current={pathname === to ? "page" : undefined}>
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="public-site-footer-bottom">
        <span>A product of <strong>Eineva Incorporated</strong></span>
        <span>© {new Date().getFullYear()} SiteSurveyor</span>
      </div>
    </footer>
  );
}
