import { describe, expect, it } from "vitest";
import {
  buildMarketDots,
  MARKET_DOT_COLORS,
  toFeatureCollection,
  type MarketDot,
  type MarketDotGroup,
} from "./marketDots";

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Item ${id}`,
    location: "Nairobi",
    latitude: -1.2,
    longitude: 36.8,
    ...overrides,
  };
}

function group(
  rows: ReturnType<typeof row>[],
  kind: MarketDotGroup["kind"],
): MarketDotGroup {
  return { rows, kind };
}

describe("buildMarketDots", () => {
  it("drops rows without finite coordinates", () => {
    const dots = buildMarketDots([
      group([row("a"), row("b", { latitude: null })], "listing"),
      group([row("c", { longitude: NaN })], "professional"),
    ]);
    expect(dots.map((d) => d.id)).toEqual(["a"]);
  });

  it("tags kinds and maps coordinates", () => {
    const dots = buildMarketDots([
      group([row("a")], "listing"),
      group([row("p")], "professional"),
    ]);
    expect(dots).toEqual([
      {
        kind: "listing",
        id: "a",
        name: "Item a",
        location: "Nairobi",
        lat: -1.2,
        lng: 36.8,
      },
      {
        kind: "professional",
        id: "p",
        name: "Item p",
        location: "Nairobi",
        lat: -1.2,
        lng: 36.8,
      },
    ]);
  });

  it("supports all five directory kinds", () => {
    const dots = buildMarketDots([
      group([row("a")], "listing"),
      group([row("p")], "professional"),
      group([row("j")], "job"),
      group([row("f")], "firm"),
      group([row("e")], "event"),
    ]);
    expect(dots.map((d) => d.kind)).toEqual([
      "listing",
      "professional",
      "job",
      "firm",
      "event",
    ]);
  });

  it("caps the total across groups, in group order", () => {
    const listings = ["a", "b"].map((i) => row(i));
    const professionals = ["p", "q"].map((i) => row(i));
    const dots = buildMarketDots(
      [group(listings, "listing"), group(professionals, "professional")],
      3,
    );
    expect(dots.map((d) => d.id)).toEqual(["a", "b", "p"]);
  });

  it("treats a null location as an empty string", () => {
    const dots = buildMarketDots([
      group([row("a", { location: null })], "listing"),
    ]);
    expect(dots[0]?.location).toBe("");
  });
});

describe("toFeatureCollection", () => {
  it("produces lng/lat point features carrying identity properties", () => {
    const dots: MarketDot[] = [
      { kind: "listing", id: "a", name: "A", location: "X", lat: -1.2, lng: 36.8 },
    ];
    expect(toFeatureCollection(dots)).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { kind: "listing", id: "a" },
          geometry: { type: "Point", coordinates: [36.8, -1.2] },
        },
      ],
    });
  });
});

describe("MARKET_DOT_COLORS", () => {
  it("keeps one stable hue per directory kind", () => {
    expect(MARKET_DOT_COLORS.listing).toBe("#f59e0b");
    expect(MARKET_DOT_COLORS.professional).toBe("#06b6d4");
    expect(MARKET_DOT_COLORS.job).toBe("#8b5cf6");
    expect(MARKET_DOT_COLORS.firm).toBe("#10b981");
    expect(MARKET_DOT_COLORS.event).toBe("#f43f5e");
  });
});
