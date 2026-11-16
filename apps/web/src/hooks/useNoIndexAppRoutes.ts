/**
 * Keep the signed-in surfaces out of the index.
 *
 * The server answers those paths with `X-Robots-Tag: noindex, nofollow`, and
 * that header wins. This hook writes the same instruction into the document
 * so the instruction still holds when the app is served by something other
 * than the nginx image.
 *
 * Public pages are left alone: they write their own `robots` tag, and
 * touching it here would overwrite theirs.
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { isAppOnlyPath } from "../lib/seo/routes.ts";

export function useNoIndexAppRoutes(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isAppOnlyPath(pathname)) return;

    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "noindex, nofollow");

    // The static head names the landing page as canonical. On a signed-in
    // surface that would point the crawler at a page it is not on, so the
    // claim is dropped instead of restated.
    document.head.querySelector('link[rel="canonical"]')?.remove();
  }, [pathname]);
}
