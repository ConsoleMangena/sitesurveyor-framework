import { describe, expect, it } from "vitest";

import {
  DEFAULT_CATEGORY_IDS,
  DEFAULT_HALF_DEG,
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
    categories: DEFAULT_CATEGORY_IDS,
    ...overrides,
  };
}

describe("validateForm", () => {
  it("builds the engine's payload from a valid form", () => {
    const { input, problems } = validateForm(form());

    expect(problems).toEqual([]);
    expect(input).toEqual({
      latitude: -19.50487,
      longitude: 29.84598,
      categories: DEFAULT_CATEGORY_IDS,
      clientName: "Kopje Farm",
      address: "Masvingo",
      halfDeg: DEFAULT_HALF_DEG,
    });
  });

  it("names every field that stops the survey, not only the first", () => {
    const { input, problems } = validateForm(
      form({ latitude: "south of harare", longitude: "", categories: [] }),
    );

    expect(input).toBeNull();
    expect(problems).toHaveLength(3);
  });

  it("treats a blank coordinate as missing rather than as the equator", () => {
    const { input, problems } = validateForm(form({ longitude: "  " }));

    expect(input).toBeNull();
    expect(problems).toEqual(["Longitude must be a decimal degree."]);
  });

  it("rejects a coordinate the satellite archive has no imagery for", () => {
    const { input, problems } = validateForm(form({ latitude: "51.5", longitude: "-0.1" }));

    expect(input).toBeNull();
    expect(problems[0]).toMatch(/outside the satellite coverage/);
  });

  it("keeps a coordinate on the edge of the box", () => {
    expect(validateForm(form({ latitude: "-56", longitude: "-30" })).input).not.toBeNull();
  });

  it("still labels a survey whose fields were left blank", () => {
    const { input } = validateForm(
      form({ clientName: "   ", address: "  " }),
    );

    expect(input).toMatchObject({ clientName: "Unnamed site", address: "" });
  });
});
