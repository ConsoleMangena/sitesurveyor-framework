/**
 * Survey value formatting: coordinates and directions.
 *
 * Surveyors read directions in different conventions; we support:
 * - WCB / forward bearing (decimal degrees, clockwise from North)
 * - Reduced bearing (e.g. N45°30'20"E)
 * - Gons / Grads (400 in a circle)
 */
import { normalizeAzimuth } from "./cogo.ts";

export type BearingFormat = "azimuth" | "quadrant" | "gon";

/** Format a coordinate value with fixed decimals. */
export function fmtCoord(value: number, decimals = 3): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

import type { AxisConvention } from "../cadSettings.ts";
import { axisBadgeLabels } from "../cadSettings.ts";

/**
 * Format a survey point reference using the configured axis convention:
 * default Zimbabwe / SURPAC convention (Y = Easting, X = Northing), H = Height/RL.
 */
export function fmtPointRef(
  p: { pointNo: string; n: number; e: number; z?: number | null },
  decimals = 3,
  axisConvention: AxisConvention = "yx",
): string {
  const axis = axisBadgeLabels(axisConvention);
  const h = p.z != null ? ` H ${fmtCoord(p.z, decimals)}` : "";
  return `${p.pointNo} (${axis.first} ${fmtCoord(p.e, decimals)}, ${axis.second} ${fmtCoord(p.n, decimals)}${h})`;
}

/** Format a plan distance. */
export function fmtDistance(value: number, decimals = 3): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}`;
}

/** Convert decimal degrees to D°M'S" components. */
export function toDMS(deg: number): { d: number; m: number; s: number } {
  const sign = deg < 0 ? -1 : 1;
  let abs = Math.abs(deg);
  let d = Math.floor(abs);
  abs = (abs - d) * 60;
  let m = Math.floor(abs);
  let s = (abs - m) * 60;
  // Carry rounding. The threshold must match toFixed(2)'s rounding point
  // (59.995), otherwise seconds in [59.995, 59.9995) format as "60.00"
  // and produce invalid output like 45°30'60.00".
  if (s >= 59.995) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d += 1;
  }
  return { d: sign * d, m, s };
}

function dmsString(deg: number): string {
  const { d, m, s } = toDMS(deg);
  return `${d}°${String(m).padStart(2, "0")}'${s.toFixed(2).padStart(5, "0")}"`;
}

/** Format an azimuth (deg) into the requested bearing convention. */
export function fmtBearing(azimuthDeg: number, format: BearingFormat = "azimuth"): string {
  const az = normalizeAzimuth(azimuthDeg);
  if (format === "azimuth") {
    return dmsString(az);
  }
  if (format === "gon") {
    const gon = (az / 360) * 400;
    return `${gon.toFixed(4)} gon`;
  }
  // Reduced (quadrant) bearing.
  let prefix: string;
  let suffix: string;
  let angle: number;
  if (az < 90) {
    prefix = "N";
    suffix = "E";
    angle = az;
  } else if (az < 180) {
    prefix = "S";
    suffix = "E";
    angle = 180 - az;
  } else if (az < 270) {
    prefix = "S";
    suffix = "W";
    angle = az - 180;
  } else {
    prefix = "N";
    suffix = "W";
    angle = 360 - az;
  }
  return `${prefix}${dmsString(angle)}${suffix}`;
}

/** Format an area in m² with a hectare hint for large areas. */
export function fmtArea(areaSqm: number): string {
  if (!Number.isFinite(areaSqm)) return "—";
  if (areaSqm >= 10000) {
    return `${areaSqm.toFixed(2)} m² (${(areaSqm / 10000).toFixed(4)} ha)`;
  }
  return `${areaSqm.toFixed(2)} m²`;
}

/** Format a volume in m³ with a useful secondary unit for large quantities. */
export function fmtVolume(volumeCu: number): string {
  if (!Number.isFinite(volumeCu)) return "—";
  const abs = Math.abs(volumeCu);
  if (abs >= 1000) {
    // Also show in thousands of m³ (a common stockpile reporting unit).
    return `${volumeCu.toFixed(2)} m³ (${(volumeCu / 1000).toFixed(3)} ×10³ m³)`;
  }
  return `${volumeCu.toFixed(3)} m³`;
}

/**
 * Parse a user-typed direction into decimal-degree azimuth.
 * Accepts: "123.456" (deg), "N45.5E", "N45°30'E", "S30W".
 * Returns null when unparseable.
 */
/**
 * Parse a distance<direction entry used while drawing lines (AutoCAD-style
 * "distance<angle" relative/azimuth input). The optional leading "@" is accepted
 * for muscle memory, but the value is always treated as an absolute direction
 * from the last picked point.
 */
