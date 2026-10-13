/**
 * Surface engine bridge.
 *
 * Prefers the high-performance `survey-wasm` WebAssembly module (built from the
 * Rust `survey-core` crate via `npm run build:wasm`). If the WASM package is not
 * present or fails to load, it transparently falls back to the pure-TypeScript
 * `surface.ts` engine. Both paths are numerically equivalent, so callers never
 * need to care which one ran.
 *
 * The WASM module is imported dynamically so it ships as a separate lazy chunk
 * and never bloats the initial app bundle — it is only fetched the first time a
 * surface computation is requested in the CAD workspace.
 */

import * as ts from "./surface.ts";
import type {
  SurfaceContourLine,
  SurfacePoint3,
  SurfaceTin,
  SurfaceVolumeResult,
} from "./surface.ts";

export type {
  SurfaceContourLine,
  SurfacePoint3,
  SurfaceTin,
  SurfaceVertex,
  SurfaceTriangle,
  SurfaceVolumeResult,
  CutFillTriangle,
  CutFillResult,
  SurfaceConstraint,
  ConstrainedTinOptions,
} from "./surface.ts";

export type SurfaceBackend = "wasm" | "ts";

interface WasmApi {
  build_tin: (input: unknown) => SurfaceTin;
  build_constrained_tin: (input: unknown) => SurfaceTin;
  generate_contours: (input: unknown) => SurfaceContourLine[];
  volume_to_elevation: (input: unknown) => SurfaceVolumeResult;
  volume_between: (input: unknown) => SurfaceVolumeResult;
}

/**
 * Lazy loaders for the generated WASM module. `import.meta.glob` resolves at
 * build time and yields an empty object when the (gitignored) `wasm/` output is
 * absent — so the bridge silently uses the TS fallback until `build:wasm` runs.
 */
const wasmLoaders = import.meta.glob("./wasm/survey_wasm.js") as Record<
  string,
  () => Promise<unknown>
>;

let wasmApi: WasmApi | null = null;
let wasmTried = false;
let activeBackend: SurfaceBackend = "ts";

/** Which engine the most recent call used. Useful for status display. */
export function lastBackend(): SurfaceBackend {
  return activeBackend;
}

/**
 * Attempt to load the WASM module exactly once. The import path is the
 * generated wasm-pack output (gitignored); when it is absent the dynamic import
 * throws and we permanently fall back to the TS engine for this session.
 */
async function loadWasm(): Promise<WasmApi | null> {
  if (wasmTried) return wasmApi;
  wasmTried = true;
  try {
    // The specifier is built at runtime so TypeScript does not try to resolve
    // the generated (gitignored) module at compile time. Vite still
    // code-splits it into a lazy chunk via the glob below.
    const loader = wasmLoaders["./wasm/survey_wasm.js"];
    if (!loader) {
      wasmApi = null;
      return wasmApi;
    }
    const mod = (await loader()) as Record<string, unknown> & {
      default?: () => Promise<unknown>;
    };
    if (typeof mod.default === "function") {
      await mod.default(); // initialise the wasm instance
    }
    wasmApi = {
      build_tin: mod.build_tin as WasmApi["build_tin"],
      build_constrained_tin: mod.build_constrained_tin as WasmApi["build_constrained_tin"],
      generate_contours: mod.generate_contours as WasmApi["generate_contours"],
      volume_to_elevation: mod.volume_to_elevation as WasmApi["volume_to_elevation"],
      volume_between: mod.volume_between as WasmApi["volume_between"],
    };
  } catch {
    wasmApi = null; // pure-TS fallback
  }
  return wasmApi;
}

export async function buildTin(points: SurfacePoint3[]): Promise<SurfaceTin> {
  const api = await loadWasm();
  if (api) {
    try {
      const tin = api.build_tin({ points });
      activeBackend = "wasm";
      return tin;
    } catch {
      /* fall through to TS */
    }
  }
  activeBackend = "ts";
  return ts.buildTin(points);
}

/**
 * Build a TIN constrained by breaklines and/or a clip boundary. Prefers the
 * WASM engine when available and falls back to the pure-TypeScript constrained
 * builder. Both paths are numerically equivalent.
 */
export async function buildConstrainedTin(
  points: SurfacePoint3[],
  opts: ts.ConstrainedTinOptions = {},
): Promise<SurfaceTin> {
  const api = await loadWasm();
  if (api) {
    try {
      const tin = api.build_constrained_tin({ points, options: opts });
      activeBackend = "wasm";
      return tin;
    } catch {
      /* fall through to TS */
    }
  }
  activeBackend = "ts";
  return ts.buildConstrainedTin(points, opts);
}

/**
 * Generate contours from a TIN.
 *
 * `smooth` applies Chaikin corner-cutting to round the raw marching-triangle
 * chords into survey-grade curves. It is applied in TS after the (WASM or TS)
 * marching step, so both backends produce identically smoothed output.
 */
export async function generateContours(
  tin: SurfaceTin,
  interval: number,
  base = 0,
  smooth = 0,
): Promise<SurfaceContourLine[]> {
  const api = await loadWasm();
  let lines: SurfaceContourLine[] | null = null;
  if (api) {
    try {
      lines = api.generate_contours({ tin, interval, base });
      activeBackend = "wasm";
    } catch {
      lines = null; // fall through to TS
    }
  }
  if (lines === null) {
    activeBackend = "ts";
    // The TS engine can smooth in one pass.
    return ts.generateContours(tin, interval, base, smooth);
  }
  if (smooth > 0) {
    lines = lines.map((l) => ({
      elevation: l.elevation,
      vertices: ts.smoothContourVertices(l.vertices, smooth),
    }));
  }
  return lines;
}

export async function volumeToElevation(
  tin: SurfaceTin,
  reference: number,
): Promise<SurfaceVolumeResult> {
  const api = await loadWasm();
  if (api) {
    try {
      const result = api.volume_to_elevation({ tin, reference });
      activeBackend = "wasm";
      return result;
    } catch {
      /* fall through to TS */
    }
  }
  activeBackend = "ts";
  return ts.volumeToElevation(tin, reference);
}

export async function volumeBetween(
  top: SurfaceTin,
  base: SurfaceTin,
  mode: "strict" | "overlap" = "overlap",
): Promise<SurfaceVolumeResult> {
  // The WASM `volume_between` binding is STRICT. In strict mode prefer it;
  // on overlap the deterministic TS engine is the only correct path.
  if (mode === "strict") {
    const api = await loadWasm();
    if (api) {
      try {
        const result = api.volume_between({ top, base });
        activeBackend = "wasm";
        return result;
      } catch (err) {
        // Footprint violations must reach the user in strict mode — never
        // silently recompute with different (overlap) semantics.
        if (err instanceof Error && /outside|footprint|boundary/i.test(err.message)) throw err;
        /* engine unavailable/failure — fall through to TS */
      }
    }
    activeBackend = "ts";
    return ts.volumeBetween(top, base, "strict");
  }
  activeBackend = "ts";
  return ts.volumeBetween(top, base, "overlap");
}

/**
 * Per-triangle cut/fill quantities for rendering a coloured 3D earthworks
 * model. These are lightweight geometry derived from an already-built TIN, so
 * they always run in the (numerically identical) TS engine.
 */
export function cutFillToElevation(tin: SurfaceTin, reference: number) {
  return ts.cutFillToElevation(tin, reference);
}

export function cutFillBetween(top: SurfaceTin, base: SurfaceTin) {
  return ts.cutFillBetween(top, base);
}
