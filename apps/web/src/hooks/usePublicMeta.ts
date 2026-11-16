/**
 * Publish the metadata of a public page.
 *
 * The title, description and share image come from the route table, so a page
 * and its sitemap entry can never disagree about what the page is. Only the
 * structured data is left to the page, because what a page is *about* is what
 * the page knows.
 */

import { useMemo } from "react";

import { getPublicWebOrigin } from "../lib/platform.ts";
import type { JsonLd } from "../lib/seo/meta.ts";
import { DEFAULT_SHARE_IMAGE, findPublicRoute } from "../lib/seo/routes.ts";
import { usePageMeta } from "./usePageMeta.ts";

export interface PublicMetaOptions {
  /**
   * The structured data for the page. Given the site origin, because every
   * schema URL has to be absolute.
   */
  jsonLd?: (origin: string) => JsonLd | JsonLd[] | undefined;
  /** Overrides the share image from the route table. */
  image?: string;
  /** Overrides the title from the route table. */
  title?: string;
  /** Overrides the description from the route table. */
  description?: string;
}

export function usePublicMeta(path: string, options: PublicMetaOptions = {}): void {
  const { jsonLd: buildJsonLd, title: titleOverride, description: descriptionOverride, image: imageOverride } = options;

  const route = findPublicRoute(path);
  const title = titleOverride ?? route?.title ?? "SiteSurveyor";
  const description =
    descriptionOverride ??
    route?.description ??
    "Survey operations, evidence and settlement in one workspace.";
  const image = imageOverride ?? route?.image ?? DEFAULT_SHARE_IMAGE;

  const jsonLd = useMemo(
    () => buildJsonLd?.(getPublicWebOrigin()),
    [buildJsonLd],
  );

  usePageMeta({
    title,
    description,
    path,
    image,
    jsonLd,
  });
}
