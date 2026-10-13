/**
 * Field-to-finish: build linework strings from coded survey points.
 *
 * Points that share a *stringable* base code and the same string-number suffix
 * are joined, in the order they were observed, into a polyline. This is the
 * classic "linework by code" step every survey package runs after import
 * (Trimble Business Center's Process Linework, Leica Infinity's CoGo strings,
 * Civil 3D's figures). Closed codes (buildings, boundaries) form rings.
 *
 * The result also flags which strings are *breaklines*, so the surface engine
 * can constrain the TIN to honour them (see `tin.ts` breakline support).
 */

import type { SurveyPoint } from "../cadModel.ts";
import { parseCode, resolveFeature, type FeatureCodeDef } from "./featureCodes.ts";

export interface FeatureString {
  /** Base code of the string (e.g. "FL"). */
  code: string;
  /** String number, or null for the unnumbered default run. */
  string: number | null;
  /** The feature definition governing symbol/layer/behaviour. */
  def: FeatureCodeDef;
  /** Ordered vertices of the string. */
  vertices: { n: number; e: number; z: number | null }[];
  /** Point ids that make up the string, index-aligned with `vertices`. */
  pointIds: string[];
  /** Whether this string closes into a ring. */
  closed: boolean;
  /** Whether this string is a hard breakline for the TIN. */
  breakline: boolean;
}

export interface FieldToFinishResult {
  strings: FeatureString[];
  /** Number of source points that contributed to at least one string. */
  strungPoints: number;
}

/**
 * Group coded points into feature strings.
 *
 * Points are processed in array order (assumed to be observation order). For
 * each stringable code, a key of `base#string` accumulates vertices; a break in
 * a run does not matter because a string is defined by its shared key, not by
 * adjacency. Non-stringable codes (tree, manhole, …) are ignored here — they
 * are rendered as symbols, not linework.
 */
export function buildFeatureStrings(
  points: SurveyPoint[],
  table: Map<string, FeatureCodeDef>,
): FieldToFinishResult {
  const groups = new Map<string, FeatureString>();
  const contributing = new Set<string>();

  for (const p of points) {
    const parsed = parseCode(p.code);
    const def = resolveFeature(p.code, table);
    if (!def.stringable) continue;

    const key = `${def.code}#${parsed.string ?? 0}`;
    let str = groups.get(key);
    if (!str) {
      str = {
        code: def.code,
        string: parsed.string,
        def,
        vertices: [],
        pointIds: [],
        closed: def.closed ?? false,
        breakline: def.breakline ?? false,
      };
      groups.set(key, str);
    }
    str.vertices.push({ n: p.n, e: p.e, z: p.z });
    str.pointIds.push(p.id);
    contributing.add(p.id);
  }

  // Discard degenerate strings (a single point cannot form linework).
  const strings = [...groups.values()].filter((s) => s.vertices.length >= 2);

  return { strings, strungPoints: contributing.size };
}
