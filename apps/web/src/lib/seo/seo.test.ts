import { describe, expect, it } from "vitest";

import {
  absoluteUrl,
  articleJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  itemListJsonLd,
  organizationJsonLd,
  websiteJsonLd,
} from "./meta.ts";
import { buildRobotsTxt } from "./robots.ts";
import {
  APP_ONLY_PREFIXES,
  DEFAULT_SHARE_IMAGE,
  PUBLIC_ROUTES,
  findPublicRoute,
  isAppOnlyPath,
} from "./routes.ts";
import { buildSitemapEntries, buildSitemapXml } from "./sitemap.ts";

const ORIGIN = "https://sitesurveyor.tech";

describe("public route table", () => {
  it("gives every public page a title and a description a search result can show", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route.title.length).toBeGreaterThan(10);
      expect(route.description.length).toBeGreaterThan(50);
      expect(route.description.length).toBeLessThanOrEqual(160);
      expect(route.path.startsWith("/")).toBe(true);
    }
  });

  it("lists each path once", () => {
    const paths = PUBLIC_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("keeps the signed-in surfaces off the public list", () => {
    const paths = PUBLIC_ROUTES.map((route) => route.path);
    for (const prefix of APP_ONLY_PREFIXES) {
      expect(paths.some((path) => path.startsWith(prefix))).toBe(false);
    }
  });

  it("finds a route by path", () => {
    expect(findPublicRoute("/about")?.title).toBe("About | SiteSurveyor");
    expect(findPublicRoute("/workspace")).toBeUndefined();
  });

  it("recognises the signed-in surfaces, and only them", () => {
    expect(isAppOnlyPath("/login")).toBe(true);
    expect(isAppOnlyPath("/workspace/projects")).toBe(true);
    expect(isAppOnlyPath("/auth/callback")).toBe(true);
    expect(isAppOnlyPath("/about")).toBe(false);
    expect(isAppOnlyPath("/journal")).toBe(false);
    expect(isAppOnlyPath("/workspaces")).toBe(false);
  });
});

describe("absolute urls", () => {
  it("joins an origin and a path without doubling the slash", () => {
    expect(absoluteUrl("https://sitesurveyor.tech", "/about")).toBe(
      "https://sitesurveyor.tech/about",
    );
    expect(absoluteUrl("https://sitesurveyor.tech/", "/about")).toBe(
      "https://sitesurveyor.tech/about",
    );
    expect(absoluteUrl("https://sitesurveyor.tech", "about")).toBe(
      "https://sitesurveyor.tech/about",
    );
  });
});

describe("structured data", () => {
  it("describes the organisation and the site", () => {
    const organization = organizationJsonLd(ORIGIN);
    expect(organization["@type"]).toBe("Organization");
    expect(organization.url).toBe(ORIGIN);

    const website = websiteJsonLd(ORIGIN);
    expect(website["@type"]).toBe("WebSite");
    expect(website.publisher).toMatchObject({ "@type": "Organization" });
  });

  it("describes a journal post with a published date and an absolute image", () => {
    const article = articleJsonLd({
      origin: ORIGIN,
      title: "Hash anchors explained",
      description: "How a file is proven on the chain.",
      path: "/journal/hash-anchors-explained",
      datePublished: "2026-05-02",
    });
    expect(article["@type"]).toBe("BlogPosting");
    expect(article.datePublished).toBe("2026-05-02");
    expect(article.image).toEqual([
      `${ORIGIN}${DEFAULT_SHARE_IMAGE}`,
    ]);
    const mainEntity = article.mainEntityOfPage as { "@id": string };
    expect(mainEntity["@id"]).toContain("/journal/hash-anchors-explained");  });

  it("numbers the breadcrumb trail from one", () => {
    const trail = breadcrumbJsonLd(ORIGIN, [
      { name: "Home", path: "/" },
      { name: "Blogs", path: "/journal" },
    ]);
    const items = trail.itemListElement as { position: number }[];
    expect(items.map((item) => item.position)).toEqual([1, 2]);
  });

  it("pairs every question with an answer", () => {
    const faq = faqJsonLd([
      { question: "Does it work offline?", answer: "Cached screens only." },
    ]);
    const entities = faq.mainEntity as { name: string }[];
    expect(entities).toHaveLength(1);
    expect(entities[0].name).toBe("Does it work offline?");
  });

  it("links the items of a list to their pages", () => {
    const list = itemListJsonLd(ORIGIN, [
      { name: "A post", path: "/journal/a-post" },
    ]);
    const items = list.itemListElement as { url: string }[];
    expect(items[0].url).toBe(`${ORIGIN}/journal/a-post`);
  });
});

describe("sitemap", () => {
  it("lists the public pages and the journal posts", () => {
    const entries = buildSitemapEntries(PUBLIC_ROUTES, ORIGIN, [
      { slug: "hash-anchors-explained", date: "2026-05-02" },
    ]);
    const locations = entries.map((entry) => entry.loc);

    expect(locations).toContain(`${ORIGIN}/`);
    expect(locations).toContain(`${ORIGIN}/about`);
    expect(locations).toContain(`${ORIGIN}/journal/hash-anchors-explained`);
    expect(locations).not.toContain(`${ORIGIN}/workspace`);
  });

  it("records the journal date as the last modification", () => {
    const entries = buildSitemapEntries(PUBLIC_ROUTES, ORIGIN, [
      { slug: "hash-anchors-explained", date: "2026-05-02" },
    ]);
    const post = entries.find((entry) =>
      entry.loc.endsWith("/journal/hash-anchors-explained"),
    );
    expect(post?.lastmod).toBe("2026-05-02");
  });

  it("writes a document a crawler can parse", () => {
    const xml = buildSitemapXml(
      buildSitemapEntries(PUBLIC_ROUTES, ORIGIN, [
        { slug: "hash-anchors-explained", date: "2026-05-02" },
      ]),
    );
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain("<loc>https://sitesurveyor.tech/about</loc>");
    expect(xml).toContain("<lastmod>2026-05-02</lastmod>");
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("escapes characters that would break the document", () => {
    const xml = buildSitemapXml([{ loc: "https://example.com/a?x=1&y=2" }]);
    expect(xml).toContain("&amp;");
    expect(xml).not.toContain("&y=2");
  });
});

describe("robots", () => {
  it("allows the public site and names the sitemap", () => {
    const robots = buildRobotsTxt(ORIGIN, APP_ONLY_PREFIXES);
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Disallow: /workspace");
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });
});
