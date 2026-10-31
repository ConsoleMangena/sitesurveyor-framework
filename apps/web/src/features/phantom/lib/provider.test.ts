import { describe, expect, it } from "vitest";
import {
  phantomMobileBrowseUrl,
  solflareMobileBrowseUrl,
} from "./provider.ts";

describe("mobile wallet browse links", () => {
  const target = "https://app.example.com/login?next=%2Fdashboard";

  it("encodes the Solflare target URL and required ref", () => {
    expect(solflareMobileBrowseUrl(target)).toBe(
      `https://solflare.com/ul/v1/browse/${encodeURIComponent(target)}?ref=${encodeURIComponent(window.location.origin)}`,
    );
  });

  it("encodes the Phantom target URL and required ref", () => {
    expect(phantomMobileBrowseUrl(target)).toBe(
      `https://phantom.app/ul/browse/${encodeURIComponent(target)}?ref=${encodeURIComponent(window.location.origin)}`,
    );
  });

  it("never leaves a raw query string in the Solflare path", () => {
    const link = solflareMobileBrowseUrl(target);
    const path = link.slice("https://solflare.com/ul/v1/browse/".length);

    expect(path).not.toContain("?next=");
    expect(path.split("?")).toHaveLength(2);
    expect(path.endsWith(`?ref=${encodeURIComponent(window.location.origin)}`)).toBe(
      true,
    );
  });
});
