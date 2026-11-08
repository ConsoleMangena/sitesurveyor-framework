import { useEffect } from "react";

/**
 * Set `document.title` for the lifetime of a mounted route, then restore the
 * previous title on unmount.
 *
 * The SPA ships one static title in `index.html`, so every route — including
 * the public market, which is the page strangers land on from a search result —
 * read "SiteSurveyor" in the tab, the history and any shared link preview.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
