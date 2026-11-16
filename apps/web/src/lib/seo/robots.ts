/**
 * `robots.txt`, built from the same list of app-only paths the server sends
 * `X-Robots-Tag` for.
 *
 * Disallowing a path keeps a crawler from spending its budget on it, but it
 * does not stop the URL appearing in results as a bare link — only the header
 * does that. The two are written from the same list so they cannot drift.
 */

import { absoluteUrl } from "./meta.ts";

/**
 * The robots document. Every path in `disallow` is a signed-in surface; the
 * public pages are found through the sitemap.
 */
export function buildRobotsTxt(origin: string, disallow: string[]): string {
  const lines = ["User-agent: *", "Allow: /"];
  for (const path of disallow) {
    lines.push(`Disallow: ${path}`);
  }
  lines.push("", `Sitemap: ${absoluteUrl(origin, "/sitemap.xml")}`, "");
  return lines.join("\n");
}
