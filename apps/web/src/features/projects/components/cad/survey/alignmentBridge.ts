/**
 * Alignment setting-out engine bridge (horizontal circular & vertical parabolic
 * curves).
 *
 * Prefers the `survey-wasm` WebAssembly module (from `survey-core::alignment`);
 * falls back to the pure-TypeScript `cogo.ts` implementation when WASM is
 * unavailable. Both paths are numerically equivalent.
 *
 * The WASM structs serialise with snake_case fields; this bridge normalises
 * them to the camelCase shape used by the TS engine so callers see one type.
 */

import {
  horizontalCurve as tsHorizontalCurve,
  stakeHorizontalCurve as tsStake,
  verticalCurve as tsVerticalCurve,
  type HorizontalCurve,
  type CurveStation,
  type VerticalCurve,
  type NE,
} from "./cogo.ts";

export type { HorizontalCurve, CurveStation, VerticalCurve } from "./cogo.ts";

export type AlignmentBackend = "wasm" | "ts";

interface WasmApi {
  stake_horizontal_curve: (input: unknown) => unknown;
  vertical_curve: (input: unknown) => unknown;
}

const wasmLoaders = import.meta.glob("./wasm/survey_wasm.js") as Record<
  string,
  () => Promise<unknown>
>;

let wasmApi: WasmApi | null = null;
let wasmTried = false;
let activeBackend: AlignmentBackend = "ts";

export function lastAlignmentBackend(): AlignmentBackend {
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
    if (
      typeof mod.stake_horizontal_curve === "function" &&
      typeof mod.vertical_curve === "function"
    ) {
      wasmApi = {
        stake_horizontal_curve: mod.stake_horizontal_curve as WasmApi["stake_horizontal_curve"],
        vertical_curve: mod.vertical_curve as WasmApi["vertical_curve"],
      };
    } else {
      wasmApi = null;
    }
  } catch {
    wasmApi = null;
  }
  return wasmApi;
}

function normVertex(raw: Record<string, unknown>): NE {
  return { n: Number(raw.n), e: Number(raw.e) };
}

function normCurve(raw: Record<string, unknown>): HorizontalCurve {
  return {
    radius: Number(raw.radius),
    deflection: Number(raw.deflection),
    tangent: Number(raw.tangent),
    length: Number(raw.length),
    external: Number(raw.external),
    middleOrdinate: Number(raw.middle_ordinate),
    longChord: Number(raw.long_chord),
    pc: normVertex(raw.pc as Record<string, unknown>),
    pt: normVertex(raw.pt as Record<string, unknown>),
    centre: normVertex(raw.centre as Record<string, unknown>),
    turnsRight: Boolean(raw.turns_right),
  };
}

export interface StakedHorizontalCurve {
  curve: HorizontalCurve;
  stations: CurveStation[];
}

/**
 * Solve and stake a horizontal circular curve from the PI, the back/forward
 * tangent azimuths, the radius and a staking interval. Returns null for a
 * degenerate (0°/180°) deflection or non-positive radius.
 */
export async function stakeHorizontalCurve(
  pi: NE,
  backAzimuth: number,
  fwdAzimuth: number,
  radius: number,
  interval: number,
): Promise<StakedHorizontalCurve | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.stake_horizontal_curve({
        pi,
        back_azimuth: backAzimuth,
        fwd_azimuth: fwdAzimuth,
        radius,
        interval,
      }) as Record<string, unknown> | null;
      activeBackend = "wasm";
      if (!raw) return null;
      const curve = normCurve(raw.curve as Record<string, unknown>);
      const stations = (raw.stations as Record<string, unknown>[]).map((s) => ({
        arcFromPc: Number(s.arc_from_pc),
        point: normVertex(s.point as Record<string, unknown>),
        deflection: Number(s.deflection),
      }));
      return { curve, stations };
    } catch {
      /* fall through to TS */
    }
  }
  activeBackend = "ts";
  const curve = tsHorizontalCurve(pi, backAzimuth, fwdAzimuth, radius);
  if (!curve) return null;
  const stations = tsStake(curve, backAzimuth, interval);
  return { curve, stations };
}

/**
 * Design an equal-tangent vertical parabolic curve. Returns null for a
 * non-positive length.
 */
export async function verticalCurve(
  bvcElevation: number,
  g1: number,
  g2: number,
  length: number,
  interval: number,
): Promise<VerticalCurve | null> {
  const api = await loadWasm();
  if (api) {
    try {
      const raw = api.vertical_curve({
        bvc_elevation: bvcElevation,
        g1,
        g2,
        length,
        interval,
      }) as Record<string, unknown> | null;
      activeBackend = "wasm";
      if (!raw) return null;
      return {
        bvcElevation: Number(raw.bvc_elevation),
        evcElevation: Number(raw.evc_elevation),
        gradeChange: Number(raw.grade_change),
        turningChainage: raw.turning_chainage == null ? null : Number(raw.turning_chainage),
        turningElevation: raw.turning_elevation == null ? null : Number(raw.turning_elevation),
        stations: (raw.stations as Record<string, unknown>[]).map((s) => ({
          chainage: Number(s.chainage),
          elevation: Number(s.elevation),
        })),
      };
    } catch {
      /* fall through to TS */
    }
  }
  activeBackend = "ts";
  return tsVerticalCurve(bvcElevation, g1, g2, length, interval);
}
