import { describe, it, expect } from "vitest";
import { parsePointsCsv, pointsToCsv } from "./csv.ts";
import type { SurveyPoint } from "../cadModel.ts";

describe("parsePointsCsv", () => {
  it("parses P,Y(E),X(N),Z,Code rows", () => {
    // Columns after PointNo are Y(Easting), X(Northing), Z, Code.
    const text = "1001,5000.25,1000.5,12.3,CP\n1002,5010,1010,,TREE";
    const res = parsePointsCsv(text);
    expect(res.points).toHaveLength(2);
    expect(res.points[0]).toEqual({
      pointNo: "1001",
      n: 1000.5,
      e: 5000.25,
      z: 12.3,
      code: "CP",
    });
    expect(res.points[1].z).toBeNull();
  });

  it("auto-detects and skips a header row", () => {
    const text = "PointNo,Y,X,Z,Code\n1,200,100,5,A";
    const res = parsePointsCsv(text);
    expect(res.points).toHaveLength(1);
    expect(res.points[0].pointNo).toBe("1");
    expect(res.points[0].e).toBe(200); // Y column -> Easting
    expect(res.points[0].n).toBe(100); // X column -> Northing
  });

  it("supports tab and semicolon delimiters", () => {
    // Y(Easting)=200 in the second column.
    const tab = parsePointsCsv("1\t200\t100\t\tA");
    expect(tab.points[0].e).toBe(200);
    const semi = parsePointsCsv("1;200;100;;A");
    expect(semi.points[0].e).toBe(200);
  });

  it("records errors and skips invalid X/Y", () => {
    const res = parsePointsCsv("1,abc,def,0,X");
    expect(res.points).toHaveLength(0);
    expect(res.skipped).toBe(1);
    expect(res.errors.length).toBe(1);
  });

  it("skips short rows", () => {
    const res = parsePointsCsv("1,100");
    expect(res.points).toHaveLength(0);
    expect(res.skipped).toBe(1);
  });

  it("does not crash on a two-column first row", () => {
    // cols[2] is undefined here — header detection must not throw.
    const res = parsePointsCsv("Point,Easting\n1,200\n2,210");
    // Row 1-2 parse (northing missing → invalid X/Y error), no TypeError.
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.skipped).toBe(2);
  });

  it("honours an explicit ';' delimiter without splitting decimal commas", () => {
    const text = "P;Y;X;Z\n1;5200,5;1800,25;1499,5";
    const res = parsePointsCsv(text, undefined, undefined, ";");
    expect(res.points).toHaveLength(1);
    expect(res.points[0].e).toBe(5200.5);
    expect(res.points[0].n).toBe(1800.25);
    expect(res.points[0].z).toBe(1499.5);
  });

  it("accepts signed, leading-dot and scientific values", () => {
    const res = parsePointsCsv("1,+200,.5,1e3,X");
    expect(res.points).toHaveLength(1);
    expect(res.points[0].e).toBe(200);
    expect(res.points[0].n).toBe(0.5);
    expect(res.points[0].z).toBe(1000);
  });

  it("auto-skips a non-numeric first row in mapped imports when the user forgot to tick 'has header'", () => {
    // The user left the 'first row is header' checkbox off; the first row
    // still contains column labels instead of coordinates. The parser should
    // recover silently rather than surface a confusing 'Line 1: invalid X/Y'.
    const text = "PointNo,Y,X,Z,Code\n1,200,100,5,A\n2,210,110,6,B";
    const res = parsePointsCsv(text, {
      pointNo: 0,
      easting: 1,
      northing: 2,
      elevation: 3,
      code: 4,
    });
    expect(res.points).toHaveLength(2);
    expect(res.errors).toHaveLength(0);
    expect(res.skipped).toBe(0);
    expect(res.points[0]).toEqual({
      pointNo: "1",
      n: 100,
      e: 200,
      z: 5,
      code: "A",
    });
    expect(res.points[1].code).toBe("B");
  });

  it("reports a preview of the offending line in the error message", () => {
    const res = parsePointsCsv("1,abc,def,0,X");
    expect(res.errors[0]).toMatch(
      /^Line 1: invalid X\/Y [—-] "1,abc,def,0,X"$/u,
    );
  });

  it("truncates very long lines in the error preview", () => {
    // Long non-numeric X column forces an error; preview should be 80 chars max
    // and end with the ellipsis character.
    const long = "1,200,not_a_number_at_all_" + "x".repeat(120) + ",0,X";
    const res = parsePointsCsv(long);
    expect(res.errors).toHaveLength(1);
    const preview = res.errors[0].match(/"([^"]*)"/)?.[1] ?? "";
    expect(preview.length).toBeLessThanOrEqual(80);
    expect(preview.endsWith("…")).toBe(true);
  });
});

describe("pointsToCsv", () => {
  it("emits a header and 4-decimal coordinates", () => {
    const points: SurveyPoint[] = [
      { id: "a", pointNo: "1", n: 100, e: 200, z: 5, code: "CP", layerId: "TOPO" },
      { id: "b", pointNo: "2", n: 110, e: 210, z: null, code: "", layerId: "TOPO" },
    ];
    const csv = pointsToCsv(points);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("PointNo,Y,X,Z,Code");
    // Y = Easting (200), X = Northing (100).
    expect(lines[1]).toBe("1,200.0000,100.0000,5.0000,CP");
    expect(lines[2]).toBe("2,210.0000,110.0000,,");
  });

  it("round-trips through parsePointsCsv", () => {
    const points: SurveyPoint[] = [
      { id: "a", pointNo: "1", n: 100, e: 200, z: 5, code: "CP", layerId: "TOPO" },
    ];
    const reparsed = parsePointsCsv(pointsToCsv(points));
    expect(reparsed.points[0]).toEqual({ pointNo: "1", n: 100, e: 200, z: 5, code: "CP" });
  });
});
