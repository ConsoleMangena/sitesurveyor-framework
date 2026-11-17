/**
 * Resolve the newest published GitHub release of this repository.
 *
 * The desktop download page points its installer buttons at the release
 * assets, whose filenames carry the app version. Fetching the release keeps
 * the page correct after every tag without editing a hardcoded version, and
 * keeps the buttons on `browser_download_url`, which GitHub redirects per
 * release. A failure is not worth a retry: the page falls back to linking the
 * releases overview, which always resolves to the current one.
 */

import { useEffect, useState } from "react";

const RELEASE_API_URL =
  "https://api.github.com/repos/ConsoleMangena/sitesurveyor-framework/releases/latest";

/** Where the releases overview lives, used as the fallback link. */
export const RELEASES_PAGE_URL =
  "https://github.com/ConsoleMangena/sitesurveyor-framework/releases/latest";

export interface ReleaseAsset {
  /** Original filename, for example `SiteSurveyor_2.0.0_x64-setup.exe`. */
  name: string;
  /** Bytes, for the size label next to the button. */
  size: number;
  /** GitHub's per-asset download URL. */
  url: string;
}

export interface ReleaseInfo {
  /** Release tag, for example `v2.0`. */
  tag: string;
  /** ISO timestamp of publication. */
  publishedAt: string;
  /** The release page on GitHub. */
  pageUrl: string;
  assets: ReleaseAsset[];
}

export type LatestRelease =
  | { state: "loading" }
  | { state: "ready"; release: ReleaseInfo }
  | { state: "unavailable" };

interface GitHubAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

function toRelease(data: {
  tag_name?: unknown;
  published_at?: unknown;
  html_url?: unknown;
  assets?: unknown;
}): ReleaseInfo | null {
  const tag = typeof data.tag_name === "string" ? data.tag_name : null;
  const publishedAt =
    typeof data.published_at === "string" ? data.published_at : null;
  const pageUrl = typeof data.html_url === "string" ? data.html_url : null;
  const assets = Array.isArray(data.assets) ? data.assets : null;
  if (!tag || !publishedAt || !pageUrl || !assets) return null;
  return {
    tag,
    publishedAt,
    pageUrl,
    assets: assets
      .filter(
        (asset): asset is GitHubAsset =>
          typeof asset === "object" &&
          asset !== null &&
          typeof (asset as GitHubAsset).name === "string" &&
          typeof (asset as GitHubAsset).browser_download_url === "string",
      )
      .map((asset) => ({
        name: asset.name,
        size: typeof asset.size === "number" ? asset.size : 0,
        url: asset.browser_download_url,
      })),
  };
}

export function useLatestRelease(): LatestRelease {
  const [state, setState] = useState<LatestRelease>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(RELEASE_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(response.status),
      )
      .then((data) => {
        const release = toRelease(data);
        setState(release ? { state: "ready", release } : { state: "unavailable" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ state: "unavailable" });
      });
    return () => controller.abort();
  }, []);

  return state;
}
