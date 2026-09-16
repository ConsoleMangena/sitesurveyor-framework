import { useState } from "react";
import {
  angleEntryToDeg,
  dmsToDeg,
  toDMS,
  type AngleEntryMode,
} from "../../components/cad/survey/format.ts";

interface AngleInputProps {
  label: string;
  /** Current value in DECIMAL DEGREES (the canonical internal unit), or null. */
  valueDeg: number | null;
  /** Called with the parsed decimal-degree value (or null when incomplete). */
  onChange: (deg: number | null) => void;
  /** Initial entry mode. Defaults to the Zimbabwe/SA packed DD.MMSS shorthand. */
  defaultMode?: AngleEntryMode;
}

const MODE_LABELS: Record<AngleEntryMode, string> = {
  dms: "D M S",
  packed: "DD.MMSS",
  decimal: "Decimal°",
  gon: "Gon",
};

/** Single-box text for a decimal-degree value in the given entry mode. */
function seedText(mode: AngleEntryMode, deg: number | null): string {
  if (deg == null || !Number.isFinite(deg)) return "";
  if (mode === "decimal") return deg.toFixed(6);
  if (mode === "gon") return ((deg / 360) * 400).toFixed(4);
  if (mode !== "packed") return "";
  // Packed DD.MMSS — reuse toDMS so 60-second carry rounding matches the rest
  // of the app (e.g. 45.999999° → "45.6000000", never an invalid "45.5960").
  const { d, m, s } = toDMS(deg);
  const sign = d < 0 ? "-" : "";
  // Seconds are zero-padded to SS.ss ("05.50" → "0550") so the packed string
  // always reads DD.MMSS… like the field-calculator convention.
  return `${sign}${Math.abs(d)}.${String(m).padStart(2, "0")}${s
    .toFixed(2)
    .padStart(5, "0")
    .replace(".", "")}`;
}

/** Discrete D/M/S strings for a decimal-degree value. */
function seedDms(deg: number | null): { d: string; m: string; s: string } {
  if (deg == null || !Number.isFinite(deg)) return { d: "", m: "", s: "" };
  const { d, m, s } = toDMS(deg);
  return { d: String(d), m: String(m), s: s.toFixed(2) };
}

/**
 * Angle entry that mirrors professional field software: surveyors never type
 * °'" symbols. They pick a mode and key the numbers. Three discrete
 * Deg/Min/Sec boxes for "dms", or a single box for packed DD.MMSS (the
 * Southern-African default), decimal degrees, or gon.
 *
 * The component is uncontrolled in its text but reports a canonical decimal
 * degree value upward via onChange.
 */
export function AngleInput({ label, valueDeg, onChange, defaultMode = "packed" }: AngleInputProps) {
  const [mode, setMode] = useState<AngleEntryMode>(defaultMode);
  // Free text for single-box modes — seeded from valueDeg so a pre-filled
  // sample value is visible instead of computed invisibly.
  const [text, setText] = useState(() => seedText(defaultMode, valueDeg));
  // Discrete components for DMS mode.
  const [d, setD] = useState(() => (defaultMode === "dms" ? seedDms(valueDeg).d : ""));
  const [m, setM] = useState(() => (defaultMode === "dms" ? seedDms(valueDeg).m : ""));
  const [s, setS] = useState(() => (defaultMode === "dms" ? seedDms(valueDeg).s : ""));

  const emitText = (next: string) => {
    setText(next);
    onChange(angleEntryToDeg(mode, next));
  };

  const emitDms = (nd: string, nm: string, ns: string) => {
    setD(nd);
    setM(nm);
    setS(ns);
    if (!nd && !nm && !ns) return onChange(null);
    const dn = Number(nd || 0);
    const mn = Number(nm || 0);
    const sn = Number(ns || 0);
    if (![dn, mn, sn].every(Number.isFinite) || mn >= 60 || sn >= 60) return onChange(null);
    onChange(dmsToDeg(dn, mn, sn));
  };

  const switchMode = (next: AngleEntryMode) => {
    setMode(next);
    // Re-seed the new mode's fields from the current canonical value so the
    // displayed angle is preserved across a mode switch.
    setText(seedText(next, valueDeg));
    const dms = seedDms(valueDeg);
    setD(dms.d); setM(dms.m); setS(dms.s);
  };

  return (
    <div className="form-group svt-angle-input">
      <label className="form-label">
        {label}
        <select
          className="svt-angle-mode"
          value={mode}
          onChange={(e) => switchMode(e.target.value as AngleEntryMode)}
          aria-label={`${label} entry mode`}
        >
          {(Object.keys(MODE_LABELS) as AngleEntryMode[]).map((k) => (
            <option key={k} value={k}>{MODE_LABELS[k]}</option>
          ))}
        </select>
      </label>

      {mode === "dms" ? (
        <div className="svt-dms-row">
          <input className="input-field" inputMode="numeric" placeholder="°" value={d} onChange={(e) => emitDms(e.target.value, m, s)} aria-label={`${label} degrees`} />
          <span className="svt-dms-sep">°</span>
          <input className="input-field" inputMode="numeric" placeholder="′" value={m} onChange={(e) => emitDms(d, e.target.value, s)} aria-label={`${label} minutes`} />
          <span className="svt-dms-sep">′</span>
          <input className="input-field" inputMode="decimal" placeholder="″" value={s} onChange={(e) => emitDms(d, m, e.target.value)} aria-label={`${label} seconds`} />
          <span className="svt-dms-sep">″</span>
        </div>
      ) : (
        <input
          className="input-field"
          inputMode="decimal"
          value={text}
          onChange={(e) => emitText(e.target.value)}
          placeholder={
            mode === "packed" ? "45.3020 → 45°30′20″" : mode === "gon" ? "gradians" : "decimal degrees"
          }
        />
      )}
    </div>
  );
}
