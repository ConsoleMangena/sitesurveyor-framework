/**
 * Survey feature-code library (field-to-finish).
 *
 * A surveyor records a short *code* against every observed point (e.g. `TREE`,
 * `MH`, `FL`, `TOP`). This library maps those codes to:
 *
 *   - a cartographic **symbol** drawn at the point (tree, manhole, pole, …),
 *   - the **layer** the point/linework belongs to,
 *   - **linework** behaviour: points sharing a *stringable* code are joined in
 *     observation order into a polyline (kerbs, fences, edges of road, …),
 *   - a **breakline** flag so the linework constrains the TIN (ridges, ditches,
 *     kerbs — hard edges the surface must honour).
 *
 * Codes may carry a numeric *string number* suffix so several concurrent runs
 * of the same feature can be surveyed interleaved, exactly like Trimble Access
 * / Leica Captivate: `FL1`, `FL2` are two independent kerb strings. The base
 * code (`FL`) selects the behaviour; the suffix (`1`, `2`) groups the string.
 */

/** Point symbol glyphs the viewport and plot know how to draw. */
export type FeatureSymbol =
  | "dot"
  | "circle"
  | "square"
  | "triangle"
  | "cross"
  | "tree"
  | "manhole"
  | "pole"
  | "hydrant"
  | "sign"
  | "bollard"
  | "light";

export interface FeatureCodeDef {
  /** Canonical base code, upper-case (e.g. "FL"). */
  code: string;
  /** Human description shown in legends and tooltips. */
  description: string;
  /** Target layer id (must exist in the model's DEFAULT_LAYERS or be created). */
  layerId: string;
  /** Symbol drawn at each point carrying this code. */
  symbol: FeatureSymbol;
  /** Join same-string points into a polyline (field-to-finish linework). */
  stringable: boolean;
  /** Close the string into a ring when finished (e.g. building outline). */
  closed?: boolean;
  /** Constrain the TIN with this string as a hard breakline. */
  breakline?: boolean;
}

/**
 * Built-in code table covering the common detail-survey features. Codes are the
 * de-facto Southern-African / TBC conventions; users can extend this at the
 * call site by passing a merged table.
 */
export const DEFAULT_FEATURE_CODES: FeatureCodeDef[] = [
  // ── Stringed linework / breaklines ──────────────────────────────────────
  { code: "FL", description: "Edge of road / flow line", layerId: "TOPO", symbol: "cross", stringable: true, breakline: true },
  { code: "EK", description: "Edge of kerb", layerId: "TOPO", symbol: "cross", stringable: true, breakline: true },
  { code: "TOP", description: "Top of bank / ridge", layerId: "TOPO", symbol: "triangle", stringable: true, breakline: true },
  { code: "TOE", description: "Toe of bank", layerId: "TOPO", symbol: "triangle", stringable: true, breakline: true },
  { code: "CL", description: "Centre line", layerId: "TOPO", symbol: "cross", stringable: true, breakline: true },
  { code: "DITCH", description: "Ditch / drain invert", layerId: "TOPO", symbol: "cross", stringable: true, breakline: true },
  { code: "WALL", description: "Wall", layerId: "BOUNDARY", symbol: "square", stringable: true, breakline: true },
  { code: "FENCE", description: "Fence line", layerId: "BOUNDARY", symbol: "cross", stringable: true, breakline: false },
  { code: "BLDG", description: "Building outline", layerId: "BOUNDARY", symbol: "square", stringable: true, closed: true, breakline: true },
  { code: "BDY", description: "Cadastral boundary", layerId: "BOUNDARY", symbol: "circle", stringable: true, closed: true, breakline: false },

  // ── Point symbols (non-stringed detail) ─────────────────────────────────
  { code: "TREE", description: "Tree", layerId: "TOPO", symbol: "tree", stringable: false },
  { code: "MH", description: "Manhole", layerId: "TOPO", symbol: "manhole", stringable: false },
  { code: "POLE", description: "Power / telephone pole", layerId: "TOPO", symbol: "pole", stringable: false },
  { code: "LP", description: "Light pole", layerId: "TOPO", symbol: "light", stringable: false },
  { code: "HYD", description: "Fire hydrant", layerId: "TOPO", symbol: "hydrant", stringable: false },
  { code: "SIGN", description: "Sign", layerId: "TOPO", symbol: "sign", stringable: false },
  { code: "BOL", description: "Bollard", layerId: "TOPO", symbol: "bollard", stringable: false },
  { code: "SV", description: "Stop / sluice valve", layerId: "TOPO", symbol: "circle", stringable: false },

  // ── Control ─────────────────────────────────────────────────────────────
  { code: "CP", description: "Control point", layerId: "CONTROL", symbol: "triangle", stringable: false },
  { code: "BM", description: "Bench mark", layerId: "CONTROL", symbol: "triangle", stringable: false },
  { code: "STN", description: "Station", layerId: "CONTROL", symbol: "triangle", stringable: false },
];

/** Fallback used for any point whose code is not in the table. */
export const UNKNOWN_FEATURE: FeatureCodeDef = {
  code: "",
  description: "Uncoded point",
  layerId: "TOPO",
  symbol: "dot",
  stringable: false,
};

export interface ParsedCode {
  /** Base code, upper-case, no suffix (e.g. "FL"). */
  base: string;
  /** String number suffix, or null when absent (e.g. 1 from "FL1"). */
  string: number | null;
  /** The raw code as recorded. */
  raw: string;
}

/**
 * Split a recorded code into its base and string-number suffix. Trailing
 * digits are treated as the string number so `FL`, `FL1`, `FL12` all map to the
 * base `FL`. A bare number (e.g. "101") has no base and is treated as uncoded.
 */
export function parseCode(raw: string): ParsedCode {
  const trimmed = (raw ?? "").trim().toUpperCase();
  const m = trimmed.match(/^([A-Z_]+)(\d*)$/);
  if (!m) return { base: trimmed, string: null, raw: trimmed };
  const base = m[1];
  const suffix = m[2];
  return { base, string: suffix === "" ? null : parseInt(suffix, 10), raw: trimmed };
}

/** Build a fast lookup from base code → definition. */
export function buildCodeTable(
  codes: FeatureCodeDef[] = DEFAULT_FEATURE_CODES,
): Map<string, FeatureCodeDef> {
  const table = new Map<string, FeatureCodeDef>();
  for (const c of codes) table.set(c.code.toUpperCase(), c);
  return table;
}

/** Resolve the definition for a recorded code, or the uncoded fallback. */
export function resolveFeature(
  raw: string,
  table: Map<string, FeatureCodeDef>,
): FeatureCodeDef {
  const { base } = parseCode(raw);
  return table.get(base) ?? UNKNOWN_FEATURE;
}
