import { describe, expect, it } from "vitest";

import {
  areaText,
  canAfford,
  creditText,
  parseQuote,
  type SurveyQuote,
} from "./pricing.ts";

function quote(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    credits: 17,
    surface_area_km2: 668.4,
    surface_area_ha: 66840,
    half_deg: 0.12,
    latitude: -19.5,
    categories: ["water"],
    lines: [
      {
        category: "water",
        label: "Groundwater survey",
        base_credits: 4,
        area_credits: 12.03,
        credits: 17,
        minimum_credits: 10,
      },
    ],
    ...overrides,
  };
}

describe("parseQuote", () => {
  it("reads the platform's quote", () => {
    const parsed = parseQuote(quote());

    expect(parsed?.credits).toBe(17);
    expect(parsed?.surfaceAreaKm2).toBe(668.4);
    expect(parsed?.surfaceAreaHa).toBe(66840);
    expect(parsed?.lines).toHaveLength(1);
    expect(parsed?.lines[0]).toEqual({
      category: "water",
      label: "Groundwater survey",
      baseCredits: 4,
      areaCredits: 12.03,
      credits: 17,
      minimumCredits: 10,
    });
  });

  it("refuses a quote with no usable total rather than reporting a free survey", () => {
    expect(parseQuote(quote({ credits: 0 }))).toBeNull();
    expect(parseQuote(quote({ credits: -4 }))).toBeNull();
    expect(parseQuote(quote({ surface_area_km2: 0 }))).toBeNull();
  });

  it("refuses a document that is not a quote at all", () => {
    expect(parseQuote(null)).toBeNull();
    expect(parseQuote("17 credits")).toBeNull();
    expect(parseQuote({})).toBeNull();
  });

  it("drops a line the platform has renamed the category of, and keeps the rest", () => {
    const parsed = parseQuote(
      quote({
        lines: [
          { category: "water", label: "Groundwater survey", credits: 17 },
          { category: "geothermal", label: "Unknown survey", credits: 9 },
        ],
      }),
    );

    expect(parsed?.lines.map((line) => line.category)).toEqual(["water"]);
  });

  it("derives the hectares when the platform omits them", () => {
    const parsed = parseQuote(quote({ surface_area_ha: undefined }));

    expect(parsed?.surfaceAreaHa).toBeCloseTo(66840, 0);
  });
});

describe("areaText", () => {
  it("names the ground in the units a reader thinks in", () => {
    expect(areaText(parseQuote(quote()))).toBe("668 km² (66,840 ha)");
  });

  it("keeps a decimal for a small plot", () => {
    const parsed = parseQuote(quote({ surface_area_km2: 2.4, surface_area_ha: 240 }));

    expect(areaText(parsed)).toBe("2.4 km² (240 ha)");
  });

  it("says nothing rather than guessing", () => {
    expect(areaText(null)).toBe("—");
  });
});

describe("creditText", () => {
  it("pluralises the way a person would say it", () => {
    expect(creditText(1)).toBe("1 credit");
    expect(creditText(17)).toBe("17 credits");
  });

  it("says nothing rather than claiming a cost of zero", () => {
    expect(creditText(null)).toBe("—");
    expect(creditText(Number.NaN)).toBe("—");
  });
});

describe("canAfford", () => {
  const priced: SurveyQuote = parseQuote(quote()) as SurveyQuote;

  it("allows a survey the workspace can pay for", () => {
    expect(canAfford(priced, 17)).toBe(true);
    expect(canAfford(priced, 500)).toBe(true);
  });

  it("refuses a survey the workspace cannot pay for", () => {
    expect(canAfford(priced, 16)).toBe(false);
    expect(canAfford(priced, 0)).toBe(false);
  });

  it("does not refuse on a balance the platform has not reported", () => {
    expect(canAfford(priced, null)).toBe(true);
    expect(canAfford(null, 0)).toBe(true);
  });
});
