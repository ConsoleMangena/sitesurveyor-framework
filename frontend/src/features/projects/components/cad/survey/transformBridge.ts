/**
 * Coordinate transformation bridge.
 *
 * Prefers the WASM-backed Helmert/affine fits and diagnostics from
 * `survey-wasm`; falls back to the pure-TypeScript `transform.ts` engine.
 */

import {
  type HelmertTransform,
  type AffineTransform,
  type Residual,
  type TransformDiagnostics,
  applyHelmert as tsApplyHelmert,
  inverseHelmert as tsInverseHelmert,
  fitHelmert as tsFitHelmert,
  helmertDiagnostics as tsHelmertDiagnostics,
  detectOutliers as tsDetectOutliers,
  applyAffine as tsApplyAffine,
  inverseAffine as tsInverseAffine,
  fitAffine as tsFitAffine,
  affineDiagnostics as tsAffineDiagnostics,
} from "./transform.ts";
import { type NE } from "./cogo.ts";

export type {
  HelmertTransform,
  AffineTransform,
  Residual,
  TransformDiagnostics,
} from "./transform.ts";

export type { NE } from "./cogo.ts";

export type TransformBackend = "wasm" | "ts";

interface WasmApi {
  transform_helmert_apply: (input: unknown) => unknown;
  transform_helmert_inverse: (input: unknown) => unknown;
  transform_helmert_fit: (input: unknown) => unknown;
  transform_helmert_diagnostics: (input: unknown) => unknown;
  transform_detect_outliers: (input: unknown) => unknown;
  transform_affine_apply: (input: unknown) => unknown;
  transform_affine_fit: (input: unknown) => unknown;
  transform_affine_diagnostics: (input: unknown) => unknown;
}

const wasmLoaders = import.meta.glob("./wasm/survey_wasm.js") as Record<
  string,
  () => Promise<unknown>
>;

let wasmApi: WasmApi | null = null;
let wasmTried = false;
let activeBackend: TransformBackend = "ts";

export function lastTransformBackend(): TransformBackend {
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
    if (typeof mod.transform_helmert_apply === "function") {
      wasmApi = {
        transform_helmert_apply: mod.transform_helmert_apply as WasmApi["transform_helmert_apply"],
        transform_helmert_inverse: mod.transform_helmert_inverse as WasmApi["transform_helmert_inverse"],
        transform_helmert_fit: mod.transform_helmert_fit as WasmApi["transform_helmert_fit"],
        transform_helmert_diagnostics: mod.transform_helmert_diagnostics as WasmApi["transform_helmert_diagnostics"],
        transform_detect_outliers: mod.transform_detect_outliers as WasmApi["transform_detect_outliers"],
        transform_affine_apply: mod.transform_affine_apply as WasmApi["transform_affine_apply"],
        transform_affine_fit: mod.transform_affine_fit as WasmApi["transform_affine_fit"],
        transform_affine_diagnostics: mod.transform_affine_diagnostics as WasmApi["transform_affine_diagnostics"],
      };
    } else {
      wasmApi = null;
    }
  } catch {
    wasmApi = null;
  }
  return wasmApi;
}

function helmertToWasm(t: HelmertTransform): Record<string, unknown> {
  return {
    scale: t.scale,
    rotation_deg: t.rotationDeg,
    translation_n: t.translationN,
    translation_e: t.translationE,
  };
}

function helmertFromWasm(raw: Record<string, unknown>): HelmertTransform {
  return {
    scale: Number(raw.scale),
    rotationDeg: Number(raw.rotation_deg),
    translationN: Number(raw.translation_n),
    translationE: Number(raw.translation_e),
  };
}

function affineToWasm(t: AffineTransform): Record<string, unknown> {
  return {
    a: t.a,
    b: t.b,
    c: t.c,
    d: t.d,
    e: t.e,
    f: t.f,
  };
}

