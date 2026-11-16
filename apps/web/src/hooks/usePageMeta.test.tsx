import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePageMeta } from "./usePageMeta";

function Probe({ path }: { path: string }) {
  usePageMeta({
    title: "A page | SiteSurveyor",
    description: "A description of the page for search engines.",
    path,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "A page",
    },
  });
  return null;
}

function contentOf(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute("content") ?? null;
}

describe("usePageMeta", () => {
  afterEach(() => {
    document.head.replaceChildren();
    document.title = "";
    vi.unstubAllEnvs();
  });

  it("writes the title, description and canonical address", () => {
    render(<Probe path="/journal/a-post" />);

    expect(document.title).toBe("A page | SiteSurveyor");
    expect(contentOf('meta[name="description"]')).toBe(
      "A description of the page for search engines.",
    );
    const canonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    expect(canonical?.getAttribute("href")).toBe(
      "https://sitesurveyor.tech/journal/a-post",
    );
  });

  it("writes the social share card", () => {
    render(<Probe path="/about" />);

    expect(contentOf('meta[property="og:title"]')).toBe(
      "A page | SiteSurveyor",
    );
    expect(contentOf('meta[property="og:url"]')).toBe(
      "https://sitesurveyor.tech/about",
    );
    expect(contentOf('meta[property="og:image"]')).toBe(
      "https://sitesurveyor.tech/og/site.jpg",
    );
    expect(contentOf('meta[name="twitter:card"]')).toBe("summary_large_image");
  });

  it("publishes the structured data as a single script", () => {
    render(<Probe path="/about" />);

    const script = document.head.querySelector<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    );
    expect(script).not.toBeNull();
    expect(JSON.parse(script?.textContent ?? "{}")).toMatchObject({
      "@type": "Article",
    });
  });

  it("takes the tags down again when the page goes away", () => {
    const { unmount } = render(<Probe path="/about" />);
    unmount();

    expect(document.head.querySelector('meta[property="og:url"]')).toBeNull();
    expect(
      document.head.querySelector('script[type="application/ld+json"]'),
    ).toBeNull();
  });
});
