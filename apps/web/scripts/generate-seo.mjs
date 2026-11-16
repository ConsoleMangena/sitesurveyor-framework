/**
 * The SEO files the server hands out.
 *
 *   sitemap.xml   the public pages and the journal posts, so a crawler can
 *                 find them without following links through a single-page app
 *   robots.txt    the signed-in surfaces, listed once, so the same list can
 *                 also be sent as `X-Robots-Tag` by the server
 *   og/*.jpg      the 1200x630 share cards, built from the licensed photographs
 *                 the site already uses
 *
 * Everything is derived from the route table and the content modules, so the
 * sitemap can never list a page that does not exist and a share card can never
 * point at a photo the site does not ship.
 *
 * The TypeScript sources are bundled in memory with esbuild and imported from
 * there — the same modules the app uses, not a copy of them.
 */

import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const dist = path.join(appRoot, "dist");

const ORIGIN = (
  process.env.VITE_PUBLIC_APP_URL?.trim() || "https://sitesurveyor.tech"
).replace(/\/+$/, "");

const WIDTH = 1200;
const HEIGHT = 630;

/** Load the route table, the content module and the builders as one module. */
async function loadSiteModules() {
  const result = await build({
    stdin: {
      contents: [
        'export * from "./src/lib/seo/routes.ts";',
        'export * from "./src/lib/seo/meta.ts";',
        'export * from "./src/lib/seo/sitemap.ts";',
        'export * from "./src/lib/seo/robots.ts";',
        'export * from "./src/lib/content/journal.ts";',
        'export * from "./src/lib/content/journalPhotos.ts";',
        'export * from "./src/lib/content/surveyPhotos.ts";',
      ].join("\n"),
      resolveDir: appRoot,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });

  const code = result.outputFiles[0].text;
  const file = path.join(appRoot, "node_modules", ".cache", "seo-modules.mjs");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, code, "utf8");
  return import(pathToFileURL(file).href);
}

/** Split a long title into lines that fit the card. */
function wrapTitle(title, maxChars = 38) {
  const words = title.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textCardSvg({ title, kicker, lines }) {
  const lineHeight = 62;
  const startY = HEIGHT - 150 - (lines.length - 1) * lineHeight;
  const text = lines
    .map(
      (line, index) =>
        `<text x="72" y="${startY + index * lineHeight}" font-family="Inter, 'DejaVu Sans', Arial, sans-serif" font-size="52" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`,
    )
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="45%" stop-color="#0f172a" stop-opacity="0"/>
          <stop offset="100%" stop-color="#0f172a" stop-opacity="0.92"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#shade)"/>
      <rect x="0" y="0" width="10" height="${HEIGHT}" fill="#d92d20"/>
      <text x="72" y="96" font-family="Inter, 'DejaVu Sans', Arial, sans-serif" font-size="30" font-weight="700" fill="#f8fafc" letter-spacing="1">${escapeXml(kicker)}</text>
      ${text}
    </svg>`,
  );
}

function brandCardSvg({ title, kicker }) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#0f172a"/>
      <rect x="0" y="0" width="10" height="${HEIGHT}" fill="#d92d20"/>
      <text x="72" y="300" font-family="Inter, 'DejaVu Sans', Arial, sans-serif" font-size="84" font-weight="700" fill="#ffffff">${escapeXml(title)}</text>
      <text x="72" y="380" font-family="Inter, 'DejaVu Sans', Arial, sans-serif" font-size="34" fill="#cbd5e1">${escapeXml(kicker)}</text>
      <text x="72" y="560" font-family="Inter, 'DejaVu Sans', Arial, sans-serif" font-size="26" fill="#94a3b8" letter-spacing="2">SITESURVEYOR.TECH</text>
    </svg>`,
  );
}

/**
 * The static head, printed into the built HTML.
 *
 * The app writes its own tags at runtime, but a crawler that does not run
 * JavaScript only sees what the server sent. The landing page's records are
 * therefore printed into the document as well, from the same route table.
 */
