/**
 * The sitemap, built from the same route table the pages use.
 *
 * The site is a single page application, so a crawler has to be told where the
 * public pages are — it cannot find them by following links from one HTML
 * document. The journal posts are included here from their own content
 * module, which means a new post is in the sitemap the moment it is written.
 */

import type { ChangeFreq, PublicRoute } from "./routes.ts";
import { absoluteUrl } from "./meta.ts";

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: ChangeFreq;
  priority?: number;
}

export interface SitemapJournalEntry {
  slug: string;
  date: string;
}

/**
 * The entries of the sitemap: the public routes, then the journal posts.
 */
export function buildSitemapEntries(
  routes: PublicRoute[],
  origin: string,
  journal: SitemapJournalEntry[] = [],
): SitemapEntry[] {
  const pages: SitemapEntry[] = routes.map((route) => ({
    loc: absoluteUrl(origin, route.path),
    changefreq: route.changefreq,
    priority: route.priority,
  }));

  const posts: SitemapEntry[] = journal.map((entry) => ({
    loc: absoluteUrl(origin, `/journal/${entry.slug}`),
    lastmod: entry.date,
    changefreq: "monthly",
    priority: 0.7,
  }));

  return [...pages, ...posts];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The sitemap document itself. */
export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const lines = [`    <loc>${escapeXml(entry.loc)}</loc>`];
      if (entry.lastmod) lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      if (entry.changefreq) {
        lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      }
      if (typeof entry.priority === "number") {
        lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      }
      return `  <url>\n${lines.join("\n")}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
