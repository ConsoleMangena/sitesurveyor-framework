/**
 * The head tags a public page needs, and the structured data that goes with
 * them.
 *
 * Search engines read the HTML, but chat clients, Slack, WhatsApp and X do not
 * run JavaScript — they read whatever the server sent. So the same records
 * have to exist twice: written into the document by {@link usePageMeta} for
 * crawlers that render, and printed into the static head for the ones that
 * cannot. These builders are what both sides share.
 */

import { DEFAULT_SHARE_IMAGE, SITE_NAME, SITE_TAGLINE } from "./routes.ts";

export interface JsonLd {
  "@context": "https://schema.org";
  "@type": string;
  [key: string]: unknown;
}

export interface PageMeta {
  /** Document title. */
  title: string;
  /** Meta description, and the body of the social share. */
  description: string;
  /** Path from the site root, e.g. "/journal/a-post". */
  path: string;
  /** Share image path, relative to the site root. */
  image?: string;
  /** Open Graph type. Articles carry a published date; pages do not. */
  type?: "website" | "article";
  /** Structured data to publish alongside the tags. */
  jsonLd?: JsonLd | JsonLd[];
  /** Keep the page out of the index. Used for signed-in surfaces. */
  noindex?: boolean;
}

/** Join an origin and a path into an absolute URL. */
export function absoluteUrl(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, "");
  if (!path) return base;
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

/**
 * The organisation the site belongs to. Search engines use this to connect the
 * pages to each other and to the brand.
 */
export function organizationJsonLd(origin: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: origin,
    slogan: SITE_TAGLINE,
    logo: absoluteUrl(origin, "/logo.svg"),
  };
}

/** The site itself, with its name and the pages it covers. */
export function websiteJsonLd(origin: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: origin,
    description: SITE_TAGLINE,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: origin,
    },
  };
}

/** A journal post, with the details a rich result needs. */
export function articleJsonLd(input: {
  origin: string;
  title: string;
  description: string;
  path: string;
  image?: string;
  datePublished: string;
  dateModified?: string;
}): JsonLd {
  const url = absoluteUrl(input.origin, input.path);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    image: [absoluteUrl(input.origin, input.image ?? DEFAULT_SHARE_IMAGE)],
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl(input.origin, "/logo.svg"),
      },
    },
  };
}

export interface Breadcrumb {
  name: string;
  path: string;
}

/** The path a reader took to get here. */
export function breadcrumbJsonLd(origin: string, trail: Breadcrumb[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(origin, crumb.path),
    })),
  };
}

export interface FaqEntry {
  question: string;
  answer: string;
}

/** The help centre, published as a question-and-answer block. */
export function faqJsonLd(entries: FaqEntry[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

/** The list of journal entries, as an item list. */
export function itemListJsonLd(
  origin: string,
  items: { name: string; path: string }[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(origin, item.path),
    })),
  };
}
