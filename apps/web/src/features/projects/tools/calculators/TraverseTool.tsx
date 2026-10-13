import { useCallback, useMemo, useState } from "react";
import {
  computeTraverse,
  forward,
  normalizeAzimuth,
  reduceAngularTraverse,
  type AngularTraverseResult,
  type TraverseAngleMode,
  type TraverseLeg,
  type TraverseType,
} from "../../components/cad/survey/cogo.ts";
import { fmtBearing, parseBearing } from "../../components/cad/survey/format.ts";
import { useAxisLabels } from "./useAxisConvention.ts";
import { AngleInput } from "./AngleInput.tsx";
import { ProjectPointPicker } from "./ProjectPointPicker.tsx";
import { useProjectPoints } from "./projectPoints.ts";
import { addProjectOutput } from "./projectOutputs.ts";
import { downloadCsv, useToast } from "./calcUtils.ts";

interface Leg { id: number; bearing: string; distance: string }
interface AngleLeg { id: number; angleDeg: number | null; distance: string }

const TRAVERSE_TYPES: { id: TraverseType; label: string; blurb: string }[] = [
  {
    id: "closed-loop",
    label: "Closed loop (polygon)",
    blurb: "Begins and ends on the same known point. Misclosure is start − computed end.",
  },
  {
    id: "closed-link",
    label: "Closed link (connecting)",
    blurb: "Begins on one known point and ends on a different known point. Enter the known closing coordinates.",
  },
  {
    id: "open",
    label: "Open",
    blurb: "Begins on a known point and ends on an unknown point. No closure check or adjustment.",
  },
];

let lid = 0;
const newLeg = (bearing = "", distance = ""): Leg => ({ id: ++lid, bearing, distance });
const newAngleLeg = (angleDeg: number | null = null, distance = ""): AngleLeg => ({ id: ++lid, angleDeg, distance });

const SAMPLE: Leg[] = [
  newLeg("90", "100.00"),
  newLeg("0", "100.00"),
  newLeg("270", "100.00"),
  newLeg("180", "99.00"),
];

// 100 m square observed with ~90° interior angles (plus a deliberate small
// misclosure on the last distance so the balancing rows stay interesting).
const ANGLE_SAMPLE: AngleLeg[] = [
  newAngleLeg(90, "100.00"),
  newAngleLeg(90, "100.00"),
  newAngleLeg(90, "100.00"),
  newAngleLeg(90.0008, "99.00"),
];

const ANGLE_MODES: { id: TraverseAngleMode; label: string }[] = [
  { id: "interior", label: "Interior angles" },
  { id: "deflection", label: "Deflection (+R / −L)" },
  { id: "angle-right", label: "Angles to the right" },
];

const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };

interface TraverseToolProps {
  projectId?: string;
}

