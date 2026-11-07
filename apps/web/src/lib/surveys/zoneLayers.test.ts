import { describe, expect, it } from "vitest";

import { parseZoneCollection, zoneLegend } from "./zoneLayers.ts";

function feature(classCode: number, areaHa: number, label = "High potential") {
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [29.8, -19.5],
          [29.9, -19.5],
          [29.9, -19.4],
          [29.8, -19.4],
          [29.8, -19.5],
        ],
      ],
    },
    properties: {
      class_code: classCode,
      class_label: label,
      color: "#d73027",
      area_ha: areaHa,
    },
  };
}

describe("parseZoneCollection", () => {
  it("reads a published zones file", () => {
    const collection = parseZoneCollection({
      type: "FeatureCollection",
      features: [feature(4, 12.5), feature(2, 3.25, "Low potential")],
    });

    expect(collection?.features).toHaveLength(2);
    expect(collection?.features[0].properties.class_label).toBe("High potential");
  });

  it("refuses anything that is not a feature collection", () => {
    expect(parseZoneCollection(null)).toBeNull();
    expect(parseZoneCollection({ type: "Feature" })).toBeNull();
    expect(parseZoneCollection({ type: "FeatureCollection" })).toBeNull();
  });

  it("drops features whose geometry cannot be drawn", () => {
    const collection = parseZoneCollection({
      type: "FeatureCollection",
      features: [
        feature(4, 1),
        { ...feature(4, 1), geometry: { type: "Point", coordinates: [0, 0] } },
        { ...feature(4, 1), properties: { class_label: "High potential" } },
      ],
    });

    expect(collection?.features).toHaveLength(1);
  });

  it("fills in the colour and area a feature may be missing", () => {
    const collection = parseZoneCollection({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [] },
          properties: { class_code: 3 },
        },
      ],
    });

    expect(collection?.features[0].properties.color).toBe("#888888");
    expect(collection?.features[0].properties.area_ha).toBe(0);
  });
});

describe("zoneLegend", () => {
  it("adds up the regions of a class and reads best class first", () => {
    const collection = parseZoneCollection({
      type: "FeatureCollection",
      features: [feature(4, 12.5), feature(4, 7.5), feature(1, 2, "Very low potential")],
    });

    const legend = zoneLegend(collection);

    expect(legend.map((entry) => entry.classCode)).toEqual([4, 1]);
    expect(legend[0].areaHa).toBe(20);
    expect(legend[0].regionCount).toBe(2);
    expect(legend[1].label).toBe("Very low potential");
  });

  it("has no rows when there is no geometry", () => {
    expect(zoneLegend(null)).toEqual([]);
  });

  it("puts the excluded classes last, whatever their code", () => {
    const collection = parseZoneCollection({
      type: "FeatureCollection",
      features: [
        feature(6, 40, "Built-up (excluded)"),
        feature(0, 90, "Water body"),
        feature(3, 12),
        feature(5, 8, "Very high potential"),
      ],
    });

    expect(zoneLegend(collection).map((entry) => entry.classCode)).toEqual([5, 3, 0, 6]);
  });
});
