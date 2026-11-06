import { describe, expect, it } from "vitest";
import {
  getRequiredToolsForSurvey,
  groupToolsByCategory,
  SURVEY_TOOL_CATALOG,
} from "./surveyTools.ts";

describe("surveyTools", () => {
  it("provides tools for water survey", () => {
    const tools = getRequiredToolsForSurvey("water");
    expect(tools.length).toBeGreaterThan(4);
    const names = tools.map((t) => t.name);
    expect(names.some((n) => n.includes("Terrameter"))).toBe(true);
    expect(names.some((n) => n.includes("Water Level Dip Meter"))).toBe(true);
    expect(names.some((n) => n.includes("GNSS RTK"))).toBe(true);
    expect(names.some((n) => n.includes("PPE"))).toBe(true);
  });

  it("provides tools for minerals survey", () => {
    const tools = getRequiredToolsForSurvey("minerals");
    const names = tools.map((t) => t.name);
    expect(names.some((n) => n.includes("pXRF"))).toBe(true);
    expect(names.some((n) => n.includes("Rock Pick"))).toBe(true);
    expect(names.some((n) => n.includes("Magnetic Susceptibility"))).toBe(true);
    expect(names.some((n) => n.includes("Hand Lens"))).toBe(true);
  });

  it("provides tools for soil survey", () => {
    const tools = getRequiredToolsForSurvey("soil");
    const names = tools.map((t) => t.name);
    expect(names.some((n) => n.includes("Soil Auger"))).toBe(true);
    expect(names.some((n) => n.includes("Munsell"))).toBe(true);
    expect(names.some((n) => n.includes("pH"))).toBe(true);
  });

  it("provides tools for hazard survey", () => {
    const tools = getRequiredToolsForSurvey("hazard");
    const names = tools.map((t) => t.name);
    expect(names.some((n) => n.includes("GPR") || n.includes("Ground Penetrating Radar"))).toBe(true);
    expect(names.some((n) => n.includes("Schmidt"))).toBe(true);
    expect(names.some((n) => n.includes("Drone"))).toBe(true);
  });

  it("groups tools into ordered categories", () => {
    const tools = getRequiredToolsForSurvey("water");
    const grouped = groupToolsByCategory(tools);
    expect(grouped.length).toBeGreaterThan(1);
    expect(grouped.every((g) => g.tools.length > 0)).toBe(true);
  });
});
