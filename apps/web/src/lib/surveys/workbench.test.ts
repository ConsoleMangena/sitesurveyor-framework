import { describe, expect, it } from "vitest";

import {
  BASEMAPS,
  MAP_CANDIDATES_PER_CATEGORY,
  aoiBounds,
  basisText,
  bandFor,
  basemapById,
  candidateRows,
  coordWithHemisphere,
  dmsText,
  elapsedText,
  gridText,
  jobText,
  mapCandidates,
  metersPerPixel,
  meterWidth,
  metricRange,
  scaleText,
  scoreValueText,
  stationDepthLabel,
} from "./workbench.ts";
import type { SurveyTarget } from "../repositories/satelliteSurveys.ts";

function target(overrides: Partial<SurveyTarget> = {}): SurveyTarget {
  return {
    id: "t1",
    runId: "r1",
    category: "water",
    rank: 1,
    latitude: -19.5,
    longitude: 29.8,
    score: 61.4,
    distanceKm: 3.21,
    readout: "Lineament intersection",
    ...overrides,
  };
}

describe("aoiBounds", () => {
  it("draws the box the worker scored, corner to corner", () => {
    expect(aoiBounds(-19.5, 29.8, 0.12)).toEqual([
      [-19.62, 29.68],
      [-19.38, 29.92],
    ]);
  });
});

describe("bandFor", () => {
  it("cuts at the same numbers the legend prints", () => {
    expect(bandFor(49.9)).toBe("low");
    expect(bandFor(50)).toBe("mid");
    expect(bandFor(74.9)).toBe("mid");
    expect(bandFor(75)).toBe("high");
  });

  it("has no band for a category the survey did not score", () => {
    expect(bandFor(null)).toBeNull();
    expect(bandFor(Number.NaN)).toBeNull();
  });
});

describe("meterWidth", () => {
  it("shows nothing for an unscored category rather than a tiny sliver", () => {
    expect(meterWidth(null)).toBe("0%");
    expect(meterWidth(Number.NaN)).toBe("0%");
  });

  it("keeps a real score visible but never off the scale", () => {
    expect(meterWidth(0)).toBe("3%");
    expect(meterWidth(140)).toBe("100%");
  });
});

describe("mapCandidates", () => {
  it("caps each category at the readable few and keeps the rest for the table", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      target({ id: `w${index}`, rank: index + 1 }),
    ).concat(target({ id: "m1", category: "minerals", rank: 1 }));

    const onMap = mapCandidates(many);
    const inTable = candidateRows(many);

    expect(onMap.filter((row) => row.category === "water")).toHaveLength(
      MAP_CANDIDATES_PER_CATEGORY,
    );
    expect(inTable.filter((row) => row.category === "water")).toHaveLength(9);
    expect(onMap.at(-1)?.category).toBe("minerals");
  });

  it("carries the colour and letter a category is known by", () => {
    const [row] = mapCandidates([target({ category: "hazard_safety" })]);

    expect(row).toMatchObject({ letter: "H", kind: "Safe site", color: "#f43f5e" });
  });

  it("leaves a category key it does not know off the map entirely", () => {
    // A key the engine adds later must not draw an unlabelled marker in someone's colour.
    expect(mapCandidates([target({ category: "geothermal" })])).toEqual([]);
  });
});

describe("coordinates", () => {
  it("gives each hemisphere its own letter instead of a sign", () => {
    expect(coordWithHemisphere(-19.5049, "lat")).toBe("19.5049°S");
    expect(coordWithHemisphere(29.846, "lon")).toBe("29.8460°E");
    expect(coordWithHemisphere(-0.5, "lon")).toBe("0.5000°W");
  });

  it("refuses to invent a position for a coordinate that is not a number", () => {
    expect(dmsText(Number.NaN, 29.8)).toBe("—");
  });
});

