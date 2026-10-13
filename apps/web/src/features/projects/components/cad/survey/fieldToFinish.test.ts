import { describe, it, expect } from "vitest";
import { buildFeatureStrings } from "./fieldToFinish.ts";
import { buildCodeTable } from "./featureCodes.ts";
import type { SurveyPoint } from "../cadModel.ts";

function pt(id: string, n: number, e: number, code: string): SurveyPoint {
  return { id, pointNo: id, n, e, z: 0, code, layerId: "TOPO" };
}

describe("buildFeatureStrings", () => {
  const table = buildCodeTable();

  it("joins same-string coded points in observation order", () => {
    const points = [
      pt("1", 0, 0, "FL1"),
      pt("2", 0, 10, "FL1"),
      pt("3", 0, 20, "FL1"),
    ];
    const { strings, strungPoints } = buildFeatureStrings(points, table);
    expect(strings).toHaveLength(1);
    expect(strings[0].code).toBe("FL");
    expect(strings[0].vertices).toHaveLength(3);
    expect(strings[0].breakline).toBe(true);
    expect(strungPoints).toBe(3);
  });

  it("keeps different string numbers of the same code separate", () => {
    const points = [
      pt("1", 0, 0, "FL1"),
      pt("2", 5, 0, "FL2"),
      pt("3", 0, 10, "FL1"),
      pt("4", 5, 10, "FL2"),
    ];
    const { strings } = buildFeatureStrings(points, table);
    expect(strings).toHaveLength(2);
    for (const s of strings) expect(s.vertices).toHaveLength(2);
  });

  it("closes rings for closed codes and ignores non-stringable codes", () => {
    const points = [
      pt("1", 0, 0, "BLDG1"),
      pt("2", 0, 10, "BLDG1"),
      pt("3", 10, 10, "BLDG1"),
      pt("4", 10, 0, "BLDG1"),
      pt("5", 3, 3, "TREE"),
      pt("6", 4, 4, "MH"),
    ];
    const { strings } = buildFeatureStrings(points, table);
    expect(strings).toHaveLength(1);
    expect(strings[0].closed).toBe(true);
    expect(strings[0].vertices).toHaveLength(4);
  });

  it("discards single-point strings", () => {
    const points = [pt("1", 0, 0, "FL1")];
    const { strings } = buildFeatureStrings(points, table);
    expect(strings).toHaveLength(0);
  });
});
