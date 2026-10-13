/**
 * GeoJSON import/export for survey points and linework.
 *
 * Mirrors the GeoRust-backed `survey-core::geojson_io` Rust module so the WASM
 * and pure-TS paths produce identical output. Points become GeoJSON `Point`
 * features; open linework becomes `LineString`; closed linework becomes
 * `Polygon`. Surveyor attributes ride along in feature `properties`.
 *
 * Coordinates use the CAD/GIS interchange convention X = Easting, Y = Northing,
 * with optional Z = Elevation as the third ordinate.
 */
import type { SurveyLinework, SurveyPoint } from "../cadModel.ts";

export interface GeoModelPoint {
  pointNo: string;
  n: number;
  e: number;
  z?: number | null;
  code?: string;
  layerId?: string;
}

export interface GeoModelLinework {
  vertices: { n: number; e: number }[];
  closed: boolean;
  layerId?: string;
}

export interface GeoModel {
  points: GeoModelPoint[];
  linework: GeoModelLinework[];
}

export interface GeoModelResult extends GeoModel {
  errors: string[];
  warnings: string[];
  crs?: string;
}

interface GeoJsonFeature {
  type: "Feature";
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
  properties: Record<string, unknown> | null;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
  crs?: { type: string; properties: { name: string } } | unknown;
}

/** Convert the model's points + linework into a GeoJSON FeatureCollection. */
export function modelToGeoJson(model: GeoModel): string {
  const features: GeoJsonFeature[] = [];

  for (const p of model.points) {
    const coords = p.z != null ? [p.e, p.n, p.z] : [p.e, p.n];
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coords },
      properties: {
        pointNo: p.pointNo,
        code: p.code ?? "",
        layer: p.layerId ?? "",
        ...(p.z != null ? { z: p.z } : {}),
      },
    });
  }

  for (const l of model.linework) {
    const ring = l.vertices.map((v) => [v.e, v.n]);
    if (l.closed && l.vertices.length >= 3) {
      const closed = [...ring];
      const first = closed[0];
      const last = closed[closed.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) closed.push(first);
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [closed] },
        properties: { layer: l.layerId ?? "", closed: true },
      });
    } else {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: ring },
        properties: { layer: l.layerId ?? "", closed: false },
      });
    }
  }

  const fc: GeoJsonFeatureCollection = { type: "FeatureCollection", features };
  return JSON.stringify(fc, null, 2);
}

function str(props: Record<string, unknown> | null, key: string): string {
  const v = props?.[key];
  return typeof v === "string" ? v : "";
}

function detectCrs(root: unknown): string | undefined {
  const r = root as { crs?: { type?: string; properties?: { name?: string } } } | undefined;
  if (!r?.crs) return undefined;
  if (r.crs.type === "name" && r.crs.properties?.name) return r.crs.properties.name;
  return undefined;
}

