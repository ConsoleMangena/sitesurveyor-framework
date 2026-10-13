/**
 * COGO hard-problem bridge.
 *
 * Wraps the new WASM functions for extended intersections, circle fitting and
 * free-station resection. When the WASM package is absent it falls back to the
 * pure-TypeScript versions in `cogo.ts`.
 */

import {
  type NE,
  type CircleFit,
  type FreeStationResult,
  type Observation,
  lineLine as tsLineLine,
  lineArc as tsLineArc,
  arcArc as tsArcArc,
  fitCircle as tsFitCircle,
  freeStation as tsFreeStation,
} from "./cogo.ts";

export type { NE, CircleFit, FreeStationResult, Observation } from "./cogo.ts";

export type CogoBackend = "wasm" | "ts";

interface WasmApi {
  cogo_line_line: (input: unknown) => unknown;
  cogo_line_arc: (input: unknown) => unknown;
  cogo_arc_arc: (input: unknown) => unknown;
  fit_circle: (points: unknown) => unknown;
  free_station: (input: unknown) => unknown;
}

const wasmLoaders = import.meta.glob("./wasm/survey_wasm.js") as Record<
  string,
  () => Promise<unknown>
>;

let wasmApi: WasmApi | null = null;
let wasmTried = false;
let activeBackend: CogoBackend = "ts";

export function lastCogoBackend(): CogoBackend {
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
    if (typeof mod.cogo_line_line === "function") {
      wasmApi = {
        cogo_line_line: mod.cogo_line_line as WasmApi["cogo_line_line"],
        cogo_line_arc: mod.cogo_line_arc as WasmApi["cogo_line_arc"],
        cogo_arc_arc: mod.cogo_arc_arc as WasmApi["cogo_arc_arc"],
        fit_circle: mod.fit_circle as WasmApi["fit_circle"],
        free_station: mod.free_station as WasmApi["free_station"],
      };
    } else {
      wasmApi = null;
    }
  } catch {
    wasmApi = null;
  }
  return wasmApi;
}

function normNe(raw: Record<string, unknown>): NE {
  return { n: Number(raw.n), e: Number(raw.e) };
}

export async function lineLine(
  p1: NE,
  q1: NE,
  p2: NE,
  q2: NE,
): Promise<NE | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.cogo_line_line({ p1, q1, p2, q2 }) as Record<string, unknown> | null;
      activeBackend = "wasm";
      if (!raw) return null;
      return normNe(raw);
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsLineLine(p1, q1, p2, q2);
}

export async function lineArc(
  a: NE,
  b: NE,
  centre: NE,
  radius: number,
): Promise<NE[]> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.cogo_line_arc({ a, b, centre, radius }) as Record<string, unknown>[];
      activeBackend = "wasm";
      return raw.map(normNe);
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsLineArc(a, b, centre, radius);
}

export async function arcArc(
  c1: NE,
  r1: number,
  c2: NE,
  r2: number,
): Promise<NE[]> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.cogo_arc_arc({ c1, r1, c2, r2 }) as Record<string, unknown>[];
      activeBackend = "wasm";
      return raw.map(normNe);
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsArcArc(c1, r1, c2, r2);
}

export async function fitCircle(points: NE[]): Promise<CircleFit | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.fit_circle(points) as Record<string, unknown> | null;
      activeBackend = "wasm";
      if (!raw) return null;
      return {
        centre: normNe(raw.centre as Record<string, unknown>),
        radius: Number(raw.radius),
        rmse: Number(raw.rmse),
      };
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsFitCircle(points);
}

export async function freeStation(
  observations: Observation[],
  initialGuess?: NE,
): Promise<FreeStationResult | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.free_station({ observations, initial_guess: initialGuess ?? null }) as
        | Record<string, unknown>
        | null;
      activeBackend = "wasm";
      if (!raw) return null;
      return {
        position: normNe(raw.position as Record<string, unknown>),
        iterations: Number(raw.iterations),
        sumSquaredResiduals: Number(raw.sum_squared_residuals),
        rmse: Number(raw.rmse),
      };
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsFreeStation(observations, initialGuess);
}