export function parseDistanceBearing(
  input: string,
  mode: AngleEntryMode = "packed",
): { distance: number; azimuthDeg: number } | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/^@?(-?\d+(?:\.\d+)?)\s*<\s*(.+)$/);
  if (!m) return null;
  const distance = parseFloat(m[1]);
  const angleRaw = m[2].trim();
  // Letter-bearing or quadrant input (e.g. N45E) is parsed by parseBearing;
  // otherwise respect the configured angle-entry mode (decimal/packed/dms/gon).
  const az = /[A-Za-z]/.test(angleRaw)
    ? parseBearing(angleRaw)
    : angleEntryToDeg(mode, angleRaw);
  if (!Number.isFinite(distance) || distance <= 0 || az == null) return null;
  return { distance, azimuthDeg: normalizeAzimuth(az) };
}

export function parseBearing(input: string): number | null {
  const raw = input.trim().toUpperCase();
  if (!raw) return null;

  // Plain decimal azimuth.
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return normalizeAzimuth(parseFloat(raw));
  }

  // Quadrant: N <angle> E/W or S <angle> E/W
  const quad = raw.match(/^([NS])\s*([0-9°'".\s]+)\s*([EW])$/);
  if (quad) {
    const ns = quad[1];
    const ew = quad[3];
    const angle = parseAngleToDeg(quad[2]);
    if (angle == null) return null;
    if (ns === "N" && ew === "E") return normalizeAzimuth(angle);
    if (ns === "S" && ew === "E") return normalizeAzimuth(180 - angle);
    if (ns === "S" && ew === "W") return normalizeAzimuth(180 + angle);
    return normalizeAzimuth(360 - angle); // N..W
  }
  return null;
}

/** Parse "45", "45.5", "45°30'20\"" or "45°30.5'" into decimal degrees. */
function parseAngleToDeg(input: string): number | null {
  const s = input.trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*'\s*(?:([\d.]+)\s*")?)?/);
  if (!m) return null;
  const d = parseFloat(m[1]);
  const min = m[2] ? parseFloat(m[2]) : 0;
  const sec = m[3] ? parseFloat(m[3]) : 0;
  return dmsToDeg(d, min, sec);
}

/** Compose D, M, S components into decimal degrees (negative sign honoured). */
export function dmsToDeg(d: number, m: number, s: number): number {
  const sign = d < 0 || Object.is(d, -0) ? -1 : 1;
  return sign * (Math.abs(d) + Math.abs(m) / 60 + Math.abs(s) / 3600);
}

/**
 * Parse the packed "DD.MMSS" surveyor shorthand used on HP/Casio survey
 * calculators and throughout Southern-African (Zimbabwe / SA) practice, where
 * the digits AFTER the decimal point are minutes then seconds, NOT a fraction.
 *
 *   45.3020   → 45° 30' 20"
 *   123.0759  → 123° 07' 59"
 *   90.30     → 90° 30' 00"   (trailing seconds assumed 00)
 *
 * Returns decimal degrees, or null if the minutes/seconds are out of range.
 */
export function parsePackedDms(input: string): number | null {
  const s = input.trim();
  // Allow any number of fractional digits so fractional seconds (e.g.
  // 45.302055) are accepted; everything after the first four digits is the
  // decimal part of the seconds value.
  const m = s.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const deg = parseInt(m[2], 10);
  // Right-pad the fractional part to MMSS (4+ digits): MM then SS, remainder
  // is a fraction of a second.
  const frac = (m[3] ?? "").padEnd(4, "0");
  const min = parseInt(frac.slice(0, 2), 10);
  const secWhole = parseInt(frac.slice(2, 4), 10);
  const secFrac = frac.length > 4 ? parseFloat(`0.${frac.slice(4)}`) : 0;
  const sec = secWhole + secFrac;
  if (min >= 60 || sec >= 60) return null;
  return sign * (deg + min / 60 + sec / 3600);
}

/**
 * Angle entry modes a surveyor may use. Mirrors the conventions in commercial
 * field software (Leica Captivate, Trimble Access) which never ask the user to
 * type °'" symbols directly.
 *  - "dms":    separate Degrees / Minutes / Seconds fields.
 *  - "packed": DD.MMSS shorthand (the Zimbabwe / Southern-African default).
 *  - "decimal":decimal degrees.
 *  - "gon":    gradians (400 per circle).
 */
export type AngleEntryMode = "dms" | "packed" | "decimal" | "gon";

/** Convert a value typed in the given entry mode into decimal degrees. */
export function angleEntryToDeg(mode: AngleEntryMode, raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (mode === "decimal") {
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
  }
  if (mode === "gon") {
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return (parseFloat(s) / 400) * 360;
  }
  if (mode === "packed") {
    return parsePackedDms(s);
  }
  // dms: accept "45 30 20", "45,30,20", the symbol form "45°30'20\"" or a
  // single number (degrees).
  if (/[°'"]/.test(s)) return parseAngleToDeg(s);
  const parts = s.split(/[\s,]+/).filter(Boolean).map(Number);
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return null;
  const [d = 0, m = 0, sec = 0] = parts;
  if (m >= 60 || sec >= 60) return null;
  return dmsToDeg(d, m, sec);
}
