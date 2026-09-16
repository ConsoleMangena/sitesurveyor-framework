import { useMemo, useState } from "react";
import {
  polygonArea,
  polylineLength,
  volumeGrid,
  volumeTinToPlane,
  volumeEndArea,
  volumePrismoidal,
  type NE,
  type NEZ,
} from "../../components/cad/survey/cogo.ts";
import { buildTin } from "../../components/cad/survey/tin.ts";
import { fmtArea, fmtVolume } from "../../components/cad/survey/format.ts";
import { useAxisLabels } from "./useAxisConvention.ts";
import { ProjectPointPicker } from "./ProjectPointPicker.tsx";
import { addProjectOutput } from "./projectOutputs.ts";
import { downloadCsv } from "./calcUtils.ts";

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

type Mode = "area" | "polyline" | "tin" | "grid" | "cross-section";

interface AreaToolProps {
  projectId?: string;
}

export function AreaTool({ projectId }: AreaToolProps) {
  const ax = useAxisLabels();
  const [mode, setMode] = useState<Mode>("area");
  const MODES: { id: Mode; label: string; blurb: string }[] = [
    {
      id: "area",
      label: "Plan Area",
      blurb:
        `Boundary ${ax.first}, ${ax.second} in order. Area (Shoelace), perimeter and a plan preview update live.`,
    },
    {
      id: "polyline",
      label: "Polyline Length",
      blurb:
        `Open chain of ${ax.first}, ${ax.second} points (pipeline, fence line, centre line). Total length updates live.`,
    },
    {
      id: "tin",
      label: "Surface / Stockpile (TIN)",
      blurb:
        `Triangulate (${ax.first}, ${ax.second}, Z) points into a surface and integrate the volume above a base level. Cut is volume above the base; fill is below.`,
    },
    {
      id: "grid",
      label: "Grid Method",
      blurb:
        "Regular grid of spot heights (Z), row per line. Volume vs a base level per cell, separated into cut and fill.",
    },
    {
      id: "cross-section",
      label: "Cross-Sections (End-Area / Prismoidal)",
      blurb:
        "Enter cross-sectional areas at chainages. End-area is the trapezoidal method; prismoidal uses Simpson's 1/3 rule for equally spaced sections.",
    },
  ];
  const active = MODES.find((m) => m.id === mode)!;

  return (
    <div className="svt-shell">
      <div className="svt-header">
        <div>
          <h2>Area &amp; Volume</h2>
          <p>{active.blurb}</p>
        </div>
      </div>

      <div className="form-group" style={{ maxWidth: 520, padding: "0 2px 8px" }}>
        <label className="form-label">Computation method</label>
        <select
          className="input-field"
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
        >
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {mode === "area" && <PlanAreaPanel projectId={projectId} />}
      {mode === "polyline" && <PolylinePanel projectId={projectId} />}
      {mode === "tin" && <TinPanel />}
      {mode === "grid" && <GridPanel />}
      {mode === "cross-section" && <CrossSectionPanel />}
    </div>
  );
}

// ── Plan area (original behaviour, preserved) ───────────────────────────────

interface Pt {
  id: number;
  label: string;
  x: string;
  y: string;
  z: string;
}

let pid = 0;
const newPt = (label = "", x = "", y = "", z = ""): Pt => ({
  id: ++pid,
  label,
  x,
  y,
  z,
});

const AREA_SAMPLE: Pt[] = [
  newPt("1", "1000.00", "1000.00"),
  newPt("2", "1100.00", "1000.00"),
  newPt("3", "1100.00", "1080.00"),
  newPt("4", "1000.00", "1080.00"),
];

