import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RELEASES_PAGE_URL, useLatestRelease } from "./useLatestRelease.ts";

const RELEASE = {
  tag_name: "v2.0",
  published_at: "2026-11-16T21:00:00Z",
  html_url: "https://github.com/ConsoleMangena/sitesurveyor-framework/releases/tag/v2.0",
  assets: [
    {
      name: "SiteSurveyor_2.0.0_x64-setup.exe",
      size: 13987843,
      browser_download_url: "https://github.com/ConsoleMangena/sitesurveyor-framework/releases/download/v2.0/SiteSurveyor_2.0.0_x64-setup.exe",
    },
    {
      name: "SiteSurveyor_2.0.0_x64_en-US.msi",
      size: 14479360,
      browser_download_url: "https://github.com/ConsoleMangena/sitesurveyor-framework/releases/download/v2.0/SiteSurveyor_2.0.0_x64_en-US.msi",
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useLatestRelease", () => {
  it("maps the release payload onto the installer assets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(RELEASE),
        }),
      ),
    );

    const { result } = renderHook(() => useLatestRelease());
    expect(result.current.state).toBe("loading");

    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.release.tag).toBe("v2.0");
    expect(result.current.release.pageUrl).toContain("/releases/tag/v2.0");
    expect(result.current.release.assets).toHaveLength(2);
    expect(result.current.release.assets[0].name).toBe("SiteSurveyor_2.0.0_x64-setup.exe");
    expect(result.current.release.assets[0].url).toContain("/releases/download/v2.0/");
  });

  it("falls back to the releases page when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("blocked"))),
    );

    const { result } = renderHook(() => useLatestRelease());
    await waitFor(() => expect(result.current.state).toBe("unavailable"));
    expect(RELEASES_PAGE_URL).toContain("/releases/latest");
  });

  it("falls back to the releases page when the payload is unusable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tag_name: 42 }),
        }),
      ),
    );

    const { result } = renderHook(() => useLatestRelease());
    await waitFor(() => expect(result.current.state).toBe("unavailable"));
  });
});