describe("scale", () => {
  it("shrinks by half with each zoom step at the equator", () => {
    expect(metersPerPixel(0, 1)).toBeCloseTo(metersPerPixel(0, 0) / 2, 6);
  });

  it("says the unit a reader would use at that zoom", () => {
    expect(scaleText(metersPerPixel(0, 0))).toBe("156.5 km/px");
    expect(scaleText(metersPerPixel(0, 13))).toBe("19.1 m/px");
  });

  it("offers only the two basemaps the canvas can actually tile", () => {
    expect(BASEMAPS.map((base) => base.id)).toEqual(["satellite", "street"]);
    expect(basemapById("nothing")).toBe(BASEMAPS[0]);
  });
});

describe("elapsedText", () => {
  it("counts seconds until a minute has passed, then minutes", () => {
    expect(elapsedText(45_400)).toBe("45s");
    expect(elapsedText(90_000)).toBe("1m 30s");
    expect(elapsedText(-5_000)).toBe("0s");
  });
});

describe("jobText", () => {
  function run(overrides: Record<string, unknown> = {}) {
    return {
      status: "surveying",
      stage: "Scoring minerals",
      progress: 48.4,
      ...overrides,
    } as never;
  }

  it("quotes the worker's own stage and percent", () => {
    expect(jobText(run(), false)).toBe("Scoring minerals · 48%");
  });

  it("names the state a queue row can be in without pretending to know more", () => {
    expect(jobText(null, false)).toBe("Idle");
    expect(jobText(run({ status: "queued", stage: null, progress: 0 }), false)).toBe(
      "Queued · waiting for a worker",
    );
    expect(jobText(run({ status: "succeeded" }), false)).toBe("Survey complete");
    expect(jobText(run({ status: "failed" }), false)).toBe("Survey failed");
    expect(jobText(run({ status: "cancelled" }), false)).toBe("Survey cancelled");
    expect(jobText(null, true)).toBe("Submitting survey");
  });

  it("falls back to a working label when the worker has not published a stage", () => {
    expect(jobText(run({ stage: null, progress: 12 }), false)).toBe("Working · 12%");
  });
});

describe("score provenance wording", () => {
  it("keeps the engine's own warning about what a score means", () => {
    expect(basisText("relative_to_aoi_percentile")).toBe(
      "Relative percentile scores · screening only",
    );
    expect(basisText("something_else")).toBe("something else");
    expect(basisText(null)).toBe("Nothing scored yet");
  });

  it("names the grid only once a result states it", () => {
    expect(gridText(30)).toBe("30 m · MCDA");
    expect(gridText(null)).toBe("—");
  });

  it("keeps one decimal, because that is all the score has", () => {
    expect(scoreValueText(61.44)).toBe("61.4");
    expect(scoreValueText(null)).toBe("—");
  });
});

describe("metricRange", () => {
  it("prints a range, a single value, or nothing", () => {
    expect(metricRange(24.2, 31.4)).toBe("24.2-31.4 m");
    expect(metricRange(24, null)).toBe("24 m");
    expect(metricRange(null, 31)).toBe("31 m");
    expect(metricRange(18, 18)).toBe("18 m");
    expect(metricRange(null, null)).toBeNull();
    expect(metricRange("nope", false)).toBeNull();
  });

  it("changes unit on request", () => {
    expect(metricRange(2, 5, " km")).toBe("2-5 km");
  });
});

describe("stationDepthLabel", () => {
  it("reads the water depth the engine stored on the payload", () => {
    expect(
      stationDepthLabel("water", {
        depth_to_water_wet_m: 24.2,
        depth_to_water_dry_m: 31.4,
      }),
    ).toBe("24.2-31.4 m");
  });

  it("reads overburden for minerals and the class for hazard", () => {
    expect(
      stationDepthLabel("minerals", { overburden_min_m: 12, overburden_max_m: 18 }),
    ).toBe("12-18 m");
    expect(stationDepthLabel("hazard_safety", { class_name: "Low hazard" })).toBe(
      "Low hazard",
    );
  });

  it("returns null when the category has no depth story", () => {
    expect(stationDepthLabel("soil_land", { anything: 1 })).toBeNull();
    expect(stationDepthLabel("water", null)).toBeNull();
    expect(stationDepthLabel("water", {})).toBeNull();
  });
});
