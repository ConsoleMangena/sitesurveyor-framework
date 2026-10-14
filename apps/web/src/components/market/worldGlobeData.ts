import type * as GeoJSON from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import worldLandRaw from "./worldLand.json";

const worldLand = worldLandRaw as unknown as GeoJSON.FeatureCollection;

export function createGraticuleGeoJSON(): GeoJSON.FeatureCollection {
  const lines: GeoJSON.Feature[] = [];
  // Parallels (every 15 degrees from -75 to 75)
  for (let lat = -75; lat <= 75; lat += 15) {
    const coords: [number, number][] = [];
    for (let lng = -180; lng <= 180; lng += 5) {
      coords.push([lng, lat]);
    }
    lines.push({
      type: "Feature",
      properties: { type: lat === 0 ? "equator" : "parallel" },
      geometry: { type: "LineString", coordinates: coords },
    });
  }
  // Meridians (every 15 degrees from -180 to 180)
  for (let lng = -180; lng < 180; lng += 15) {
    const coords: [number, number][] = [];
    for (let lat = -85; lat <= 85; lat += 5) {
      coords.push([lng, lat]);
    }
    lines.push({
      type: "Feature",
      properties: { type: lng === 0 ? "prime" : "meridian" },
      geometry: { type: "LineString", coordinates: coords },
    });
  }
  return { type: "FeatureCollection", features: lines };
}

const graticuleData = createGraticuleGeoJSON();

export const selfContainedGlobeLightStyle: StyleSpecification = {
  version: 8,
  projection: { type: "globe" },
  sources: {
    "world-land": {
      type: "geojson",
      data: worldLand,
    },
    "world-graticule": {
      type: "geojson",
      data: graticuleData,
    },
  },
  layers: [
    {
      id: "ocean-background",
      type: "background",
      paint: {
        "background-color": "#e8eef8",
      },
    },
    {
      id: "world-graticule-lines",
      type: "line",
      source: "world-graticule",
      paint: {
        "line-color": "#c7d2fe",
        "line-width": 0.5,
        "line-opacity": 0.6,
      },
    },
    {
      id: "world-land-fill",
      type: "fill",
      source: "world-land",
      paint: {
        "fill-color": "#ffffff",
        "fill-opacity": 0.96,
      },
    },
    {
      id: "world-land-border",
      type: "line",
      source: "world-land",
      paint: {
        "line-color": "#94a3b8",
        "line-width": 0.8,
        "line-opacity": 0.85,
      },
    },
  ],
};

export const selfContainedGlobeDarkStyle: StyleSpecification = {
  version: 8,
  projection: { type: "globe" },
  sources: {
    "world-land": {
      type: "geojson",
      data: worldLand,
    },
    "world-graticule": {
      type: "geojson",
      data: graticuleData,
    },
  },
  layers: [
    {
      id: "ocean-background",
      type: "background",
      paint: {
        "background-color": "#090d16",
      },
    },
    {
      id: "world-graticule-lines",
      type: "line",
      source: "world-graticule",
      paint: {
        "line-color": "#1e293b",
        "line-width": 0.5,
        "line-opacity": 0.4,
      },
    },
    {
      id: "world-land-fill",
      type: "fill",
      source: "world-land",
      paint: {
        "fill-color": "#1e293b",
        "fill-opacity": 0.95,
      },
    },
    {
      id: "world-land-border",
      type: "line",
      source: "world-land",
      paint: {
        "line-color": "#334155",
        "line-width": 0.8,
        "line-opacity": 0.9,
      },
    },
  ],
};

export function getSelfContainedGlobeStyle(theme: "light" | "dark" = "light"): StyleSpecification {
  return theme === "dark" ? selfContainedGlobeDarkStyle : selfContainedGlobeLightStyle;
}
