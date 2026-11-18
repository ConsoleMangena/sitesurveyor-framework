/**
 * The public surface of the site, and the only part of it a search engine is
 * meant to see.
 *
 * This table is the single source of truth for the pages that belong in the
 * sitemap, the canonical tags and the social share cards. The runtime writes
 * the same records into the document head, and the build script reads them to
 * emit `sitemap.xml` — so a page cannot be in one and missing from the other.
 *
 * Descriptions are lifted from what the pages actually say. Nothing here
 * promises a feature that is not shipped.
 */

export type ChangeFreq = "daily" | "weekly" | "monthly" | "yearly";

export interface PublicRoute {
  /** Path from the site root, always with a leading slash. */
  path: string;
  /** The document title, as it should read in a browser tab and a search result. */
  title: string;
  /** The meta description. Kept inside the length search engines display. */
  description: string;
  /** Share image path, relative to the site root. */
  image?: string;
  /** Sitemap priority, 0–1. The landing page is the one everything else hangs from. */
  priority?: number;
  /** How often the page changes, for the sitemap. */
  changefreq?: ChangeFreq;
}

export const SITE_NAME = "SiteSurveyor";

export const SITE_TAGLINE = "Plan the work. Prove the survey.";

/** The share card used when a route has no image of its own. */
export const DEFAULT_SHARE_IMAGE = "/og/site.jpg";

/** The canonical, indexable pages, in sitemap order. */
export const PUBLIC_ROUTES: PublicRoute[] = [
  {
    path: "/",
    title: "SiteSurveyor | Plan the work. Prove the survey.",
    description:
      "One open workspace that runs a survey job from quote to cash, with the crew, site files and evidence connected throughout.",
    image: "/og/site.jpg",
    priority: 1,
    changefreq: "weekly",
  },
  {
    path: "/journal",
    title: "Blogs | SiteSurveyor",
    description:
      "Product decisions, our evidence model, and practical engineering notes for connected surveying work.",
    image: "/og/site.jpg",
    priority: 0.8,
    changefreq: "weekly",
  },
  {
    path: "/market",
    title: "Survey equipment, expertise and opportunities | SiteSurveyor",
    description:
      "Find survey equipment, professional expertise, survey firms and open opportunities for hire in the SiteSurveyor market.",
    image: "/og/site.jpg",
    priority: 0.8,
    changefreq: "daily",
  },
  {
    path: "/transport",
    title: "Hire a vehicle for a survey run | SiteSurveyor",
    description:
      "Hire a vehicle for a survey run: GPS pickup, road-distance fares and vehicle classes sized to the job.",
    image: "/og/site.jpg",
    priority: 0.7,
    changefreq: "weekly",
  },
  {
    path: "/paper",
    title: "Research paper | SiteSurveyor",
    description:
      "The SiteSurveyor preprint: a hybrid on-chain/off-chain architecture for secure and verifiable surveying systems, with the readable PDF and DOI.",
    image: "/og/site.jpg",
    priority: 0.6,
    changefreq: "monthly",
  },
  {
    path: "/about",
    title: "About | SiteSurveyor",
    description:
      "One workspace to manage and deliver the survey: projects, quotes, dispatch, field evidence, invoices and settlement in one record.",
    image: "/og/site.jpg",
    priority: 0.7,
    changefreq: "monthly",
  },
  {
    path: "/help",
    title: "Help | SiteSurveyor",
    description:
      "Accounts, workflow, evidence, money and networks: the way SiteSurveyor actually behaves.",
    image: "/og/site.jpg",
    priority: 0.6,
    changefreq: "monthly",
  },
  {
    path: "/downloads",
    title: "Desktop downloads | SiteSurveyor",
    description:
      "The SiteSurveyor desktop app: project workflows, file evidence, AI chat, the market and Solana payments, in a native window.",
    image: "/og/site.jpg",
    priority: 0.6,
    changefreq: "monthly",
  },
  {
    path: "/contact",
    title: "Contact | SiteSurveyor",
    description:
      "Product questions, listings and security reports: write to the SiteSurveyor team.",
    image: "/og/site.jpg",
    priority: 0.5,
    changefreq: "yearly",
  },
  {
    path: "/privacy",
    title: "Privacy | SiteSurveyor",
    description:
      "How SiteSurveyor handles account data, workspace records, site files and payments.",
    image: "/og/site.jpg",
    priority: 0.3,
    changefreq: "yearly",
  },
  {
    path: "/terms",
    title: "Terms | SiteSurveyor",
    description:
      "The terms that govern use of the SiteSurveyor platform, its marketplace and its paid services.",
    image: "/og/site.jpg",
    priority: 0.3,
    changefreq: "yearly",
  },
];

/**
 * Paths that exist only for signed-in people. They are disallowed in
 * `robots.txt` and answered with `X-Robots-Tag: noindex` by the server, so a
 * crawler never lists the sign-in pages as results.
 */
export const APP_ONLY_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/auth",
  "/onboarding",
  "/account",
  "/workspace",
];

/** The route table entry for a path, if it is one of the public pages. */
export function findPublicRoute(path: string): PublicRoute | undefined {
  return PUBLIC_ROUTES.find((route) => route.path === path);
}

/** True for the signed-in surfaces, which are kept out of the index. */
export function isAppOnlyPath(path: string): boolean {
  return APP_ONLY_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
