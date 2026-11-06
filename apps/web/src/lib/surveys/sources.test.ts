import { describe, expect, it } from "vitest";

import {
  DEFAULT_COMPOSITE,
  DEFAULT_OPTICAL,
  OPTICAL_PRODUCTS,
  WINDOW_LABELS,
  coverageLabel,
  imageryChip,
  inputsText,
  productById,
  windowOptions,
  yearOptions,
} from "./sources.ts";

describe("yearOptions", () => {
  it("answers for the span the coverage actually covers", () => {
    const years = yearOptions("gm_ls5_ls7_annual");

    expect(years[0]).toBe(1984);
    expect(years.at(-1)).toBe(2012);
    // 2015 is a real Landsat stamp, but not for this product — Landsat 8 started there.
    expect(years).not.toContain(2015);
  });

  it("keeps every product's menu inside its own range", () => {
    for (const product of OPTICAL_PRODUCTS) {
      const years = yearOptions(product.id);
      expect(years).toHaveLength(product.years[1] - product.years[0] + 1);
    }
  });

  it("offers the default year on the default coverage", () => {
    expect(yearOptions(DEFAULT_OPTICAL)).toContain(DEFAULT_COMPOSITE.year);
  });
});

describe("windowOptions", () => {
  it("switches a season off rather than hiding it, and says why", () => {
    const windows = windowOptions("gm_s2_annual");
    const dry = windows.find((window) => window.id === "dry");

    expect(windows).toHaveLength(Object.keys(WINDOW_LABELS).length);
    expect(dry?.available).toBe(false);
    expect(dry?.reason).toContain("ships no dry season");
  });

  it("serves every window on the composite the fetch builds itself", () => {
    expect(windowOptions("s2_l2a").every((window) => window.available)).toBe(true);
  });

  it("always leaves the full year available", () => {
    for (const product of OPTICAL_PRODUCTS) {
      expect(windowOptions(product.id)[0]).toMatchObject({ id: "annual", available: true });
    }
  });
});

describe("imageryChip", () => {
  function chip(source: string, year: number, window: string) {
    return imageryChip({ optical: source }, { year, window });
  }

  it("stamps a median mosaic with the year alone", () => {
    expect(chip("gm_s2_annual", 2023, "annual")).toBe("Sentinel-2 · 2023");
  });

  it("names the season when the coverage has one", () => {
    expect(chip("s2_l2a", 2022, "dry")).toBe("Sentinel-2 · Dry season 2022");
  });

  it("refuses to claim a season a mosaic never published", () => {
    // The chip is a statement about the pixels, so an impossible window reads as the
    // annual median the engine would actually have fetched.
    expect(chip("gm_ls8_annual", 2019, "wet")).toBe("Landsat · 2019");
  });

  it("credits the family behind the pixels, not the one nearest the default", () => {
    expect(chip("gm_ls5_ls7_annual", 2001, "annual")).toBe("Landsat · 2001");
  });

  it("falls back to the calibrated coverage when nothing was chosen", () => {
    expect(imageryChip({}, { year: 2023, window: "annual" })).toBe("Sentinel-2 · 2023");
  });
});

describe("provenance wording", () => {
  const provenance = {
    selectable: {
      dem: { coverage: "dem_cop_30", label: "Copernicus DEM 30 m", credit: null },
      landcover: {
        coverage: "esa_worldcover_2021",
        label: "ESA WorldCover 2021",
        credit: null,
      },
    },
    fixed: {},
  };

  it("lists the elevation and land cover a score was computed from", () => {
    expect(inputsText(provenance)).toBe("Copernicus DEM 30 m · ESA WorldCover 2021");
  });

  it("says nothing was recorded rather than guessing from the form", () => {
    expect(inputsText(null)).toBe("—");
    expect(coverageLabel(provenance, "optical")).toBeNull();
  });

  it("names one layer when a panel only needs that one", () => {
    expect(coverageLabel(provenance, "dem")).toBe("Copernicus DEM 30 m");
  });

  it("keeps an unknown coverage id pointing at itself", () => {
    expect(productById("not_a_product")).toBe(OPTICAL_PRODUCTS[0]);
  });
});
