import { describe, expect, it } from "vitest";
import { fromDbValue, toDbValue } from "./codecs.ts";

describe("codecs: photos", () => {
  it("stringifies a photos array on the way into WatermelonDB", () => {
    expect(toDbValue("photos", ["a.jpg", "b.jpg"])).toBe('["a.jpg","b.jpg"]');
  });

  it("parses a photos string back into an array on read", () => {
    expect(fromDbValue("photos", '["a.jpg"]')).toEqual(["a.jpg"]);
  });

  it("returns [] for a malformed photos string", () => {
    expect(fromDbValue("photos", "not-json")).toEqual([]);
  });

  it("leaves unrelated keys untouched", () => {
    expect(toDbValue("name", "Leica TS16")).toBe("Leica TS16");
    expect(fromDbValue("name", "Leica TS16")).toBe("Leica TS16");
  });

  it("keeps metadata JSON round-tripping unchanged", () => {
    const out = toDbValue("metadata", { current_project_name: "P1" });
    expect(fromDbValue("metadata", out as string)).toEqual({
      current_project_name: "P1",
    });
  });

  it("keeps timestamp (number) handling unchanged", () => {
    const iso = "2026-01-01T00:00:00.000Z";
    expect(typeof toDbValue("created_at", iso)).toBe("number");
    expect(fromDbValue("created_at", toDbValue("created_at", iso))).toBe(iso);
  });
});
