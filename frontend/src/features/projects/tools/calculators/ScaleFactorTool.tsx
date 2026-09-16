import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import {
  EARTH_MEAN_RADIUS,
  combinedScaleFactor,
  gridToGround,
  groundToGrid,
  heightScaleFactor,
} from "../../components/cad/survey/cogo.ts";
import { copyToClipboard } from "./calcUtils.ts";

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

interface ScaleFactorToolProps {
  projectId?: string;
}

/**
 * Combined scale factor (ground ↔ grid reduction) — the library function is
 * fully unit-tested in cogo.ts; this tool exposes it in the UI.
 * Accepts (and ignores) projectId so CalculatorHost can render it uniformly.
 */
export function ScaleFactorTool(_: ScaleFactorToolProps = {}) {
  const [k0, setK0] = useState("1.0000000");
  const [elevation, setElevation] = useState("1500");
  const [radius, setRadius] = useState(String(EARTH_MEAN_RADIUS));
  const [direction, setDirection] = useState<"ground-to-grid" | "grid-to-ground">("ground-to-grid");
  const [distInput, setDistInput] = useState("100.0000");
  const [copied, setCopied] = useState(false);

  const { error, heightSF, combinedSF, ppm, converted } = useMemo(() => {
    const k = num(k0);
    const h = num(elevation);
    const r = num(radius);
    let error: string | null = null;

    if (!Number.isFinite(k) || k <= 0) error ??= "Enter a valid (positive) point scale factor.";
    if (!Number.isFinite(h)) error ??= "Enter a valid site elevation in metres.";
    if (!Number.isFinite(r) || r <= 0) error ??= "Enter a valid Earth radius in metres.";

    if (error) return { error, heightSF: null, combinedSF: null, ppm: null, converted: null };

    const heightSF = heightScaleFactor(h, r);
    const combinedSF = combinedScaleFactor(k, h, r);
    const ppm = (combinedSF - 1) * 1e6;

    let converted: number | null = null;
    const d = num(distInput);
    if (distInput.trim() !== "") {
      if (!Number.isFinite(d) || d < 0) {
        return { error: "Enter a valid (non-negative) distance to convert.", heightSF, combinedSF, ppm, converted: null };
      }
      converted =
        direction === "ground-to-grid"
          ? groundToGrid(d, combinedSF)
          : gridToGround(d, combinedSF);
    }

    return { error: null, heightSF, combinedSF, ppm, converted };
  }, [k0, elevation, radius, distInput, direction]);

  const resultText = error
    ? `⚠ ${error}`
    : [
        `Height scale factor:   ${heightSF!.toFixed(9)}`,
        `Point scale factor:    ${num(k0).toFixed(7)}`,
        `Combined scale factor: ${combinedSF!.toFixed(9)}`,
        `Combined correction:   ${ppm! >= 0 ? "+" : ""}${ppm!.toFixed(1)} ppm`,
        converted != null
          ? `\n${direction === "ground-to-grid" ? "Ground" : "Grid"} distance: ${num(distInput).toFixed(4)} m\n` +
            `${direction === "ground-to-grid" ? "Grid" : "Ground"} distance: ${converted.toFixed(4)} m  (Δ ${(converted - num(distInput)).toFixed(4)} m)`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

  return (
    <div className="svt-shell">
      <div className="svt-header">
        <div>
          <h2>Combined Scale Factor (Ground ↔ Grid)</h2>
          <p>
            Reduce ground measurements to grid distances, and expand grid
            (plan/CAD) distances back to ground for setting-out.
          </p>
        </div>
      </div>

      <div className="svt-grid-layout">
        <div className="svt-card">
          <div className="svt-card-title">Inputs</div>
          <div className="form-group">
            <label className="form-label" htmlFor="csf-k0">Point (grid) scale factor k₀</label>
            <input id="csf-k0" className="input-field" inputMode="decimal" value={k0} onChange={(e) => setK0(e.target.value)} placeholder="1.0000000" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="csf-elevation">Site elevation H (m)</label>
            <input id="csf-elevation" className="input-field" inputMode="decimal" value={elevation} onChange={(e) => setElevation(e.target.value)} placeholder="1500" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="csf-radius">Earth mean radius (m)</label>
            <input id="csf-radius" className="input-field" inputMode="decimal" value={radius} onChange={(e) => setRadius(e.target.value)} />
          </div>
          <div className="svt-pair">
            <div className="form-group">
              <label className="form-label" htmlFor="csf-direction">Convert</label>
              <select id="csf-direction" className="input-field" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
                <option value="ground-to-grid">Ground → Grid</option>
                <option value="grid-to-ground">Grid → Ground</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="csf-dist">Distance (m)</label>
              <input id="csf-dist" className="input-field" inputMode="decimal" value={distInput} onChange={(e) => setDistInput(e.target.value)} placeholder="100.0000" />
            </div>
          </div>
        </div>

        <div className="svt-card">
          <div className="svt-card-title">Result</div>
          <pre className="svt-result">{resultText}</pre>
          {!error && (
            <div className="svt-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  void copyToClipboard(resultText).then((ok) => setCopied(ok));
                  setTimeout(() => setCopied(false), 1500);
                }}
                title="Copy result"
              >
                <Copy size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
