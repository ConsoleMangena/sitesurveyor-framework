/**
 * Geometry + GeoJSON bridge (GeoRust `geo`/`geojson` via WASM, TS fallback).
 *
 * Prefers the `survey-wasm` module (built from the Rust `survey-core` crate,
 * which uses the GeoRust `geo`/`geojson` crates). When the WASM package is
 * absent or fails to load, it transparently falls back to the pure-TypeScript
 * implementations in `geom.ts` / `geojson.ts`, mirroring `tinBridge.ts`.
 */

import * as tsGeom from "./geom.ts";
import type { GeomVertex, GeomBounds } from "./geom.ts";
import * as tsGeoJson from "../io/geojson.ts";
import type { GeoModel, GeoModelResult } from "../io/geojson.ts";

export type { GeomVertex, GeomBounds } from "./geom.ts";
export type { GeoModel, GeoModelResult } from "../io/geojson.ts";

export type GeomBackend = "wasm" | "ts";

interface WasmGeomApi {
  polygon_area: (input: unknown) => number;
  convex_hull: (input: unknown) => GeomVertex[];
  simplify: (input: unknown) => GeomVertex[];
  centroid: (input: unknown) => GeomVertex | null;
  point_in_polygon: (input: unknown) => boolean;
  bounds: (input: unknown) => GeomBounds | null;
  model_to_geojson: (input: unknown) => string;
  model_from_geojson: (text: string) => GeoModel;
}

const wasmLoaders = import.meta.glob("./wasm/survey_wasm.js") as Record<
  string,
  () => Promise<unknown>
>;

let wasmApi: WasmGeomApi | null = null;
let wasmTried = false;
let activeBackend: GeomBackend = "ts";

export function lastGeomBackend(): GeomBackend {
  return activeBackend;
}

async function loadWasm(): Promise<WasmGeomApi | null> {
  if (wasmTried) return wasmApi;
  wasmTried = true;
  try {
    const loader = wasmLoaders["./wasm/survey_wasm.js"];
    if (!loader) {
      wasmApi = null;
      return wasmApi;
    }
    const mod = (await loader()) as Record<string, unknown> & {
      default?: () => Promise<unknown>;
    };
    if (typeof mod.default === "function") {
      await mod.default();
    }
    // Only treat the module as usable if the geo exports are present.
    if (typeof mod.polygon_area !== "function") {
      wasmApi = null;
      return wasmApi;
    }
    wasmApi = {
      polygon_area: mod.polygon_area as WasmGeomApi["polygon_area"],
      convex_hull: mod.convex_hull as WasmGeomApi["convex_hull"],
      simplify: mod.simplify as WasmGeomApi["simplify"],
      centroid: mod.centroid as WasmGeomApi["centroid"],
      point_in_polygon: mod.point_in_polygon as WasmGeomApi["point_in_polygon"],
      bounds: mod.bounds as WasmGeomApi["bounds"],
      model_to_geojson: mod.model_to_geojson as WasmGeomApi["model_to_geojson"],
      model_from_geojson: mod.model_from_geojson as WasmGeomApi["model_from_geojson"],
    };
  } catch {
    wasmApi = null;
  }
  return wasmApi;
}

export async function polygonArea(ring: GeomVertex[]): Promise<number> {
  const api = await loadWasm();
  if (api) {
    try {
      const r = api.polygon_area({ ring });
      activeBackend = "wasm";
      return r;
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsGeom.polygonArea(ring);
}

export async function convexHull(points: GeomVertex[]): Promise<GeomVertex[]> {
  const api = await loadWasm();
  if (api) {
    try {
      const r = api.convex_hull({ points });
      activeBackend = "wasm";
      return r;
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsGeom.convexHull(points);
}

export async function simplify(line: GeomVertex[], epsilon: number): Promise<GeomVertex[]> {
  const api = await loadWasm();
  if (api) {
    try {
      const r = api.simplify({ line, epsilon });
      activeBackend = "wasm";
      return r;
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsGeom.simplify(line, epsilon);
}

export async function centroid(ring: GeomVertex[]): Promise<GeomVertex | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const r = api.centroid({ ring });
      activeBackend = "wasm";
      return r;
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsGeom.centroid(ring);
}

export async function pointInPolygon(ring: GeomVertex[], point: GeomVertex): Promise<boolean> {
  const api = await loadWasm();
  if (api) {
    try {
      const r = api.point_in_polygon({ ring, point });
      activeBackend = "wasm";
      return r;
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsGeom.pointInPolygon(ring, point);
}

export async function bounds(points: GeomVertex[]): Promise<GeomBounds | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const r = api.bounds({ points });
      activeBackend = "wasm";
      return r;
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsGeom.bounds(points);
}

export async function modelToGeoJson(model: GeoModel): Promise<string> {
  const api = await loadWasm();
  if (api) {
    try {
      const r = api.model_to_geojson(model);
      activeBackend = "wasm";
      return r;
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsGeoJson.modelToGeoJson(model);
}

export async function modelFromGeoJson(text: string): Promise<GeoModelResult> {
  const api = await loadWasm();
  if (api) {
    try {
      const r = api.model_from_geojson(text);
      activeBackend = "wasm";
      return { ...r, errors: [], warnings: [] };
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsGeoJson.modelFromGeoJson(text);
}