export function TraverseTool({ projectId }: TraverseToolProps) {
  const ax = useAxisLabels();
  const { add } = useProjectPoints(projectId);
  const { message: toastMessage, show: showToast } = useToast();
  const [type, setType] = useState<TraverseType>("closed-loop");
  const [entryMode, setEntryMode] = useState<"bearings" | "angles">("bearings");
  const [angleMode, setAngleMode] = useState<TraverseAngleMode>("interior");
  const [startAzDeg, setStartAzDeg] = useState<number | null>(90);
  const [x0, setX0] = useState("1000.000");
  const [y0, setY0] = useState("1000.000");
  const [cx, setCx] = useState("1000.000");
  const [cy, setCy] = useState("1000.000");
  const [startPointNo, setStartPointNo] = useState("");
  const [closePointNo, setClosePointNo] = useState("");
  const [legsState, setLegsState] = useState<Leg[]>(SAMPLE);
  const [angleLegs, setAngleLegs] = useState<AngleLeg[]>(ANGLE_SAMPLE);

  const activeType = TRAVERSE_TYPES.find((t) => t.id === type)!;

  const update = (id: number, patch: Partial<Leg>) =>
    setLegsState((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLeg = () => setLegsState((ls) => [...ls, newLeg()]);
  const delLeg = (id: number) => setLegsState((ls) => ls.filter((l) => l.id !== id));

  const updateAngle = (id: number, patch: Partial<AngleLeg>) =>
    setAngleLegs((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addAngleLeg = () => setAngleLegs((ls) => [...ls, newAngleLeg()]);
  const delAngleLeg = (id: number) => setAngleLegs((ls) => ls.filter((l) => l.id !== id));

  const applyStartPoint = useCallback(
    (pointNo: string, point?: { e: number; n: number; z?: number | null }) => {
      setStartPointNo(pointNo);
      if (point) {
        setX0(point.e.toFixed(3));
        setY0(point.n.toFixed(3));
      }
    },
    [],
  );

  const applyClosePoint = useCallback(
    (pointNo: string, point?: { e: number; n: number; z?: number | null }) => {
      setClosePointNo(pointNo);
      if (point) {
        setCx(point.e.toFixed(3));
        setCy(point.n.toFixed(3));
      }
    },
    [],
  );

  const { result, angular, error } = useMemo(() => {
    const sx = num(x0), sy = num(y0);
    let err: string | null = null;
    let res: ReturnType<typeof computeTraverse> | null = null;
    let ang: AngularTraverseResult | null = null;
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
      err = `Enter a valid start ${ax.first}, ${ax.second}.`;
    } else {
      const legs: TraverseLeg[] = [];
      if (entryMode === "bearings") {
        for (const l of legsState) {
          if (!l.bearing.trim() && !l.distance.trim()) continue;
          const az = parseBearing(l.bearing);
          const d = num(l.distance);
          if (az == null || !Number.isFinite(d)) { err = `Invalid leg (bearing "${l.bearing}", distance "${l.distance}").`; break; }
          if (d <= 0) { err = `Leg distances must be positive (leg ${legs.length + 1}: "${l.distance}").`; break; }
          legs.push({ azimuth: az, distance: d });
        }
      } else {
        if (startAzDeg == null || !Number.isFinite(startAzDeg)) {
          err = "Enter a valid starting azimuth for the angular traverse.";
        }
        if (!err) {
          const observations: { angle: number; distance: number }[] = [];
          let legNo = 0;
          for (const l of angleLegs) {
            if (l.angleDeg == null && !l.distance.trim()) continue;
            legNo += 1;
            const d = num(l.distance);
            if (l.angleDeg == null || !Number.isFinite(l.angleDeg)) { err = `Enter a valid angle at station ${legNo}.`; break; }
            if (!Number.isFinite(d) || d <= 0) { err = `Leg distances must be positive (station ${legNo}: "${l.distance}").`; break; }
            observations.push({ angle: l.angleDeg, distance: d });
          }
          if (!err && observations.length >= 1) {
            // The angular condition only balances on a closed polygon; link
            // and open traverses roll azimuths through without balancing.
            ang = reduceAngularTraverse(
              startAzDeg!,
              observations,
              angleMode,
              type === "closed-loop",
            );
            for (const leg of ang.legs) legs.push(leg);
          }
        }
      }
      const minLegs = type === "closed-loop" ? 3 : 1;
      if (!err && legs.length < minLegs) {
        err =
          type === "closed-loop"
            ? "A closed-loop traverse needs at least 3 legs."
            : "Enter at least one valid leg.";
      }
      let closingPoint: { n: number; e: number } | undefined;
      if (!err && type === "closed-link") {
        const ex = num(cx), ey = num(cy);
        if (!Number.isFinite(ex) || !Number.isFinite(ey)) {
          err = `Enter a valid known closing ${ax.first}, ${ax.second} for a link traverse.`;
        } else {
          closingPoint = { n: ey, e: ex };
        }
      }
      try {
        if (!err) res = computeTraverse({ n: sy, e: sx }, legs, { type, closingPoint });
      } catch (e) {
        err = e instanceof Error ? e.message : "Traverse computation failed.";
      }
    }
    return { result: res, angular: ang, error: err };
  }, [type, x0, y0, cx, cy, legsState, entryMode, angleMode, startAzDeg, angleLegs, ax.first, ax.second]);

  const handleExportCsv = useCallback(() => {
    if (!result) return;
    const rows = result.computed.map((raw, i) => {
      const adj = result.adjusted[i];
      return {
        Station: i,
        Easting_raw: raw.e.toFixed(4),
        Northing_raw: raw.n.toFixed(4),
        Easting_adj: adj?.e.toFixed(4) ?? "",
        Northing_adj: adj?.n.toFixed(4) ?? "",
      };
    });
    const header = Object.keys(rows[0]).join(",");
    const csv = [header, ...rows.map((r) => Object.values(r).join(","))].join("\n");
    downloadCsv("traverse_points.csv", csv);
    if (projectId) {
      addProjectOutput(projectId, {
        label: "Traverse Adjustment",
        description: `${result.computed.length} station${result.computed.length === 1 ? "" : "s"}`,
        fileName: `traverse-${projectId}.csv`,
        mimeType: "text/csv",
        content: csv,
      });
    }
  }, [result, projectId]);

  const handleSavePoints = useCallback(() => {
    if (!projectId || !result || !add) return;
    const saved: string[] = [];
    result.adjusted.forEach((pt) => {
      const p = add({ e: pt.e, n: pt.n, code: "TRV" });
      if (p) saved.push(p.pointNo);
    });
    if (saved.length > 0) {
      showToast(`Saved ${saved.length} adjusted point(s): ${saved.join(", ")}`);
    }
  }, [projectId, result, add, showToast]);

  const renderLegRow = (
    key: number,
    i: number,
    az: number | null,
    dText: string,
    onDistance: (v: string) => void,
    onDelete: () => void,
    control: React.ReactNode,
  ) => {
    const raw = result?.computed[i + 1];
    const adj = result?.adjusted[i + 1];
    const d = num(dText);
    const prev = result?.computed[i];
    let dx = NaN, dy = NaN;
    if (az != null && Number.isFinite(d) && prev) {
      const p = forward(prev, az, d);
      dx = p.e - prev.e; dy = p.n - prev.n;
    }
    const f = (v: number | undefined | null) => (v == null || !Number.isFinite(v) ? "" : v.toFixed(3));
    return (
      <tr key={key}>
        <td>{i + 1}</td>
        <td>{control}</td>
        <td><input className="svt-cell-input" value={dText} onChange={(e) => onDistance(e.target.value)} /></td>
        <td className="svt-cell-derived">{f(dx)}</td>
        <td className="svt-cell-derived">{f(dy)}</td>
        <td className="svt-cell-derived">{f(raw?.e)}</td>
        <td className="svt-cell-derived">{f(raw?.n)}</td>
        <td className="svt-cell-derived">{f(adj?.e)}</td>
        <td className="svt-cell-derived">{f(adj?.n)}</td>
        <td><button className="svt-row-del" onClick={onDelete} aria-label="Delete leg">×</button></td>
      </tr>
    );
  };

  return (
    <div className="svt-shell">
      <div className="svt-header">
        <div>
          <h2>Traverse Computation &amp; Balancing (Bowditch)</h2>
          <p>{activeType.blurb} Coordinate differences, misclosure, accuracy and the compass-rule (Bowditch) balanced coordinates update live. ({ax.first} = Easting, {ax.second} = Northing)</p>
        </div>
        <div className="svt-toolbar" style={{ flexWrap: "wrap" }}>
          <div className="svt-toolbar-group">
            <label className="form-label">Type</label>
            <select
              className="input-field"
              style={{ width: 220 }}
              value={type}
              onChange={(e) => setType(e.target.value as TraverseType)}
            >
              {TRAVERSE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <label className="form-label">Entry</label>
            <select
              className="input-field"
              style={{ width: 190 }}
              value={entryMode}
              onChange={(e) => setEntryMode(e.target.value as typeof entryMode)}
            >
              <option value="bearings">Leg bearings</option>
              <option value="angles">Observed angles</option>
            </select>
            {entryMode === "angles" && (
              <>
                <label className="form-label">Angles</label>
                <select
                  className="input-field"
                  style={{ width: 180 }}
                  value={angleMode}
                  onChange={(e) => setAngleMode(e.target.value as TraverseAngleMode)}
                >
                  {ANGLE_MODES.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <AngleInput
                  label="Start azimuth"
                  valueDeg={startAzDeg}
                  onChange={setStartAzDeg}
                />
              </>
            )}
          </div>
          <div className="svt-toolbar-group">
            {projectId && (
              <ProjectPointPicker
                projectId={projectId}
                label={`Start point`}
                value={startPointNo}
                onChange={applyStartPoint}
              />
            )}
            <label className="form-label">Start {ax.first}</label>
            <input className="input-field" style={{ width: 120 }} value={x0} onChange={(e) => setX0(e.target.value)} />
            <label className="form-label">Start {ax.second}</label>
            <input className="input-field" style={{ width: 120 }} value={y0} onChange={(e) => setY0(e.target.value)} />
            {type === "closed-link" && (
              <>
                {projectId && (
                  <ProjectPointPicker
                    projectId={projectId}
                    label={`Closing point`}
                    value={closePointNo}
                    onChange={applyClosePoint}
                  />
                )}
                <label className="form-label">Close {ax.first}</label>
                <input className="input-field" style={{ width: 120 }} value={cx} onChange={(e) => setCx(e.target.value)} />
                <label className="form-label">Close {ax.second}</label>
                <input className="input-field" style={{ width: 120 }} value={cy} onChange={(e) => setCy(e.target.value)} />
              </>
            )}
          </div>
        </div>
      </div>

      {error && <div className="svt-error">⚠ {error}</div>}

      <div className="svt-grid-layout">
        <div className="svt-card">
          <div className="svt-card-title"><span>Legs &amp; balanced coordinates</span><span>{entryMode === "angles" ? `${angleLegs.length} stations` : `${legsState.length} legs`}</span></div>
          <div className="svt-table-wrap">
            <table className="svt-table">
              <thead>
                <tr>
                  <th>Stn</th><th>{entryMode === "angles" ? "Angle" : "Bearing"}</th><th>Dist</th>
                  <th>Δ{ax.first}</th><th>Δ{ax.second}</th><th>{ax.first} (raw)</th><th>{ax.second} (raw)</th>
                  <th>{ax.first} (adj)</th><th>{ax.second} (adj)</th><th></th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>0</td>
                  <td className="svt-cell-muted">{entryMode === "angles" && startAzDeg != null && Number.isFinite(startAzDeg) ? fmtBearing(normalizeAzimuth(startAzDeg)) : "—"}</td>
                  <td className="svt-cell-muted">—</td>
                  <td className="svt-cell-muted">—</td>
                  <td className="svt-cell-muted">—</td>
                  <td className="svt-cell-derived">{Number.isFinite(num(x0)) ? num(x0).toFixed(3) : ""}</td>
                  <td className="svt-cell-derived">{Number.isFinite(num(y0)) ? num(y0).toFixed(3) : ""}</td>
                  <td className="svt-cell-derived">{result ? result.adjusted[0].e.toFixed(3) : ""}</td>
                  <td className="svt-cell-derived">{result ? result.adjusted[0].n.toFixed(3) : ""}</td>
                  <td></td>
                </tr>
                {entryMode === "angles"
                  ? angleLegs.map((l, i) =>
                      renderLegRow(
                        l.id,
                        i,
                        angular?.azimuths[i] ?? null,
                        l.distance,
                        (v) => updateAngle(l.id, { distance: v }),
                        () => delAngleLeg(l.id),
                        <AngleInput
                          label={`Angle ${i + 1}`}
                          valueDeg={l.angleDeg}
                          onChange={(deg) => updateAngle(l.id, { angleDeg: deg })}
                        />,
                      ),
                    )
                  : legsState.map((l, i) =>
                      renderLegRow(
                        l.id,
                        i,
                        parseBearing(l.bearing),
                        l.distance,
                        (v) => update(l.id, { distance: v }),
                        () => delLeg(l.id),
                        <input
                          className="svt-cell-input"
                          value={l.bearing}
                          onChange={(e) => update(l.id, { bearing: e.target.value })}
                          placeholder="90 or N45E"
                        />,
                      ),
                    )}
              </tbody>
              {result && (
                <tfoot>
                  <tr>
                    <td>Σ</td><td></td><td>{result.perimeter.toFixed(3)}</td>
                    <td>{result.misclosureE.toFixed(3)}</td>
                    <td>{result.misclosureN.toFixed(3)}</td>
                    <td colSpan={4}></td><td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="svt-grid-actions">
            {entryMode === "angles" ? (
              <>
                <button className="btn btn-outline btn-sm" onClick={addAngleLeg}>+ Add station</button>
                <button className="btn btn-outline btn-sm" onClick={() => setAngleLegs(ANGLE_SAMPLE)}>Reset sample</button>
                <button className="btn btn-outline btn-sm" onClick={() => setAngleLegs([newAngleLeg()])}>Clear</button>
              </>
            ) : (
              <>
                <button className="btn btn-outline btn-sm" onClick={addLeg}>+ Add leg</button>
                <button className="btn btn-outline btn-sm" onClick={() => setLegsState(SAMPLE)}>Reset sample</button>
                <button className="btn btn-outline btn-sm" onClick={() => setLegsState([newLeg()])}>Clear</button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="svt-card">
            <div className="svt-card-title">Misclosure &amp; accuracy</div>
            {angular?.hasAngularClosure && (
              <div className="svt-summary" style={{ marginBottom: 10 }}>
                <div className="svt-summary-row">
                  <span className="svt-summary-label">Angular misclosure</span>
                  <span className="svt-summary-val">{fmtBearing(Math.abs(angular.angularMisclosure))}{angular.angularMisclosure < 0 ? " (short)" : ""}</span>
                </div>
                <div className="svt-summary-row">
                  <span className="svt-summary-label">Σ angles / theory</span>
                  <span className="svt-summary-val">{angular.angleSum.toFixed(4)}° / {angular.theoreticalSum.toFixed(1)}°</span>
                </div>
                <div className="svt-summary-row">
                  <span className="svt-summary-label">Per-angle correction</span>
                  <span className="svt-summary-val">{angular.perAngleCorrection.toFixed(5)}°</span>
                </div>
                {angular.mirrored && (
                  <p style={{ padding: "4px 0 0", fontSize: 12, color: "var(--color-warning, #a16207)" }}>
                    Angles closed on the mirrored loop direction — the mirrored convention was applied automatically.
                  </p>
                )}
              </div>
            )}
            {result ? (
              result.hasClosure ? (
                <div className="svt-summary">
                  <Row2 label="Total length (m)" v={result.perimeter} />
                  <Row2 label={`Misclosure Δ${ax.first} (m)`} v={result.misclosureE} />
                  <Row2 label={`Misclosure Δ${ax.second} (m)`} v={result.misclosureN} />
                  <Row2 label="Linear misclosure (m)" v={result.linearMisclosure} />
                  <div className="svt-summary-row">
                    <span className="svt-summary-label">Accuracy</span>
                    <span className="svt-summary-val">{Number.isFinite(result.precision) ? `1:${Math.round(result.precision).toLocaleString()}` : "Exact"}</span>
                  </div>
                </div>
              ) : (
                <div className="svt-summary">
                  <Row2 label="Total length (m)" v={result.perimeter} />
                  <div className="svt-summary-row">
                    <span className="svt-summary-label">Closure</span>
                    <span className="svt-summary-val">Open — no check</span>
                  </div>
                  <p style={{ padding: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                    An open traverse cannot be checked or balanced. Coordinates are computed (raw) only.
                  </p>
                </div>
              )
            ) : <p style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>Enter the legs to compute.</p>}
          </div>
          <div className="svt-card">
            <div className="svt-card-title">{result?.hasClosure ? "Traverse plan (balanced)" : "Traverse plan (computed)"}</div>
            {result ? <PlanPlot pts={result.adjusted} closed={result.type === "closed-loop"} /> : <p style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>No data.</p>}
          </div>
          {projectId && (
            <div className="svt-card">
              <div className="svt-card-title">Project output</div>
              <div style={{ padding: 12, display: "grid", gap: 10 }}>
                <div className="svt-grid-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleSavePoints}
                    disabled={!result}
                  >
                    Save adjusted points
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={handleExportCsv}
                    disabled={!result}
                  >
                    Export CSV
                  </button>
                </div>
                {toastMessage && (
                  <div style={{ fontSize: 13, color: "var(--success, #16a34a)" }}>
                    {toastMessage}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row2({ label, v }: { label: string; v: number }) {
  return (
    <div className="svt-summary-row">
      <span className="svt-summary-label">{label}</span>
      <span className="svt-summary-val">{v.toFixed(4)}</span>
    </div>
  );
}

function PlanPlot({ pts, closed }: { pts: { n: number; e: number }[]; closed: boolean }) {
  const W = 320, H = 240, pad = 20;
  if (pts.length < 2) return <p style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>No data.</p>;
  // Only a closed-loop traverse draws the closing segment back to the start.
  const ring = closed ? [...pts, pts[0]] : pts;
  const es = ring.map((p) => p.e), ns = ring.map((p) => p.n);
  const minE = Math.min(...es), maxE = Math.max(...es), minN = Math.min(...ns), maxN = Math.max(...ns);
  const spanE = maxE - minE || 1, spanN = maxN - minN || 1;
  const innerW = W - pad * 2, innerH = H - pad * 2;
  const x = (e: number) => pad + ((e - minE) / spanE) * innerW;
  const y = (n: number) => pad + (1 - (n - minN) / spanN) * innerH; // Y up = North up
  const path = ring.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.e).toFixed(1)} ${y(p.n).toFixed(1)}`).join(" ");
  return (
    <svg className="svt-plot" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Traverse plan">
      <path d={path} fill={closed ? "color-mix(in oklab, var(--accent) 12%, transparent)" : "none"} stroke="var(--accent)" strokeWidth="2" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={x(p.e)} cy={y(p.n)} r="3" fill="var(--accent)" />
          <text x={x(p.e) + 4} y={y(p.n) - 4} fontSize="9" fill="var(--text-muted)">{i}</text>
        </g>
      ))}
    </svg>
  );
}