function PlanAreaPanel({ projectId }: { projectId?: string }) {
  const ax = useAxisLabels();
  const [pts, setPts] = useState<Pt[]>(AREA_SAMPLE);
  const [pickedPno, setPickedPno] = useState("");
  const update = (id: number, patch: Partial<Pt>) =>
    setPts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addPt = (label?: string, x?: string, y?: string) => setPts((ps) => [...ps, newPt(label ?? String(ps.length + 1), x, y)]);
  const delPt = (id: number) => setPts((ps) => ps.filter((p) => p.id !== id));

  const { coords, area, perimeter, error } = useMemo(() => {
    const c: NE[] = [];
    let err: string | null = null;
    for (const p of pts) {
      if (!p.x.trim() && !p.y.trim()) continue;
      const e = num(p.x),
        n = num(p.y);
      if (!Number.isFinite(e) || !Number.isFinite(n)) {
        err = `Invalid ${ax.first}/${ax.second} coordinate for "${p.label || "?"}".`;
        break;
      }
      c.push({ n, e });
    }
    if (!err && c.length < 3) err = "Need at least 3 points to form a polygon.";
    const ar = !err ? polygonArea(c) : 0;
    const per = !err ? polylineLength([...c, c[0]]) : 0;
    return { coords: c, area: ar, perimeter: per, error: err };
  }, [pts, ax.first, ax.second]);

  return (
    <>
      {error && <div className="svt-error">⚠ {error}</div>}
      <div className="svt-grid-layout">
        <div className="svt-card">
          <div className="svt-card-title">
            <span>Boundary coordinates</span>
            <span>{pts.length} points</span>
          </div>
          <div className="svt-table-wrap">
            <table className="svt-table">
              <thead>
                <tr>
                  <th>Point</th>
                  <th>{ax.first} (Easting)</th>
                  <th>{ax.second} (Northing)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input className="svt-cell-input text" value={p.label} onChange={(e) => update(p.id, { label: e.target.value })} placeholder="pt" />
                    </td>
                    <td>
                      <input className="svt-cell-input" value={p.x} onChange={(e) => update(p.id, { x: e.target.value })} />
                    </td>
                    <td>
                      <input className="svt-cell-input" value={p.y} onChange={(e) => update(p.id, { y: e.target.value })} />
                    </td>
                    <td>
                      <button className="svt-row-del" onClick={() => delPt(p.id)} aria-label="Delete point">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {projectId && (
            <div style={{ padding: "0 14px 12px" }}>
              <ProjectPointPicker
                projectId={projectId}
                value={pickedPno}
                onChange={(pno, pt) => {
                  setPickedPno(pno);
                  if (pt) { addPt(pno || `P${pts.length + 1}`, String(pt.e), String(pt.n)); setPickedPno(""); }
                }}
                label="Add point from project"
              />
            </div>
          )}
          <div className="svt-grid-actions">
            <button className="btn btn-outline btn-sm" onClick={() => addPt()}>+ Add point</button>
            <button className="btn btn-outline btn-sm" onClick={() => setPts(AREA_SAMPLE)}>Reset sample</button>
            <button className="btn btn-outline btn-sm" onClick={() => setPts([newPt("1")])}>Clear</button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="svt-card">
            <div className="svt-card-title">Results</div>
            {!error ? (
              <>
                <div className="svt-summary">
                  <div className="svt-summary-row"><span className="svt-summary-label">Area</span><span className="svt-summary-val">{fmtArea(area)}</span></div>
                  <div className="svt-summary-row"><span className="svt-summary-label">Perimeter (m)</span><span className="svt-summary-val">{perimeter.toFixed(3)}</span></div>
                  <div className="svt-summary-row"><span className="svt-summary-label">Vertices</span><span className="svt-summary-val">{coords.length}</span></div>
                </div>
                <div className="svt-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                    const header = "Point,Easting,Northing,Z,Area(m2),Area(ha),Perimeter(m)";
                    const rows = pts.filter((p) => Number.isFinite(num(p.x)) && Number.isFinite(num(p.y))).map((p) => [p.label, p.x, p.y, p.z].join(","));
                    const summary = `Summary,,,,${area.toFixed(3)},${(area / 10000).toFixed(4)},${perimeter.toFixed(3)}`;
                    const content = [header, ...rows, summary].join("\n");
                    downloadCsv("area-report.csv", content);
                    if (projectId) {
                      addProjectOutput(projectId, {
                        label: "Area & Perimeter Report",
                        description: `${coords.length} vertices`,
                        fileName: `area-report-${projectId}.csv`,
                        mimeType: "text/csv",
                        content,
                      });
                    }
                  }}>
                    Export area report CSV
                  </button>
                </div>
              </>
            ) : (
              <p style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>Enter at least 3 points.</p>
            )}
          </div>
          <div className="svt-card">
            <div className="svt-card-title">Plan preview</div>
            {coords.length >= 3 ? <Poly pts={coords} /> : <p style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>No polygon.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Surface / stockpile (TIN) ───────────────────────────────────────────────

const TIN_SAMPLE: Pt[] = [
  newPt("1", "0", "0", "0"),
  newPt("2", "10", "0", "0"),
  newPt("3", "10", "10", "0"),
  newPt("4", "0", "10", "0"),
  newPt("5", "5", "5", "3"),
];

function TinPanel() {
  const ax = useAxisLabels();
  const [pts, setPts] = useState<Pt[]>(TIN_SAMPLE);
  const [base, setBase] = useState("0");
  const update = (id: number, patch: Partial<Pt>) =>
    setPts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addPt = () => setPts((ps) => [...ps, newPt(String(ps.length + 1))]);
  const delPt = (id: number) => setPts((ps) => ps.filter((p) => p.id !== id));

  const { result, error } = useMemo(() => {
    const c: NEZ[] = [];
    let err: string | null = null;
    for (const p of pts) {
      if (!p.x.trim() && !p.y.trim() && !p.z.trim()) continue;
      const e = num(p.x),
        n = num(p.y),
        z = num(p.z);
      if (![e, n, z].every(Number.isFinite)) {
        err = `Invalid ${ax.first}, ${ax.second} or Z for "${p.label || "?"}".`;
        break;
      }
      c.push({ n, e, z });
    }
    if (!err && c.length < 3) err = `Need at least 3 (${ax.first}, ${ax.second}, Z) points to triangulate a surface.`;
    const baseLevel = num(base);
    if (!err && !Number.isFinite(baseLevel)) err = "Enter a valid base level.";
    if (err) return { result: null, error: err };
    const tin = buildTin(c);
    if (tin.triangles.length === 0) {
      return { result: null, error: "Points are collinear — cannot triangulate." };
    }
    return { result: volumeTinToPlane(tin.points, tin.triangles, baseLevel), error: null };
  }, [pts, base, ax.first, ax.second]);

  return (
    <>
      {error && <div className="svt-error">⚠ {error}</div>}
      <div className="svt-grid-layout">
        <div className="svt-card">
          <div className="svt-card-title">
            <span>Surface points ({ax.first}, {ax.second}, Z)</span>
            <span>{pts.length} points</span>
          </div>
          <div className="svt-table-wrap">
            <table className="svt-table">
              <thead>
                <tr>
                  <th>Point</th>
                  <th>{ax.first} (E)</th>
                  <th>{ax.second} (N)</th>
                  <th>Z (RL)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pts.map((p) => (
                  <tr key={p.id}>
                    <td><input className="svt-cell-input text" value={p.label} onChange={(e) => update(p.id, { label: e.target.value })} placeholder="pt" /></td>
                    <td><input className="svt-cell-input" value={p.x} onChange={(e) => update(p.id, { x: e.target.value })} /></td>
                    <td><input className="svt-cell-input" value={p.y} onChange={(e) => update(p.id, { y: e.target.value })} /></td>
                    <td><input className="svt-cell-input" value={p.z} onChange={(e) => update(p.id, { z: e.target.value })} /></td>
                    <td><button className="svt-row-del" onClick={() => delPt(p.id)} aria-label="Delete point">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-group" style={{ padding: "12px 0 0", maxWidth: 220 }}>
            <label className="form-label">Base / reference level (Z)</label>
            <input className="input-field" value={base} onChange={(e) => setBase(e.target.value)} />
          </div>
          <div className="svt-grid-actions">
            <button className="btn btn-outline btn-sm" onClick={addPt}>+ Add point</button>
            <button className="btn btn-outline btn-sm" onClick={() => setPts(TIN_SAMPLE)}>Reset sample</button>
            <button className="btn btn-outline btn-sm" onClick={() => setPts([newPt("1")])}>Clear</button>
          </div>
        </div>

        <div className="svt-card">
          <div className="svt-card-title">Results</div>
          {result ? (
            <div className="svt-summary">
              <div className="svt-summary-row"><span className="svt-summary-label">Cut (above base)</span><span className="svt-summary-val">{fmtVolume(result.cut)}</span></div>
              <div className="svt-summary-row"><span className="svt-summary-label">Fill (below base)</span><span className="svt-summary-val">{fmtVolume(result.fill)}</span></div>
              <div className="svt-summary-row"><span className="svt-summary-label">Net volume</span><span className="svt-summary-val">{fmtVolume(result.net)}</span></div>
              <div className="svt-summary-row"><span className="svt-summary-label">Surface plan area</span><span className="svt-summary-val">{fmtArea(result.planArea)}</span></div>
              <div className="svt-summary-row"><span className="svt-summary-label">Triangles (TIN)</span><span className="svt-summary-val">{result.triangles}</span></div>
            </div>
          ) : (
            <p style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>Enter at least 3 ({ax.first}, {ax.second}, Z) points and a base level.</p>
          )}
        </div>
      </div>
    </>
  );
}

// ── Grid method ─────────────────────────────────────────────────────────────

function GridPanel() {
  const ax = useAxisLabels();
  const [text, setText] = useState("1.0 1.2 1.4\n1.1 1.3 1.5\n1.2 1.4 1.6");
  const [cx, setCx] = useState("10");
  const [cy, setCy] = useState("10");
  const [base, setBase] = useState("0");

  const { result, error } = useMemo(() => {
    const grid: number[][] = [];
    let err: string | null = null;
    let width = -1;
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const vals = t.split(/[,\s]+/).map(num);
      if (vals.some((v) => !Number.isFinite(v))) {
        err = `Invalid grid row: "${t}".`;
        break;
      }
      if (width === -1) width = vals.length;
      else if (vals.length !== width) {
        err = "All grid rows must have the same number of heights.";
        break;
      }
      grid.push(vals);
    }
    if (!err && (grid.length < 2 || width < 2)) err = "Need at least a 2×2 grid of heights.";
    const sx = num(cx),
      sy = num(cy),
      baseLevel = num(base);
    if (!err && ![sx, sy, baseLevel].every(Number.isFinite)) err = "Enter valid cell sizes and base level.";
    return { result: err ? null : volumeGrid(grid, sx, sy, baseLevel), error: err };
  }, [text, cx, cy, base]);

  return (
    <>
      {error && <div className="svt-error">⚠ {error}</div>}
      <div className="svt-grid-layout">
        <div className="svt-card">
          <div className="svt-card-title">Grid of spot heights (Z)</div>
          <div style={{ padding: 14, display: "grid", gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Heights — one grid row per line, space/comma separated</label>
              <textarea
                className="input-field"
                style={{ minHeight: 130, fontFamily: "monospace" }}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Cell {ax.first} (m)</label>
                <input className="input-field" value={cx} onChange={(e) => setCx(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Cell {ax.second} (m)</label>
                <input className="input-field" value={cy} onChange={(e) => setCy(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Base level</label>
                <input className="input-field" value={base} onChange={(e) => setBase(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="svt-card">
          <div className="svt-card-title">Results</div>
          {result ? (
            <div className="svt-summary">
              <div className="svt-summary-row"><span className="svt-summary-label">Cut (above base)</span><span className="svt-summary-val">{fmtVolume(result.cut)}</span></div>
              <div className="svt-summary-row"><span className="svt-summary-label">Fill (below base)</span><span className="svt-summary-val">{fmtVolume(result.fill)}</span></div>
              <div className="svt-summary-row"><span className="svt-summary-label">Net volume</span><span className="svt-summary-val">{fmtVolume(result.net)}</span></div>
              <div className="svt-summary-row"><span className="svt-summary-label">Cells evaluated</span><span className="svt-summary-val">{result.cells}</span></div>
            </div>
          ) : (
            <p style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>Enter at least a 2×2 grid.</p>
          )}
        </div>
      </div>
    </>
  );
}

// ── Cross-section volumes ───────────────────────────────────────────────────

interface SectionRow {
  id: number;
  chainage: string;
  area: string;
}

let sid = 0;
const newSection = (chainage = "", area = ""): SectionRow => ({ id: ++sid, chainage, area });

const SECTION_SAMPLE: SectionRow[] = [
  newSection("0", "50"),
  newSection("50", "75"),
  newSection("100", "100"),
];

type SectionMethod = "end-area" | "prismoidal";

function CrossSectionPanel() {
  const [rows, setRows] = useState<SectionRow[]>(SECTION_SAMPLE);
  const [method, setMethod] = useState<SectionMethod>("end-area");
  const update = (id: number, patch: Partial<SectionRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, newSection()]);
  const delRow = (id: number) => setRows((rs) => rs.filter((r) => r.id !== id));

  const { result, error } = useMemo(() => {
    const sections: { chainage: number; area: number }[] = [];
    let err: string | null = null;
    for (const r of rows) {
      if (!r.chainage.trim() && !r.area.trim()) continue;
      const ch = num(r.chainage);
      const ar = num(r.area);
      if (!Number.isFinite(ch) || !Number.isFinite(ar)) { err = `Invalid row (chainage "${r.chainage}", area "${r.area}").`; break; }
      sections.push({ chainage: ch, area: ar });
    }
    if (!err && sections.length < 2) err = "Enter at least two sections.";
    let vol: number | null = null;
    if (!err) {
      vol = method === "end-area" ? volumeEndArea(sections) : volumePrismoidal(sections);
      if (vol == null) err = "Prismoidal method needs an odd number of equally-spaced sections.";
    }
    return { result: vol != null ? fmtVolume(vol) : null, error: err };
  }, [rows, method]);

  return (
    <>
      {error && <div className="svt-error">⚠ {error}</div>}
      <div className="svt-grid-layout">
        <div className="svt-card">
          <div className="svt-card-title"><span>Cross-sections</span><span>{rows.length} rows</span></div>
          <div className="svt-table-wrap">
            <table className="svt-table">
              <thead><tr><th>Chainage (m)</th><th>Area (m²)</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><input className="svt-cell-input" value={r.chainage} onChange={(e) => update(r.id, { chainage: e.target.value })} /></td>
                    <td><input className="svt-cell-input" value={r.area} onChange={(e) => update(r.id, { area: e.target.value })} /></td>
                    <td><button className="svt-row-del" onClick={() => delRow(r.id)} aria-label="Delete row">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-group" style={{ padding: "12px 0 0", maxWidth: 240 }}>
            <label className="form-label">Method</label>
            <select className="input-field" value={method} onChange={(e) => setMethod(e.target.value as SectionMethod)}>
              <option value="end-area">End-area (trapezoidal)</option>
              <option value="prismoidal">Prismoidal (Simpson)</option>
            </select>
          </div>
          <div className="svt-grid-actions">
            <button className="btn btn-outline btn-sm" onClick={addRow}>+ Add section</button>
            <button className="btn btn-outline btn-sm" onClick={() => setRows(SECTION_SAMPLE)}>Reset sample</button>
            <button className="btn btn-outline btn-sm" onClick={() => setRows([newSection(), newSection()])}>Clear</button>
          </div>
        </div>
        <div className="svt-card">
          <div className="svt-card-title">Result</div>
          {result ? (
            <div className="svt-summary">
              <div className="svt-summary-row"><span className="svt-summary-label">Volume</span><span className="svt-summary-val">{result}</span></div>
              <div className="svt-summary-row"><span className="svt-summary-label">Method</span><span className="svt-summary-val">{method === "end-area" ? "End-area" : "Prismoidal"}</span></div>
            </div>
          ) : (
            <p style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>Enter at least two chainage/area pairs.</p>
          )}
        </div>
      </div>
    </>
  );
}

// ── Open polyline length (original chain behaviour) ─────────────────────────

const POLYLINE_SAMPLE: Pt[] = [
  newPt("1", "1000.00", "1000.00"),
  newPt("2", "1050.00", "1010.00"),
  newPt("3", "1100.00", "1000.00"),
];

function PolylinePanel({ projectId }: { projectId?: string }) {
  const ax = useAxisLabels();
  const [pts, setPts] = useState<Pt[]>(POLYLINE_SAMPLE);
  const [pickedPno, setPickedPno] = useState("");
  const update = (id: number, patch: Partial<Pt>) =>
    setPts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addPt = (label?: string, x?: string, y?: string) => setPts((ps) => [...ps, newPt(label ?? String(ps.length + 1), x, y)]);
  const delPt = (id: number) => setPts((ps) => ps.filter((p) => p.id !== id));

  const { coords, length, error } = useMemo(() => {
    const c: NE[] = [];
    let err: string | null = null;
    for (const p of pts) {
      if (!p.x.trim() && !p.y.trim()) continue;
      const e = num(p.x),
        n = num(p.y);
      if (!Number.isFinite(e) || !Number.isFinite(n)) {
        err = `Invalid ${ax.first}/${ax.second} coordinate for "${p.label || "?"}".`;
        break;
      }
      c.push({ n, e });
    }
    if (!err && c.length < 2) err = "Need at least 2 points to form a polyline.";
    return { coords: c, length: !err ? polylineLength(c) : 0, error: err };
  }, [pts, ax.first, ax.second]);

  return (
    <>
      {error && <div className="svt-error">⚠ {error}</div>}
      <div className="svt-grid-layout">
        <div className="svt-card">
          <div className="svt-card-title">
            <span>Chain coordinates (open)</span>
            <span>{pts.length} points</span>
          </div>
          <div className="svt-table-wrap">
            <table className="svt-table">
              <thead>
                <tr>
                  <th>Point</th>
                  <th>{ax.first} (Easting)</th>
                  <th>{ax.second} (Northing)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input className="svt-cell-input text" value={p.label} onChange={(e) => update(p.id, { label: e.target.value })} placeholder="pt" />
                    </td>
                    <td>
                      <input className="svt-cell-input" value={p.x} onChange={(e) => update(p.id, { x: e.target.value })} />
                    </td>
                    <td>
                      <input className="svt-cell-input" value={p.y} onChange={(e) => update(p.id, { y: e.target.value })} />
                    </td>
                    <td>
                      <button className="svt-row-del" onClick={() => delPt(p.id)} aria-label="Delete point">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {projectId && (
            <div style={{ padding: "0 14px 12px" }}>
              <ProjectPointPicker
                projectId={projectId}
                value={pickedPno}
                onChange={(pno, pt) => {
                  setPickedPno(pno);
                  if (pt) { addPt(pno || `P${pts.length + 1}`, String(pt.e), String(pt.n)); setPickedPno(""); }
                }}
                label="Add point from project"
              />
            </div>
          )}
          <div className="svt-grid-actions">
            <button className="btn btn-outline btn-sm" onClick={() => addPt()}>+ Add point</button>
            <button className="btn btn-outline btn-sm" onClick={() => setPts(POLYLINE_SAMPLE)}>Reset sample</button>
            <button className="btn btn-outline btn-sm" onClick={() => setPts([newPt("1")])}>Clear</button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="svt-card">
            <div className="svt-card-title">Results</div>
            {!error ? (
              <>
                <div className="svt-summary">
                  <div className="svt-summary-row"><span className="svt-summary-label">Total length</span><span className="svt-summary-val">{length.toFixed(3)} m</span></div>
                  <div className="svt-summary-row"><span className="svt-summary-label">Segments</span><span className="svt-summary-val">{Math.max(0, coords.length - 1)}</span></div>
                </div>
                <div className="svt-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                    const header = "Point,Easting,Northing,Length(m)";
                    const rows = pts.filter((p) => Number.isFinite(num(p.x)) && Number.isFinite(num(p.y))).map((p) => [p.label, p.x, p.y].join(","));
                    const summary = `Total,,,${length.toFixed(3)}`;
                    const content = [header, ...rows, summary].join("\n");
                    downloadCsv("polyline-length.csv", content);
                    if (projectId) {
                      addProjectOutput(projectId, {
                        label: "Polyline Length Report",
                        description: `${coords.length} vertices`,
                        fileName: `polyline-${projectId}.csv`,
                        mimeType: "text/csv",
                        content,
                      });
                    }
                  }}>
                    Export length report CSV
                  </button>
                </div>
              </>
            ) : (
              <p style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>Enter at least 2 points.</p>
            )}
          </div>
          <div className="svt-card">
            <div className="svt-card-title">Chain preview</div>
            {coords.length >= 2 ? <Poly pts={coords} closed={false} /> : <p style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>No chain.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Shared plan preview ─────────────────────────────────────────────────────

function Poly({ pts, closed = true }: { pts: NE[]; closed?: boolean }) {
  const W = 320,
    H = 240,
    pad = 20;
  const ring = closed ? [...pts, pts[0]] : pts;
  const es = ring.map((p) => p.e),
    ns = ring.map((p) => p.n);
  const minE = Math.min(...es),
    maxE = Math.max(...es),
    minN = Math.min(...ns),
    maxN = Math.max(...ns);
  const spanE = maxE - minE || 1,
    spanN = maxN - minN || 1;
  const innerW = W - pad * 2,
    innerH = H - pad * 2;
  const x = (e: number) => pad + ((e - minE) / spanE) * innerW;
  const y = (n: number) => pad + (1 - (n - minN) / spanN) * innerH;
  const path =
    ring.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.e).toFixed(1)} ${y(p.n).toFixed(1)}`).join(" ") + (closed ? " Z" : "");
  return (
    <svg className="svt-plot" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Boundary plan">
      <path
        d={path}
        fill={closed ? "color-mix(in oklab, var(--accent) 14%, transparent)" : "none"}
        stroke="var(--accent)"
        strokeWidth="2"
      />
      {pts.map((p, i) => (
        <circle key={i} cx={x(p.e)} cy={y(p.n)} r="3" fill="var(--accent)" />
      ))}
    </svg>
  );
}
