import { useState } from "react";
import { Copy } from "lucide-react";
import {
  stakeOut,
  type NE,
  type StakeOutResult,
} from "../../components/cad/survey/cogo.ts";
import { stakeHorizontalCurve, verticalCurve } from "../../components/cad/survey/alignmentBridge.ts";
import { fmtBearing, parseBearing } from "../../components/cad/survey/format.ts";
import { useAxisLabels } from "./useAxisConvention.ts";
import { ProjectPointPicker } from "./ProjectPointPicker.tsx";
import { useProjectPoints } from "./projectPoints.ts";
import { addProjectOutput } from "./projectOutputs.ts";
import { copyToClipboard, downloadCsv } from "./calcUtils.ts";

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Parse an optional RL/elevation field: null when blank, the number when
 * valid, or NaN for invalid text (so callers can reject instead of silently
 * propagating NaN into results and CSV exports).
 */
const parseRl = (raw: string): number | null => (raw.trim() === "" ? null : num(raw));

/** Parse a direction that may be a decimal degree or a bearing string. */
function parseAz(raw: string): number {
  const b = parseBearing(raw);
  if (b != null) return b;
  return num(raw);
}

function Shell({
  title,
  blurb,
  form,
  result,
  actions,
}: {
  title: string;
  blurb: string;
  form: React.ReactNode;
  result: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <div className="svt-shell">
      <div className="svt-header"><div><h2>{title}</h2><p>{blurb}</p></div></div>
      <div className="svt-grid-layout">
        <div className="svt-card">
          <div className="svt-card-title">Inputs</div>
          {form}
        </div>
        <div className="svt-card">
          <div className="svt-card-title">Result</div>
          {result ? (
            <>
              <pre className="svt-result">{result}</pre>
              {actions && <div className="svt-actions">{actions}</div>}
            </>
          ) : (
            <p style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>Enter values and compute.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={() => { void copyToClipboard(text).then((ok) => setCopied(ok)); setTimeout(() => setCopied(false), 1500); }}
      title="Copy result"
    >
      <Copy size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Input({ label, value, set, placeholder }: { label: string; value: string; set: (v: string) => void; placeholder?: string }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="input-field" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Pair({ children }: { children: React.ReactNode }) {
  return <div className="svt-pair">{children}</div>;
}

// ── Stake-out ────────────────────────────────────────────────────────────────
interface StakeOutToolProps {
  projectId?: string;
}

interface TargetRow {
  id: string;
  pointNo: string;
  y: string;
  x: string;
  z: string;
  result: StakeOutResult | null;
  error: string | null;
}

let targetIdSeq = 0;
const newTargetRow = (y = "", x = "", z = ""): TargetRow => ({
  id: `target-${++targetIdSeq}`,
  pointNo: "",
  y,
  x,
  z,
  result: null,
  error: null,
});

function formatTargetResult(r: StakeOutResult): string {
  return (
    `${fmtBearing(r.angleRight)} / ${r.distance.toFixed(3)} m\n` +
    `A ${r.along.toFixed(3)}  O ${r.offset.toFixed(3)}` +
    (r.deltaZ != null ? `  dH ${r.deltaZ.toFixed(3)}` : "")
  );
}

export function StakeOutTool({ projectId }: StakeOutToolProps) {
  const ax = useAxisLabels();
  const hasProject = Boolean(projectId);
  const points = useProjectPoints(projectId);

  // Legacy single-target state (used when projectId is absent)
  const [oy, setOy] = useState("1000"), [ox, setOx] = useState("1000"), [oz, setOz] = useState("");
  const [by, setBy] = useState("1000"), [bx, setBx] = useState("1100");
  const [ty, setTy] = useState("1080"), [tx, setTx] = useState("1060"), [tz, setTz] = useState("");
  const [res, setRes] = useState<string | null>(null);

  // Batch state (used when projectId is present)
  const [occ, setOcc] = useState({ pointNo: "", y: "1000", x: "1000", z: "" });
  const [bsPno, setBsPno] = useState({ pointNo: "", y: "1000", x: "1100" });
  const [targets, setTargets] = useState<TargetRow[]>(() => [newTargetRow("1080", "1060", "")]);

  const updateTarget = (id: string, patch: Partial<TargetRow>) =>
    setTargets((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addTarget = () => setTargets((rows) => [...rows, newTargetRow()]);
  const removeTarget = (id: string) => setTargets((rows) => rows.filter((r) => r.id !== id));

  const runLegacy = () => {
    const occupied: NE = { n: num(ox), e: num(oy) };
    const bs: NE = { n: num(bx), e: num(by) };
    const target: NE = { n: num(tx), e: num(ty) };
    if (![occupied.n, occupied.e, bs.n, bs.e, target.n, target.e].every(Number.isFinite)) {
      return setRes(`⚠ Enter valid ${ax.first}, ${ax.second} for the occupied, backsight and target points.`);
    }
    const ozv = parseRl(oz);
    const tzv = parseRl(tz);
    if ((ozv !== null && !Number.isFinite(ozv)) || (tzv !== null && !Number.isFinite(tzv))) {
      return setRes("⚠ Enter a valid RL/elevation value, or leave it blank.");
    }
    const r = stakeOut(occupied, bs, target, ozv, tzv);
    setRes(
      `Angle right (from BS): ${fmtBearing(r.angleRight)} (${r.angleRight.toFixed(4)}°)\n` +
        `WCB to target:         ${fmtBearing(r.azimuth)}\n` +
        `Backsight bearing:     ${fmtBearing(r.backsightAzimuth)}\n` +
        `Distance:              ${r.distance.toFixed(3)} m\n` +
        `Along line:            ${r.along.toFixed(3)} m\n` +
        `Offset (+R / −L):      ${r.offset.toFixed(3)} m` +
        (r.deltaZ != null ? `\nΔH (target − occ):     ${r.deltaZ.toFixed(3)} m` : ""),
    );
  };

  const runBatch = () => {
    const occupied: NE = { n: num(occ.x), e: num(occ.y) };
    const bs: NE = { n: num(bsPno.x), e: num(bsPno.y) };
    if (![occupied.n, occupied.e, bs.n, bs.e].every(Number.isFinite)) {
      return setRes(`⚠ Enter valid ${ax.first}, ${ax.second} for the occupied and backsight points.`);
    }
    const occZ = parseRl(occ.z);
    if (occZ !== null && !Number.isFinite(occZ)) {
      return setRes("⚠ Enter a valid RL for the occupied point, or leave it blank.");
    }

    const computed = targets.map((row) => {
      const target: NE = { n: num(row.x), e: num(row.y) };
      if (![target.n, target.e].every(Number.isFinite)) {
        return { ...row, result: null as StakeOutResult | null, error: `Enter valid ${ax.first}, ${ax.second}.` };
      }
      const tzv = parseRl(row.z);
      if (tzv !== null && !Number.isFinite(tzv)) {
        return { ...row, result: null as StakeOutResult | null, error: "Enter a valid RL (or leave blank)." };
      }
      return { ...row, result: stakeOut(occupied, bs, target, occZ, tzv), error: null as string | null };
    });
    setTargets(computed);

    const valid = computed.filter((r) => r.result);
    if (valid.length === 0) {
      return setRes("⚠ No valid target rows. Enter at least one set of coordinates.");
    }

    let out =
      `Occupied:  ${occ.pointNo || "OCC"} (${ax.first} ${occ.y}, ${ax.second} ${occ.x})\n` +
      `Backsight: ${bsPno.pointNo || "BS"} (${ax.first} ${bsPno.y}, ${ax.second} ${bsPno.x})`;
    for (let i = 0; i < computed.length; i++) {
      const row = computed[i];
      const label = row.pointNo || `T${i + 1}`;
      if (row.error) {
        out += `\n\n${label}: ${row.error}`;
        continue;
      }
      const r = row.result!;
      out +=
        `\n\n${label}:\n` +
        `  Angle right (from BS): ${fmtBearing(r.angleRight)} (${r.angleRight.toFixed(4)}°)\n` +
        `  WCB to target:         ${fmtBearing(r.azimuth)}\n` +
        `  Distance:              ${r.distance.toFixed(3)} m\n` +
        `  Along line:            ${r.along.toFixed(3)} m\n` +
        `  Offset (+R / −L):      ${r.offset.toFixed(3)} m` +
        (r.deltaZ != null ? `\n  ΔH (target − occ):     ${r.deltaZ.toFixed(3)} m` : "");
    }
    setRes(out);
  };

  const saveShots = () => {
    if (!projectId) return;
    let saved = 0;
    for (const row of targets) {
      if (!row.result) continue;
      const e = num(row.y);
      const n = num(row.x);
      const z = row.z.trim() === "" ? null : num(row.z);
      if (![e, n].every(Number.isFinite)) continue;
      points.add({ e, n, z: Number.isFinite(z) ? z : null, code: "STK" });
      saved++;
    }
    if (saved > 0) {
      setRes((prev) => `${prev ?? ""}\n\nSaved ${saved} shot${saved === 1 ? "" : "s"} as project points (code STK).`);
    }
  };

  const exportCsv = () => {
    const occLabel = occ.pointNo || "OCC";
    const bsLabel = bsPno.pointNo || "BS";
    const rows = targets
      .filter((t) => t.result)
      .map((t, i) => {
        const label = t.pointNo || `T${i + 1}`;
        const r = t.result!;
        return [
          label,
          occLabel,
          bsLabel,
          r.angleRight.toFixed(4),
          r.distance.toFixed(3),
          r.along.toFixed(3),
          r.offset.toFixed(3),
          r.deltaZ == null ? "" : r.deltaZ.toFixed(3),
        ].join(",");
      });
    if (rows.length === 0) return;
    const content = ["Target,Occupied,Backsight,AngleRight,Distance,Along,Offset,dH", ...rows].join("\n");
    downloadCsv("setout-batch.csv", content);
    if (projectId) {
      addProjectOutput(projectId, {
        label: "Set-out Batch",
        description: `${rows.length} target${rows.length === 1 ? "" : "s"}`,
        fileName: `setout-${projectId}.csv`,
        mimeType: "text/csv",
        content,
      });
    }
  };

  const batchActions = hasProject && targets.some((t) => t.result) && (
    <>
      <CopyButton text={res ?? ""} />
      <button type="button" className="btn btn-secondary btn-sm" onClick={saveShots}>
        Save shots as project points
      </button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}>
        Export set-out CSV
      </button>
    </>
  );

  return (
    <Shell
      title="Stake-out / Set-out"
      blurb={`Compute the field elements (angle right, distance, offsets) to set out a design point from an occupied station oriented on a backsight. (${ax.first} = Easting, ${ax.second} = Northing)`}
      result={res}
      actions={batchActions || undefined}
      form={
        <>
          {!hasProject ? (
            <>
              <div className="svt-form">
                <Pair><Input label={`Occupied ${ax.first}`} value={oy} set={setOy} /><Input label={`Occupied ${ax.second}`} value={ox} set={setOx} /></Pair>
                <Input label="Occupied RL (optional)" value={oz} set={setOz} />
                <Pair><Input label={`Backsight ${ax.first}`} value={by} set={setBy} /><Input label={`Backsight ${ax.second}`} value={bx} set={setBx} /></Pair>
                <Pair><Input label={`Target ${ax.first}`} value={ty} set={setTy} /><Input label={`Target ${ax.second}`} value={tx} set={setTx} /></Pair>
                <Input label="Target RL (optional)" value={tz} set={setTz} />
              </div>
              <div className="svt-grid-actions"><button className="btn btn-primary btn-sm" onClick={runLegacy}>Compute</button></div>
            </>
          ) : (
            <>
              <div className="svt-form">
                {projectId && (
                  <ProjectPointPicker
                    projectId={projectId}
                    value={occ.pointNo}
                    onChange={(pno, pt) =>
                      setOcc((o) => ({
                        ...o,
                        pointNo: pno,
                        ...(pt ? { y: String(pt.e), x: String(pt.n), z: pt.z != null ? String(pt.z) : o.z } : {}),
                      }))
                    }
                    label="Occupied point"
                  />
                )}
                <Pair>
                  <Input label={`Occupied ${ax.first}`} value={occ.y} set={(v) => setOcc((o) => ({ ...o, y: v }))} />
                  <Input label={`Occupied ${ax.second}`} value={occ.x} set={(v) => setOcc((o) => ({ ...o, x: v }))} />
                </Pair>
                <Input label="Occupied RL (optional)" value={occ.z} set={(v) => setOcc((o) => ({ ...o, z: v }))} />
                {projectId && (
                  <ProjectPointPicker
                    projectId={projectId}
                    value={bsPno.pointNo}
                    onChange={(pno, pt) =>
                      setBsPno((b) => ({
                        ...b,
                        pointNo: pno,
                        ...(pt ? { y: String(pt.e), x: String(pt.n) } : {}),
                      }))
                    }
                    label="Backsight point"
                  />
                )}
                <Pair>
                  <Input label={`Backsight ${ax.first}`} value={bsPno.y} set={(v) => setBsPno((b) => ({ ...b, y: v }))} />
                  <Input label={`Backsight ${ax.second}`} value={bsPno.x} set={(v) => setBsPno((b) => ({ ...b, x: v }))} />
                </Pair>
              </div>
              <div className="svt-card-title" style={{ margin: "12px 14px 0" }}>Targets</div>
              <div className="svt-table-wrap" style={{ margin: "0 14px" }}>
                <table className="svt-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 120 }}>Point</th>
                      <th>{ax.first}</th>
                      <th>{ax.second}</th>
                      <th>RL</th>
                      <th style={{ minWidth: 180 }}>Result</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {targets.map((row, i) => (
                      <tr key={row.id}>
                        <td>
                          <ProjectPointPicker
                            projectId={projectId}
                            value={row.pointNo}
                            onChange={(pno, pt) =>
                              updateTarget(row.id, {
                                pointNo: pno,
                                ...(pt ? { y: String(pt.e), x: String(pt.n), z: pt.z != null ? String(pt.z) : row.z } : {}),
                              })
                            }
                            label={`Target ${i + 1} point`}
                          />
                        </td>
                        <td><input className="svt-cell-input" value={row.y} onChange={(e) => updateTarget(row.id, { y: e.target.value })} /></td>
                        <td><input className="svt-cell-input" value={row.x} onChange={(e) => updateTarget(row.id, { x: e.target.value })} /></td>
                        <td><input className="svt-cell-input" value={row.z} onChange={(e) => updateTarget(row.id, { z: e.target.value })} placeholder="RL" /></td>
                        <td className="svt-cell-derived" style={{ whiteSpace: "pre-wrap", textAlign: "left" }}>
                          {row.error ? (
                            <span className="svt-cell-muted">{row.error}</span>
                          ) : row.result ? (
                            formatTargetResult(row.result)
                          ) : (
                            <span className="svt-cell-muted">—</span>
                          )}
                        </td>
                        <td><button className="svt-row-del" onClick={() => removeTarget(row.id)} aria-label="Remove target">×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="svt-grid-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={addTarget}>+ Add target</button>
                <button className="btn btn-primary btn-sm" onClick={runBatch}>Compute set-outs</button>
              </div>
            </>
          )}
        </>
      }
    />
  );
}

// ── Horizontal circular curve ────────────────────────────────────────────────
interface HorizontalCurveToolProps {
  projectId?: string;
}

export function HorizontalCurveTool({ projectId }: HorizontalCurveToolProps) {
  const ax = useAxisLabels();
  const [piPno, setPiPno] = useState("");
  const [py, setPy] = useState("1000"), [px, setPx] = useState("1000");
  const [back, setBack] = useState("0"), [fwd, setFwd] = useState("90");
  const [radius, setRadius] = useState("100"), [interval, setInterval] = useState("10");
  const [res, setRes] = useState<string | null>(null);
  const [curveResult, setCurveResult] = useState<NonNullable<Awaited<ReturnType<typeof stakeHorizontalCurve>>> | null>(null);

  const run = async () => {
    const pi: NE = { n: num(px), e: num(py) };
    const ba = parseAz(back), fa = parseAz(fwd), r = num(radius), iv = num(interval);
    if (![pi.n, pi.e, ba, fa, r].every(Number.isFinite)) { setCurveResult(null); return setRes("⚠ Enter valid PI, tangent bearings and radius."); }
    if (r <= 0) { setCurveResult(null); return setRes("⚠ Radius must be positive."); }
    const out = await stakeHorizontalCurve(pi, ba, fa, r, Number.isFinite(iv) && iv > 0 ? iv : 0);
    if (!out) { setCurveResult(null); return setRes("⚠ Degenerate curve (deflection 0° or 180°)."); }
    setCurveResult(out);
    const { curve, stations } = out;
    let table = `\n  Arc(m)    Deflection      ${ax.first}            ${ax.second}\n`;
    for (const s of stations) {
      table +=
        `  ${s.arcFromPc.toFixed(2).padStart(7)}  ${fmtBearing(s.deflection).padStart(12)}  ` +
        `${s.point.e.toFixed(3).padStart(11)}  ${s.point.n.toFixed(3).padStart(11)}\n`;
    }
    setRes(
      `Deflection Δ: ${fmtBearing(curve.deflection)} (${curve.deflection.toFixed(4)}°)\n` +
        `Tangent  T:   ${curve.tangent.toFixed(3)} m\n` +
        `Arc      L:   ${curve.length.toFixed(3)} m\n` +
        `External E:   ${curve.external.toFixed(3)} m\n` +
        `Mid-ord  M:   ${curve.middleOrdinate.toFixed(3)} m\n` +
        `Long chord:   ${curve.longChord.toFixed(3)} m\n` +
        `PC:  ${ax.first} ${curve.pc.e.toFixed(3)}  ${ax.second} ${curve.pc.n.toFixed(3)}\n` +
        `PT:  ${ax.first} ${curve.pt.e.toFixed(3)}  ${ax.second} ${curve.pt.n.toFixed(3)}\n` +
        `Turns: ${curve.turnsRight ? "right" : "left"}\n` +
        (stations.length ? `\nStake-out stations (deflection from PC):${table}` : ""),
    );
  };

  const exportCsv = () => {
    if (!curveResult) return;
    // The capped final station is already the PT — don't emit it twice.
    const lastStation = curveResult.stations[curveResult.stations.length - 1];
    const lastIsPt = lastStation
      && Math.hypot(
        lastStation.point.e - curveResult.curve.pt.e,
        lastStation.point.n - curveResult.curve.pt.n,
      ) < 1e-6;
    const rows = [
      { pointNo: "PC", e: curveResult.curve.pc.e, n: curveResult.curve.pc.n, z: null, code: "PC" },
      ...curveResult.stations.map((s, i) => ({ pointNo: `S${i + 1}`, e: s.point.e, n: s.point.n, z: null, code: "" })),
      ...(lastIsPt
        ? []
        : [{ pointNo: "PT", e: curveResult.curve.pt.e, n: curveResult.curve.pt.n, z: null, code: "PT" }]),
    ];
    const csv = ["Point,Easting,Northing,RL,Code", ...rows.map((r) => [r.pointNo, r.e.toFixed(3), r.n.toFixed(3), r.z == null ? "" : String(r.z), r.code].join(","))].join("\n");
    downloadCsv("horizontal-curve-stations.csv", csv);
    if (projectId) {
      addProjectOutput(projectId, {
        label: "Horizontal Curve Stations",
        description: `${curveResult.stations.length} station${curveResult.stations.length === 1 ? "" : "s"}`,
        fileName: `horizontal-curve-${projectId}.csv`,
        mimeType: "text/csv",
        content: csv,
      });
    }
  };

  return (
    <Shell
      title="Horizontal Curve Set-out"
      blurb={`Solve a simple circular curve from the PI and tangent bearings, then generate deflection-angle stake-out stations from the PC. (${ax.first} = Easting, ${ax.second} = Northing)`}
      result={res}
      actions={curveResult && (
        <>
          <CopyButton text={res ?? ""} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}>Export stations CSV</button>
        </>
      )}
      form={
        <>
          <div className="svt-form">
            {projectId && (
              <ProjectPointPicker
                projectId={projectId}
                value={piPno}
                onChange={(pno, pt) => { setPiPno(pno); if (pt) { setPy(String(pt.e)); setPx(String(pt.n)); } }}
                label="PI point"
              />
            )}
            <Pair><Input label={`PI ${ax.first}`} value={py} set={setPy} /><Input label={`PI ${ax.second}`} value={px} set={setPx} /></Pair>
            <Pair><Input label="Back tangent bearing" value={back} set={setBack} placeholder="e.g. 0 or N30°E" /><Input label="Forward tangent bearing" value={fwd} set={setFwd} /></Pair>
            <Pair><Input label="Radius (m)" value={radius} set={setRadius} /><Input label="Stake interval (m)" value={interval} set={setInterval} /></Pair>
          </div>
          <div className="svt-grid-actions"><button className="btn btn-primary btn-sm" onClick={() => void run()}>Compute</button></div>
        </>
      }
    />
  );
}

// ── Vertical parabolic curve ─────────────────────────────────────────────────
interface VerticalCurveToolProps {
  projectId?: string;
}

export function VerticalCurveTool({ projectId }: VerticalCurveToolProps) {
  const [bvc, setBvc] = useState("100"), [g1, setG1] = useState("2.5"), [g2, setG2] = useState("-1.5");
  const [length, setLength] = useState("120"), [interval, setInterval] = useState("20");
  const [res, setRes] = useState<string | null>(null);
  const [curve, setCurve] = useState<Awaited<ReturnType<typeof verticalCurve>>>(null);

  const run = async () => {
    const b = num(bvc), gg1 = num(g1), gg2 = num(g2), len = num(length), iv = num(interval);
    if (![b, gg1, gg2, len].every(Number.isFinite)) { setCurve(null); return setRes("⚠ Enter valid BVC RL, grades and length."); }
    if (len <= 0) { setCurve(null); return setRes("⚠ Length must be positive."); }
    const c = await verticalCurve(b, gg1, gg2, len, Number.isFinite(iv) && iv > 0 ? iv : 0);
    if (!c) { setCurve(null); return setRes("⚠ Invalid curve parameters."); }
    setCurve(c);
    let table = "\n  Chainage(m)     RL(m)\n";
    for (const s of c.stations) {
      table += `  ${s.chainage.toFixed(2).padStart(10)}  ${s.elevation.toFixed(3).padStart(10)}\n`;
    }
    setRes(
      `BVC RL: ${c.bvcElevation.toFixed(3)} m\n` +
        `EVC RL: ${c.evcElevation.toFixed(3)} m\n` +
        `Grade change A: ${c.gradeChange.toFixed(3)} %\n` +
        `Turning point: ${c.turningChainage != null ? `${c.turningChainage.toFixed(2)} m @ RL ${c.turningElevation?.toFixed(3)} m` : "outside curve"}\n` +
        (c.stations.length ? table : ""),
    );
  };

  const exportCsv = () => {
    if (!curve) return;
    const csv = [
      "Chainage(m),RL(m)",
      ...curve.stations.map((s) => `${s.chainage.toFixed(2)},${s.elevation.toFixed(3)}`),
    ].join("\n");
    downloadCsv("vertical-curve-stations.csv", csv);
    if (projectId) {
      addProjectOutput(projectId, {
        label: "Vertical Curve Stations",
        description: `${curve.stations.length} station${curve.stations.length === 1 ? "" : "s"}`,
        fileName: `vertical-curve-${projectId}.csv`,
        mimeType: "text/csv",
        content: csv,
      });
    }
  };

  return (
    <Shell
      title="Vertical Curve Set-out"
      blurb="Design an equal-tangent parabolic curve between two grades and tabulate reduced levels along it."
      result={res}
      actions={curve && (
        <>
          <CopyButton text={res ?? ""} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}>Export stations CSV</button>
        </>
      )}
      form={
        <>
          <div className="svt-form">
            <Input label="BVC elevation (m)" value={bvc} set={setBvc} />
            <Pair><Input label="Grade in g₁ (%)" value={g1} set={setG1} /><Input label="Grade out g₂ (%)" value={g2} set={setG2} /></Pair>
            <Pair><Input label="Curve length L (m)" value={length} set={setLength} /><Input label="Chainage interval (m)" value={interval} set={setInterval} /></Pair>
          </div>
          <div className="svt-grid-actions"><button className="btn btn-primary btn-sm" onClick={() => void run()}>Compute</button></div>
        </>
      }
    />
  );
}