function affineFromWasm(raw: Record<string, unknown>): AffineTransform {
  return {
    a: Number(raw.a),
    b: Number(raw.b),
    c: Number(raw.c),
    d: Number(raw.d),
    e: Number(raw.e),
    f: Number(raw.f),
  };
}

function normNe(raw: Record<string, unknown>): NE {
  return { n: Number(raw.n), e: Number(raw.e) };
}

function normResidual(raw: Record<string, unknown>): Residual {
  return { n: Number(raw.n), e: Number(raw.e) };
}

function normDiagnostics(raw: Record<string, unknown>): TransformDiagnostics {
  return {
    residuals: (raw.residuals as Record<string, unknown>[]).map(normResidual),
    rmse: Number(raw.rmse),
    maxOffset: Number(raw.max_offset),
    maxIndex: Number(raw.max_index),
  };
}

export async function applyHelmert(
  point: NE,
  transform: HelmertTransform,
): Promise<NE> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.transform_helmert_apply({ transform: helmertToWasm(transform), point }) as
        Record<string, unknown>;
      activeBackend = "wasm";
      return normNe(raw);
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsApplyHelmert(point, transform);
}

export async function inverseHelmert(
  transform: HelmertTransform,
): Promise<HelmertTransform> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.transform_helmert_inverse(helmertToWasm(transform)) as Record<string, unknown>;
      activeBackend = "wasm";
      return helmertFromWasm(raw);
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsInverseHelmert(transform);
}

export async function fitHelmert(
  source: NE[],
  target: NE[],
): Promise<HelmertTransform | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.transform_helmert_fit({ source, target }) as Record<string, unknown> | null;
      activeBackend = "wasm";
      if (!raw) return null;
      return helmertFromWasm(raw);
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsFitHelmert(source, target);
}

export async function helmertDiagnostics(
  transform: HelmertTransform,
  source: NE[],
  target: NE[],
): Promise<TransformDiagnostics | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.transform_helmert_diagnostics({
        transform: helmertToWasm(transform),
        source,
        target,
      }) as Record<string, unknown> | null;
      activeBackend = "wasm";
      if (!raw) return null;
      return normDiagnostics(raw);
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsHelmertDiagnostics(transform, source, target);
}

export async function detectOutliers(
  source: NE[],
  target: NE[],
  thresholdMultiplier = 2,
): Promise<number[] | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.transform_detect_outliers({
        source,
        target,
        threshold_multiplier: thresholdMultiplier,
      }) as number[] | null;
      activeBackend = "wasm";
      return raw;
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsDetectOutliers(source, target, thresholdMultiplier);
}

export async function applyAffine(
  point: NE,
  transform: AffineTransform,
): Promise<NE> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.transform_affine_apply({ transform: affineToWasm(transform), point }) as
        Record<string, unknown>;
      activeBackend = "wasm";
      return normNe(raw);
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsApplyAffine(point, transform);
}

export async function inverseAffine(
  transform: AffineTransform,
): Promise<AffineTransform | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.transform_affine_apply({ transform: affineToWasm(transform) }) as
        | Record<string, unknown>
        | null;
      activeBackend = "wasm";
      if (!raw) return null;
      return affineFromWasm(raw);
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsInverseAffine(transform);
}

export async function fitAffine(
  source: NE[],
  target: NE[],
): Promise<AffineTransform | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.transform_affine_fit({ source, target }) as Record<string, unknown> | null;
      activeBackend = "wasm";
      if (!raw) return null;
      return affineFromWasm(raw);
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsFitAffine(source, target);
}

export async function affineDiagnostics(
  transform: AffineTransform,
  source: NE[],
  target: NE[],
): Promise<TransformDiagnostics | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.transform_affine_diagnostics({
        transform: affineToWasm(transform),
        source,
        target,
      }) as Record<string, unknown> | null;
      activeBackend = "wasm";
      if (!raw) return null;
      return normDiagnostics(raw);
    } catch {
      /* fall through */
    }
  }
  activeBackend = "ts";
  return tsAffineDiagnostics(transform, source, target);
}