function buildStaticHead(route, origin, jsonLd, siteName) {
  const url = `${origin}${route.path === "/" ? "/" : route.path}`;
  const image = `${origin}${route.image ?? "/og/site.jpg"}`;
  const escape = (value) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const tags = [
    `<title>${escape(route.title)}</title>`,
    `<meta name="description" content="${escape(route.description)}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<link rel="canonical" href="${escape(url)}" />`,
    `<meta property="og:site_name" content="${escape(siteName)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escape(route.title)}" />`,
    `<meta property="og:description" content="${escape(route.description)}" />`,
    `<meta property="og:url" content="${escape(url)}" />`,
    `<meta property="og:image" content="${escape(image)}" />`,
    `<meta property="og:image:width" content="${WIDTH}" />`,
    `<meta property="og:image:height" content="${HEIGHT}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escape(route.title)}" />`,
    `<meta name="twitter:description" content="${escape(route.description)}" />`,
    `<meta name="twitter:image" content="${escape(image)}" />`,
  ];
  // One script per record: the structured data parsers expect a single object
  // in each block rather than an array.
  for (const record of jsonLd) {
    tags.push(`<script type="application/ld+json">${JSON.stringify(record)}</script>`);
  }
  return tags.join("\n    ");
}
/**
 * Build one card: the photograph cropped to the card's shape, a shade over the
 * lower half, and the title on top of it.
 */
async function buildPhotoCard(sharp, photoPath, { title, kicker }) {
  const lines = wrapTitle(title);
  const overlay = textCardSvg({ title, kicker, lines });
  return sharp(photoPath)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 86, progressive: true })
    .toBuffer();
}

async function main() {
  const site = await loadSiteModules();

  // sharp is optional in a build environment that installed without scripts.
  // When it is missing the committed brand card is used for every share card
  // instead, so a card referenced by the head tags always exists.
  let sharp = null;
  try {
    const module = await import("sharp");
    sharp = module.default;
  } catch {
    console.warn("[seo] sharp is unavailable, using the committed brand card");
  }

  await fs.mkdir(path.join(dist, "og"), { recursive: true });

  const siteCardPath = path.join(dist, "og", "site.jpg");
  const staticCardPath = path.join(appRoot, "public", "og", "site.jpg");

  if (sharp) {
    const brandCard = await sharp(
      brandCardSvg({ title: "SiteSurveyor", kicker: "Plan the work. Prove the survey." }),
    )
      .jpeg({ quality: 88, progressive: true })
      .toBuffer();
    await fs.writeFile(siteCardPath, brandCard);
  } else {
    await fs.copyFile(staticCardPath, siteCardPath);
  }

  // One card per journal post, built from the post's own photograph.
  for (const entry of site.JOURNAL_ENTRIES) {
    const cardPath = path.join(dist, "og", `${entry.slug}.jpg`);
    if (!sharp) {
      await fs.copyFile(siteCardPath, cardPath);
      continue;
    }
    const key = site.journalPhoto(entry.slug);
    const photo = site.SURVEY_PHOTOS[key];
    if (!photo) continue;
    const photoPath = path.join(appRoot, "public", photo.src.replace(/^\//, ""));
    try {
      await fs.access(photoPath);
    } catch {
      continue;
    }
    const card = await buildPhotoCard(sharp, photoPath, {
      title: entry.title,
      kicker: "SiteSurveyor Blogs",
    });
    await fs.writeFile(cardPath, card);
  }

  // The sitemap and the robots file, from the same route table the app uses.
  const entries = site.buildSitemapEntries(
    site.PUBLIC_ROUTES,
    ORIGIN,
    site.JOURNAL_ENTRIES.map((entry) => ({ slug: entry.slug, date: entry.date })),
  );
  await fs.writeFile(
    path.join(dist, "sitemap.xml"),
    site.buildSitemapXml(entries),
    "utf8",
  );
  await fs.writeFile(
    path.join(dist, "robots.txt"),
    site.buildRobotsTxt(ORIGIN, site.APP_ONLY_PREFIXES),
    "utf8",
  );

  // The static head of the landing page, printed into the built HTML.
  const landing =
    site.PUBLIC_ROUTES.find((route) => route.path === "/") ?? site.PUBLIC_ROUTES[0];
  const indexHtml = path.join(dist, "index.html");
  const html = await fs.readFile(indexHtml, "utf8");
  const head = buildStaticHead(
    landing,
    ORIGIN,
    [site.organizationJsonLd(ORIGIN), site.websiteJsonLd(ORIGIN)],
    site.SITE_NAME,
  );
  const replaced = html.replace(
    /<!--\s*seo-head:start\s*-->[\s\S]*?<!--\s*seo-head:end\s*-->/,
    `<!-- seo-head:start -->\n    ${head}\n    <!-- seo-head:end -->`,
  );
  if (replaced === html) {
    throw new Error("the seo-head markers are missing from dist/index.html");
  }
  await fs.writeFile(indexHtml, replaced, "utf8");

  console.log(
    `[seo] sitemap (${entries.length} urls), robots.txt, ${site.JOURNAL_ENTRIES.length + 1} share cards and the static head written to dist`,
  );
}

await main();
