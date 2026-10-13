/**
 * Coordinate reprojection bridge.
 *
 * On the desktop (Tauri) build this calls the native `reproject` command, which
 * is backed by the GeoRust `proj` crate (the PROJ library) and performs true
 * datum transforms — but only when the app was compiled with `--features proj`.
 *
 * On the web build (or a desktop build without the `proj` feature) it falls
 * back to the in-app Karney Transverse Mercator in `projection.ts`. That
 * fallback handles the WGS84-geographic ↔ projected cases used in the COGO
 * panel; it does NOT perform datum shifts between different geodetic datums
 * (e.g. Arc 1950 ↔ WGS84), which genuinely require PROJ.
 *
 * All coordinates use the CAD convention X = Easting (`e`), Y = Northing (`n`).
 * For geographic CRS (EPSG:4326) the convention is X = longitude, Y = latitude.
 */

import {
  WGS84_GEOGRAPHIC,
  projectForward,
  projectInverse,
  type ProjectionDef,
} from "./projection.ts";

export interface ReprojVertex {
  n: number;
  e: number;
}

export type ReprojectBackend = "proj" | "karney";

let activeBackend: ReprojectBackend = "karney";
/** Which engine the most recent reprojection used (for status display). */
export function lastReprojectBackend(): ReprojectBackend {
  return activeBackend;
}

// ── Tauri detection + lazy invoke ────────────────────────────────────────────

interface TauriCore {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

let tauriCore: TauriCore | null | undefined;
let projAvailable: boolean | undefined;

/** True when running inside the Tauri desktop shell. */
function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  // Tauri v2 injects these regardless of `withGlobalTauri`.
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w || w.isTauri === true;
}

/** Lazily load `@tauri-apps/api/core` only inside the desktop shell. */
async function getTauri(): Promise<TauriCore | null> {
  if (tauriCore !== undefined) return tauriCore;
  if (!isTauri()) {
    tauriCore = null;
    return tauriCore;
  }
  try {
    const mod = (await import("@tauri-apps/api/core")) as unknown as TauriCore;
    tauriCore = typeof mod.invoke === "function" ? mod : null;
  } catch {
    tauriCore = null;
  }
  return tauriCore;
}

/**
 * Whether real PROJ-backed datum transforms are available in this runtime.
 * Cached after the first check. Always false on the web build.
 */
export async function isProjAvailable(): Promise<boolean> {
  if (projAvailable !== undefined) return projAvailable;
  const t = await getTauri();
  if (!t) {
    projAvailable = false;
    return projAvailable;
  }
  try {
    projAvailable = await t.invoke<boolean>("proj_available");
  } catch {
    projAvailable = false;
  }
  return projAvailable;
}

// ── Karney fallback ──────────────────────────────────────────────────────────

/**
 * Reproject using the in-app Karney TM. Only the WGS84-geographic ↔ projected
 * directions are supported; any other pair throws so the caller surfaces a
 * clear "needs PROJ" message rather than returning silently-wrong numbers.
 */
function karneyReproject(
  from: ProjectionDef | "wgs84",
  to: ProjectionDef | "wgs84",
  points: ReprojVertex[],
): ReprojVertex[] {
  if (from === "wgs84" && to !== "wgs84") {
    // lon/lat (e = lon, n = lat) -> projected.
    return points.map((p) => {
      const r = projectForward(to, { lat: p.n, lon: p.e });
      return { n: r.n, e: r.e };
    });
  }
  if (from !== "wgs84" && to === "wgs84") {
    // projected -> lon/lat.
    return points.map((p) => {
      const ll = projectInverse(from, p.n, p.e);
      return { n: ll.lat, e: ll.lon };
    });
  }
  if (from !== "wgs84" && to !== "wgs84") {
    // projected -> WGS84 geographic -> projected (same datum only).
    return points.map((p) => {
      const ll = projectInverse(from, p.n, p.e);
      const r = projectForward(to, { lat: ll.lat, lon: ll.lon });
      return { n: r.n, e: r.e };
    });
  }
  throw new Error("Karney fallback cannot map WGS84 → WGS84.");
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Reproject a batch of coordinates between two CRS.
 *
 * `from`/`to` are `ProjectionDef`s (or the string "wgs84" for EPSG:4326).
 * Prefers the native PROJ transform; otherwise uses the Karney fallback.
 */
export async function reproject(
  from: ProjectionDef | "wgs84",
  to: ProjectionDef | "wgs84",
  points: ReprojVertex[],
): Promise<ReprojVertex[]> {
  if (points.length === 0) return [];

  const fromCrs = from === "wgs84" ? WGS84_GEOGRAPHIC : from.crs;
  const toCrs = to === "wgs84" ? WGS84_GEOGRAPHIC : to.crs;

  // Try the native PROJ command when both CRS have authoritative identifiers.
  if (fromCrs && toCrs && (await isProjAvailable())) {
    const t = await getTauri();
    if (t) {
      try {
        const result = await t.invoke<ReprojVertex[]>("reproject", {
          from: fromCrs,
          to: toCrs,
          points,
        });
        activeBackend = "proj";
        return result;
      } catch {
        /* fall through to Karney */
      }
    }
  }

  activeBackend = "karney";
  return karneyReproject(from, to, points);
}
