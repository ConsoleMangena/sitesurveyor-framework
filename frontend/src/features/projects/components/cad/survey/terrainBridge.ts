/**
 * Terrain-analysis engine bridge.
 *
 * Prefers the `survey-wasm` WebAssembly module (built from `survey-core` via
 * `npm run build:wasm`); falls back transparently to the pure-TypeScript
 * `terrain.ts` engine when the WASM package is absent or fails to load. Both
 * paths are numerically equivalent.
 *
 * The WASM Rust structs serialise with snake_case fields (`slope_deg`,
 * `aspect_deg`, …); this bridge normalises them to the camelCase shape used by
 * the TS engine so callers see one consistent type regardless of backend.
 */

import * as ts from "./terrain.ts";
import type { TerrainStats, TriangleAnalysis } from "./terrain.ts";
import type { SurfaceTin } from "./surface.ts";

export type { TerrainStats, TriangleAnalysis } from "./terrain.ts";
export { slopeColor } from "./terrain.ts";

export type TerrainBackend = "wasm" | "ts";

interface WasmApi {
  analyse_terrain: (input: unknown) => unknown;
  terrain_stats: (input: unknown) => unknown;
}

const wasmLoaders = import.meta.glob("./wasm/survey_wasm.js") as Record<
  string,
  () => Promise<unknown>
>;

let wasmApi: WasmApi | null = null;
let wasmTried = false;
let activeBackend: TerrainBackend = "ts";

export function lastTerrainBackend(): TerrainBackend {
  return activeBackend;
}

async function loadWasm(): Promise<WasmApi | null> {
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
    if (typeof mod.analyse_terrain === "function" && typeof mod.terrain_stats === "function") {
      wasmApi = {
        analyse_terrain: mod.analyse_terrain as WasmApi["analyse_terrain"],
        terrain_stats: mod.terrain_stats as WasmApi["terrain_stats"],
      };
    } else {
      wasmApi = null;
    }
  } catch {
    wasmApi = null;
  }
  return wasmApi;
}

/** Normalise a snake_case WASM triangle-analysis record to camelCase. */
function normTriangle(raw: Record<string, unknown>): TriangleAnalysis {
  const aspect = raw.aspect_deg;
  return {
    index: Number(raw.index),
    slopeDeg: Number(raw.slope_deg),
    slopePercent: Number(raw.slope_percent),
    aspectDeg: aspect == null ? null : Number(aspect),
    planArea: Number(raw.plan_area),
    surfaceArea: Number(raw.surface_area),
  };
}

function normStats(raw: Record<string, unknown>): TerrainStats {
  return {
    planArea: Number(raw.plan_area),
    surfaceArea: Number(raw.surface_area),
    meanSlopeDeg: Number(raw.mean_slope_deg),
    minSlopeDeg: Number(raw.min_slope_deg),
    maxSlopeDeg: Number(raw.max_slope_deg),
    minElevation: Number(raw.min_elevation),
    maxElevation: Number(raw.max_elevation),
    triangles: Number(raw.triangles),
  };
}

export async function analyseTerrain(tin: SurfaceTin): Promise<TriangleAnalysis[]> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.analyse_terrain({ tin }) as Record<string, unknown>[];
      activeBackend = "wasm";
      return raw.map(normTriangle);
    } catch {
      /* fall through to TS */
    }
  }
  activeBackend = "ts";
  return ts.analyseTriangles(tin);
}

export async function terrainStats(tin: SurfaceTin): Promise<TerrainStats | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.terrain_stats({ tin }) as Record<string, unknown> | null;
      activeBackend = "wasm";
      return raw ? normStats(raw) : null;
    } catch {
      /* fall through to TS */
    }
  }
  activeBackend = "ts";
  return ts.terrainStats(tin);
}
