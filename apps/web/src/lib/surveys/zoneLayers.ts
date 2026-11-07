import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

/**
 * The classified zones the engine publishes: one feature per region, in WGS84.
 *
 * The engine polygonizes the same 30 m class raster it writes as a GeoTIFF, so a zone
 * drawn here and a zone measured in QGIS are the same ground. Each region carries its own
 * class name, colour and area, which is why the map legend can be read off the file
 * instead of being guessed from a palette.
 */
export type ZoneProperties = {
  class_code: number;
  class_label: string;
  color: string;
  area_ha: number;
};

export type ZoneGeometry = Polygon | MultiPolygon;
export type ZoneFeature = Feature<ZoneGeometry, ZoneProperties>;
export type ZoneCollection = FeatureCollection<ZoneGeometry, ZoneProperties>;

export interface ZoneLegendEntry {
  classCode: number;
  label: string;
  color: string;
  areaHa: number;
  regionCount: number;
}

/**
 * Read a published zones file, or nothing if it is not one.
 *
 * The file arrives from storage, so it is checked before it is drawn: a truncated upload
 * would otherwise reach Leaflet as an undefined geometry and blank the map.
 */
export function parseZoneCollection(raw: unknown): ZoneCollection | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { type?: unknown; features?: unknown };
  if (candidate.type !== "FeatureCollection" || !Array.isArray(candidate.features)) return null;

  const features: ZoneFeature[] = [];
  for (const entry of candidate.features) {
    const feature = entry as ZoneFeature;
    const properties = feature?.properties;
    const geometry = feature?.geometry;
    if (!properties || typeof properties.class_code !== "number") continue;
    if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) continue;
    if (typeof properties.color !== "string" || !properties.color) properties.color = "#888888";
    if (typeof properties.area_ha !== "number" || !Number.isFinite(properties.area_ha)) {
      properties.area_ha = 0;
    }
    features.push(feature);
  }

  if (!features.length) return null;
  return { type: "FeatureCollection", features };
}

/**
 * The legend rows for a zones file: one per class, best class first.
 *
 * The file carries one feature per region, so the areas are added up here rather than
 * read: a class is only meaningful as the total ground it covers. Water and built-up
 * are not ranked -- they are excluded from the score -- so they sit at the end.
 */
export function zoneLegend(collection: ZoneCollection | null): ZoneLegendEntry[] {
  if (!collection) return [];
  const totals = new Map<number, ZoneLegendEntry>();
  for (const feature of collection.features) {
    const properties = feature.properties;
    const entry = totals.get(properties.class_code) ?? {
      classCode: properties.class_code,
      label: properties.class_label,
      color: properties.color,
      areaHa: 0,
      regionCount: 0,
    };
    entry.areaHa += properties.area_ha;
    entry.regionCount += 1;
    totals.set(properties.class_code, entry);
  }
  return [...totals.values()].sort((a, b) => legendOrder(a.classCode) - legendOrder(b.classCode));
}

/** The ranked classes read best first; the excluded ones read last. */
function legendOrder(classCode: number): number {
  if (classCode >= 1 && classCode <= 5) return -classCode;
  return 100 + classCode;
}
