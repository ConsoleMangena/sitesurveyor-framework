import type { LucideIcon } from "lucide-react";
import { Download, HelpCircle, Info, Newspaper, Store, Truck } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const PUBLIC_LINKS: Array<{
  to: string;
  label: string;
  title: string;
  icon: LucideIcon;
}> = [
  {
    to: "/market",
    label: "Marketplace",
    title: "Instruments, people, jobs and training from the market",
    icon: Store,
  },
  {
    to: "/transport",
    label: "Transport",
    title: "Runs and routes that can carry what you hire or buy",
    icon: Truck,
  },
  {
    to: "/downloads",
    label: "Desktop",
    title: "Installers for the native desktop app",
    icon: Download,
  },
  {
    to: "/journal",
    label: "Journal",
    title: "Working notes on the product and the trade",
    icon: Newspaper,
  },
  {
    to: "/help",
    label: "Help",
    title: "How the workspace works, from sign-in to settlement",
    icon: HelpCircle,
  },
  {
    to: "/about",
    label: "About",
    title: "What SiteSurveyor is and how the project fits together",
    icon: Info,
  },
];

/**
 * The site links every public page carries in its topbar. The current page
 * drops out of the bar (the brand link already covers the market home), and
 * the workspace shells keep their own navigation — this bar is for the public
 * surface only.
 */
export function PublicNavLinks() {
  const { pathname } = useLocation();
  // The market home renders at "/" for signed-out visitors too.
  const current = pathname === "/" ? "/market" : pathname;
  // On phones the labels collapse to icons, so only the first four links stay
  // in the bar; Journal, Help (and anything added later) move to the footer —
  // which every public page carries.
  const visible = PUBLIC_LINKS.filter(({ to }) => to !== current);

  return (
    <>
      {visible.map(({ to, label, title, icon: Icon }, index) => (
        <Link
          key={to}
          to={to}
          aria-label={label}
          title={title}
          className={`web3-btn shrink-0 gap-1 px-2 sm:px-2.5 ${
            index >= 4 ? "max-sm:hidden" : ""
          }`}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </>
  );
}
