import { describe, expect, it } from "vitest";

import {
  DEFAULT_CATEGORY,
  DEFAULT_HALF_DEG,
  resultsNote,
  sourceText,
  validateForm,
  type SurveyFormValues,
} from "./model.ts";

function form(overrides: Partial<SurveyFormValues> = {}): SurveyFormValues {
  return {
    latitude: "-19.50487",
    longitude: "29.84598",
    clientName: "Kopje Farm",
    address: "Masvingo",
    halfDeg: DEFAULT_HALF_DEG,
    categories: [DEFAULT_CATEGORY],
    ...overrides,
  };
}

describe("validateForm", () => {
  it("builds the queue payload from a valid form", () => {
    const { draft, problems } = validateForm(form());

    expect(problems).toEqual([]);
    expect(draft).toEqual({
      latitude: -19.50487,
      longitude: 29.84598,
      categories: ["water"],
      clientName: "Kopje Farm",
      address: "Masvingo",
      halfDeg: DEFAULT_HALF_DEG,
      // A form that never opened the coverage panel asks for the engine's defaults, and
      // says so with empty objects rather than by leaving the keys out.
      dataSources: {},
      composite: {},
    });
  });

  it("rejects choosing more than one category at a time", () => {
    const { draft, problems } = validateForm(
      form({ categories: ["water", "minerals"] }),
    );

    expect(draft).toBeNull();
    expect(problems).toEqual(["Please select only one category at a time."]);
  });

  it("carries the coverages and composite the panel chose", () => {
    const { draft } = validateForm(
      form({
        dataSources: { dem: "nasadem", optical: "s2_l2a" },
        composite: { year: 2022, window: "dry" },
      }),
    );

    expect(draft).toMatchObject({
      dataSources: { dem: "nasadem", optical: "s2_l2a" },
      composite: { year: 2022, window: "dry" },
    });
  });

  it("names every field that stops the survey, not only the first", () => {
    const { draft, problems } = validateForm(
      form({ latitude: "south of harare", longitude: "", categories: [] }),
    );

    expect(draft).toBeNull();
    expect(problems).toHaveLength(3);
  });

  it("treats a blank coordinate as missing rather than as the equator", () => {
    const { draft, problems } = validateForm(form({ longitude: "  " }));

    expect(draft).toBeNull();
    expect(problems).toEqual(["Longitude must be a decimal degree."]);
  });

  it("rejects a coordinate the satellite archive has no imagery for", () => {
    const { draft, problems } = validateForm(
      form({ latitude: "51.5", longitude: "-0.1" }),
    );

    expect(draft).toBeNull();
    expect(problems[0]).toMatch(/outside the satellite coverage/);
  });

  it("keeps a coordinate on the edge of the box", () => {
    expect(validateForm(form({ latitude: "-56", longitude: "-30" })).draft).not.toBeNull();
  });

  it("still labels a survey whose fields were left blank", () => {
    const { draft } = validateForm(form({ clientName: "   ", address: "  " }));

    expect(draft).toMatchObject({ clientName: "Unnamed site", address: "" });
  });
});

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    status: "succeeded",
    active: false,
    errorMessage: null,
    createdAt: "2026-11-06T10:00:00Z",
    completedAt: "2026-11-06T10:07:00Z",
    ...overrides,
  } as never;
}

describe("sourceText", () => {
  it("says whose numbers the panel is showing", () => {
    expect(sourceText(null, null)).toBe("No survey yet");
    expect(sourceText(run(), "r1")).toBe("This survey");
    expect(sourceText(run({ status: "surveying", active: true }), "r2")).toBe(
      "Survey running",
    );
    expect(sourceText(run(), "r2")).toMatch(/^Saved survey · \d/);
  });
});

describe("resultsNote", () => {
  it("keeps the comparison warning on the survey the operator just paid for", () => {
    expect(resultsNote(run(), "r1")).toContain("not comparable");
  });

  it("tells a reader what a run that scored nothing actually did", () => {
    expect(resultsNote(null, null)).toContain("Indicators populate");
    expect(resultsNote(run({ status: "surveying", active: true }), null)).toBe(
      "The worker is still scoring this area.",
    );
    expect(resultsNote(run({ status: "failed", errorMessage: "WCS timed out" }), null)).toBe(
      "WCS timed out",
    );
    expect(resultsNote(run({ status: "failed" }), null)).toContain("credits were returned");
    expect(resultsNote(run({ status: "cancelled" }), null)).toContain(
      "withdrawn before a worker started",
    );
    expect(resultsNote(run(), "r2")).toContain("Run a survey for your own coordinate.");
  });
});