/** Parse a GeoJSON string into a model. Unsupported geometries are reported. */
export function modelFromGeoJson(text: string): GeoModelResult {
  const result: GeoModelResult = { points: [], linework: [], errors: [], warnings: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    result.errors.push("GeoJSON: invalid JSON — could not parse file.");
    return result;
  }

  const root = parsed as { type?: string; features?: GeoJsonFeature[]; geometry?: unknown; crs?: unknown };
  result.crs = detectCrs(parsed);

  // CRS safety: RFC 7946 GeoJSON is implicitly WGS84 lon/lat — importing its
  // degrees as plan metres would silently put geometry ~thousands of km off.
  // Any explicit projected reference is fine to import as-is.
  if (!result.crs) {
    result.warnings.push(
      "GeoJSON has no CRS metadata (RFC 7946 files are WGS84 lon/lat). Coordinates were imported as numeric plan values — if this file was lon/lat, REPROJECT it to your local grid first.",
    );
  } else if (/4326|wgs[\s_-]?84|crs84|lonlat|longitude/i.test(result.crs)) {
    result.warnings.push(
      `GeoJSON declares geographic CRS "${result.crs}" (lon/lat degrees). Coordinates were imported as numeric values and WILL be misplaced — reproject to your local grid first.`,
    );
  }

  let features: GeoJsonFeature[] = [];
  if (root?.type === "FeatureCollection" && Array.isArray(root.features)) {
    features = root.features;
  } else if (root?.type === "Feature") {
    features = [root as unknown as GeoJsonFeature];
  } else if (root?.type && root.type !== "FeatureCollection") {
    // Bare geometry object.
    features = [{ type: "Feature", geometry: parsed as GeoJsonFeature["geometry"], properties: null }];
  } else {
    result.errors.push("GeoJSON: expected a FeatureCollection, Feature or geometry object.");
    return result;
  }

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (!f || typeof f !== "object") continue;
    const geom = f.geometry;
    const props = f.properties;
    const prefix = `Feature ${i + 1}`;

    if (!geom) {
      result.warnings.push(`${prefix}: skipped — no geometry.`);
      continue;
    }

    if (geom.type === "Point") {
      const c = geom.coordinates as number[];
      if (!Array.isArray(c) || c.length < 2) {
        result.errors.push(`${prefix}: Point has fewer than 2 coordinates.`);
        continue;
      }
      if (typeof c[0] !== "number" || !Number.isFinite(c[0]) || typeof c[1] !== "number" || !Number.isFinite(c[1])) {
        result.errors.push(`${prefix}: Point has non-numeric coordinates — skipped (no silent (0,0) placement).`);
        continue;
      }
      const z = c.length > 2 && typeof c[2] === "number" && Number.isFinite(c[2])
        ? c[2]
        : (typeof props?.z === "number" ? props.z : null);
      result.points.push({
        pointNo: str(props, "pointNo") || str(props, "name") || String(i + 1),
        e: c[0],
        n: c[1],
        z,
        code: str(props, "code"),
        layerId: str(props, "layer"),
      });
    } else if (geom.type === "LineString") {
      const cs = geom.coordinates as number[][];
      if (!Array.isArray(cs) || cs.length < 2) {
        result.warnings.push(`${prefix}: LineString has fewer than 2 vertices — skipped.`);
        continue;
      }
      let invalid = false;
      for (let ci = 0; ci < cs.length; ci++) {
        const c = cs[ci];
        if (!Array.isArray(c) || c.length < 2 || typeof c[0] !== "number" || !Number.isFinite(c[0]) || typeof c[1] !== "number" || !Number.isFinite(c[1])) {
          result.errors.push(`${prefix}: LineString vertex ${ci + 1} has invalid coordinates — feature skipped.`);
          invalid = true;
          break;
        }
      }
      if (invalid) continue;
      result.linework.push({
        vertices: cs.map((c) => ({ e: c[0], n: c[1] })),
        closed: false,
        layerId: str(props, "layer"),
      });
    } else if (geom.type === "Polygon") {
      const rings = geom.coordinates as number[][][];
      if (!Array.isArray(rings) || rings.length === 0) {
        result.warnings.push(`${prefix}: Polygon has no rings — skipped.`);
        continue;
      }
      if (rings.length > 1) {
        result.warnings.push(`${prefix}: only the outer ring is imported; holes/inner rings ignored.`);
      }
      const outer = rings[0] ?? [];
      if (outer.length < 3) {
        result.warnings.push(`${prefix}: Polygon outer ring has fewer than 3 vertices — skipped.`);
        continue;
      }
      let invalid = false;
      for (let ci = 0; ci < outer.length; ci++) {
        const c = outer[ci];
        if (!Array.isArray(c) || c.length < 2 || typeof c[0] !== "number" || !Number.isFinite(c[0]) || typeof c[1] !== "number" || !Number.isFinite(c[1])) {
          result.errors.push(`${prefix}: Polygon vertex ${ci + 1} has invalid coordinates — feature skipped.`);
          invalid = true;
          break;
        }
      }
      if (invalid) continue;
      const verts = outer.map((c) => ({ e: c[0], n: c[1] }));
      if (
        verts.length > 1 &&
        verts[0].e === verts[verts.length - 1].e &&
        verts[0].n === verts[verts.length - 1].n
      ) {
        verts.pop();
      }
      result.linework.push({ vertices: verts, closed: true, layerId: str(props, "layer") });
    } else if (geom.type === "MultiPoint" || geom.type === "MultiLineString" || geom.type === "MultiPolygon") {
      result.warnings.push(`${prefix}: ${geom.type} is not supported — flatten it first or use single-part geometries.`);
    } else {
      result.warnings.push(`${prefix}: unsupported geometry type "${geom.type}" — skipped.`);
    }
  }

  if (result.points.length === 0 && result.linework.length === 0 && result.errors.length === 0) {
    result.warnings.push("GeoJSON: no importable Point, LineString or Polygon features were found.");
  }

  return result;
}

/** Build a GeoModel from the CAD model's points and linework. */
export function toGeoModel(
  points: SurveyPoint[],
  linework: SurveyLinework[],
): GeoModel {
  return {
    points: points.map((p) => ({
      pointNo: p.pointNo,
      n: p.n,
      e: p.e,
      z: p.z,
      code: p.code,
      layerId: p.layerId,
    })),
    linework: linework.map((l) => ({
      vertices: l.vertices.map((v) => ({ n: v.n, e: v.e })),
      closed: l.closed,
      layerId: l.layerId,
    })),
  };
}
