/**
 * Write a public page's head tags into the document.
 *
 * A search engine runs the app and reads what the page writes here, but a chat
 * client or a social network never runs the app at all — it reads the bytes
 * the server sent. So the head has to be right in both places: this hook
 * handles the first, and the static head in `index.html` (with the same
 * records written into it at build time) handles the second.
 *
 * The canonical URL is written per route, which is what stops the same page
 * from being indexed under its address with a tracking query attached.
 */

import { useEffect, useMemo } from "react";

import { getPublicWebOrigin } from "../lib/platform.ts";
import { absoluteUrl, type PageMeta } from "../lib/seo/meta.ts";
import { DEFAULT_SHARE_IMAGE } from "../lib/seo/routes.ts";

/** Marks the tags this hook owns, so a later route can take them over cleanly. */
const MANAGED_ATTRIBUTE = "data-seo-managed";

function upsertMeta(
  attribute: "name" | "property",
  key: string,
  content: string,
): void {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  );
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    element.setAttribute(MANAGED_ATTRIBUTE, "true");
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function upsertCanonical(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute(MANAGED_ATTRIBUTE, "true");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

function removeManagedTags(): void {
  document
    .querySelectorAll(`[${MANAGED_ATTRIBUTE}]`)
    .forEach((element) => element.remove());
}

/**
 * Publish a page's metadata: title, description, canonical address, the
 * social share card and any structured data.
 */
export function usePageMeta(meta: PageMeta): void {
  const {
    title,
    description,
    path,
    image = DEFAULT_SHARE_IMAGE,
    type = "website",
    jsonLd,
    noindex = false,
  } = meta;

  // The structured data is serialised here so the effect below depends on the
  // text rather than on the object: a caller that builds its JSON-LD inline
  // would otherwise re-run the effect on every render. Each record goes into
  // its own script block, which is what the structured data parsers expect.
  const jsonLdJson = useMemo(() => {
    if (!jsonLd) return [] as string[];
    const blocks = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    return blocks.map((block) => JSON.stringify(block));
  }, [jsonLd]);

  useEffect(() => {
    const origin = getPublicWebOrigin();
    const url = absoluteUrl(origin, path);
    const imageUrl = absoluteUrl(origin, image);

    const previousTitle = document.title;
    document.title = title;

    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");

    upsertCanonical(url);

    upsertMeta("property", "og:site_name", "SiteSurveyor");
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:image", imageUrl);
    upsertMeta("property", "og:image:width", "1200");
    upsertMeta("property", "og:image:height", "630");

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", imageUrl);

    const scripts = jsonLdJson.map((json) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute(MANAGED_ATTRIBUTE, "true");
      script.textContent = json;
      document.head.appendChild(script);
      return script;
    });

    return () => {
      document.title = previousTitle;
      scripts.forEach((script) => script.remove());
      removeManagedTags();
    };
  }, [title, description, path, image, type, jsonLdJson, noindex]);
}
