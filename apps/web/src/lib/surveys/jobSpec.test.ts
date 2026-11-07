import { describe, expect, it } from "vitest";

import {
  jobSpecFrom,
  jobSpecProblems,
  parseJobSpec,
  serializeJobSpec,
} from "./jobSpec.ts";

const good = {
  title: "Masvingo Groundwater Siting",
  category: "water" as const,
  latitude: "-19.50487",
  longitude: "29.84598",
  halfDeg: 0.12,
};

describe("serializeJobSpec", () => {
  it("writes the survey type and the ground into the job's own record", () => {
    const description = serializeJobSpec({
      category: "minerals",
      latitude: -19.5,
      longitude: 29.85,
      halfDeg: 0.23,
    });

    expect(JSON.parse(description)).toEqual({
      category: "minerals",
      latitude: -19.5,
      longitude: 29.85,
      halfDeg: 0.23,
    });
  });
});

describe("parseJobSpec", () => {
  it("reads back what was written", () => {
    const parsed = parseJobSpec(
      serializeJobSpec({
        category: "hazard",
        latitude: -19.5,
        longitude: 29.85,
        halfDeg: 0.45,
      }),
    );

    expect(parsed).toEqual({
      category: "hazard",
      latitude: -19.5,
      longitude: 29.85,
      halfDeg: 0.45,
      hasGround: true,
    });
  });

  it("reads a job written before specifications existed as a survey with no ground", () => {
    const parsed = parseJobSpec(JSON.stringify({ category: "soil" }));

    expect(parsed?.category).toBe("soil");
    expect(parsed?.hasGround).toBe(false);
  });

  it("refuses a record it cannot read", () => {
    expect(parseJobSpec(null)).toBeNull();
    expect(parseJobSpec("")).toBeNull();
    expect(parseJobSpec("Groundwater")).toBeNull();
    expect(parseJobSpec(JSON.stringify({ category: "geothermal" }))).toBeNull();
  });
});

describe("jobSpecFrom", () => {
  it("reads the ground the operator typed", () => {
    expect(
      jobSpecFrom({
        category: "water",
        latitude: "-19.50487",
        longitude: "29.84598",
        halfDeg: 0.12,
      }),
    ).toEqual({
      category: "water",
      latitude: -19.50487,
      longitude: 29.84598,
      halfDeg: 0.12,
    });
  });

  it("has no specification when the ground cannot be read", () => {
    expect(
      jobSpecFrom({
        category: "water",
        latitude: "",
        longitude: "29.84598",
        halfDeg: 0.12,
      }),
    ).toBeNull();
  });
});

describe("jobSpecProblems", () => {
  it("accepts a job that can be priced", () => {
    expect(jobSpecProblems(good)).toEqual([]);
  });

  it("insists on a title", () => {
    expect(jobSpecProblems({ ...good, title: "  " })).toContain(
      "A job title is required.",
    );
  });

  it("insists on a point that can be read", () => {
    const problems = jobSpecProblems({ ...good, latitude: "", longitude: "" });

    expect(problems).toContain("Latitude must be a decimal degree.");
    expect(problems).toContain("Longitude must be a decimal degree.");
  });

  it("insists on an extent it can price", () => {
    expect(jobSpecProblems({ ...good, halfDeg: 0.3 })).toContain(
      "Choose how much ground the survey covers.",
    );
  });

  it("refuses a point the engine cannot read imagery for", () => {
    const problems = jobSpecProblems({
      ...good,
      latitude: "60",
      longitude: "120",
    });

    expect(problems.join(" ")).toContain("outside the coverage the engine can read");
  });

  it("does not blame the coverage for a longitude that was never typed", () => {
    const problems = jobSpecProblems({ ...good, longitude: "" });

    expect(problems.join(" ")).not.toContain("outside the coverage");
  });

  it("refuses a latitude off the globe", () => {
    expect(jobSpecProblems({ ...good, latitude: "91" }).join(" ")).toContain(
      "between -90 and 90",
    );
  });
});
