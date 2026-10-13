import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import {
  forward,
  inverse,
  resectionTienstra,
  intersectionBearingBearing,
  intersectionDistanceDistance,
  normalizeAzimuth,
  type NE,
} from "../../components/cad/survey/cogo.ts";
import { fmtBearing, parseBearing, type BearingFormat } from "../../components/cad/survey/format.ts";
import { AngleInput } from "./AngleInput.tsx";
import { useAxisLabels } from "./useAxisConvention.ts";
import {
  PolarDiagram,
  JoinDiagram,
  IntersectionDiagram,
  ResectionDiagram,
} from "./Diagrams.tsx";
import { ProjectPointPicker } from "./ProjectPointPicker.tsx";
import { useProjectPoints } from "./projectPoints.ts";
import { copyToClipboard } from "./calcUtils.ts";

const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };

/** Format a decimal-degree angle as the packed DD.MMSS surveyor shorthand. */
function packedString(deg: number): string {
  const sign = deg < 0 ? "-" : "";
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const minF = (abs - d) * 60;
  const m = Math.floor(minF);
  const s = Math.round((minF - m) * 60);
  let mm = m, ss = s, dd = d;
  if (ss === 60) { ss = 0; mm += 1; }
  if (mm === 60) { mm = 0; dd += 1; }
  return `${sign}${dd}.${String(mm).padStart(2, "0")}${String(ss).padStart(2, "0")}`;
}

function Shell({ title, blurb, form, result, diagram, actions }: { title: string; blurb: string; form: React.ReactNode; result: string | null; diagram?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="svt-shell">
      <div className="svt-header"><div><h2>{title}</h2><p>{blurb}</p></div></div>
      <div className="svt-grid-layout">
        <div className="svt-card">
          <div className="svt-card-title">Inputs</div>
          {form}
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="svt-card">
            <div className="svt-card-title">Result</div>
            {result ? <pre className="svt-result">{result}</pre> : <p style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>Enter values and compute.</p>}
            {actions && <div className="svt-actions">{actions}</div>}
          </div>
          <div className="svt-card">
            <div className="svt-card-title">Diagram</div>
            {diagram ?? <p style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>The geometry will be drawn here after you compute.</p>}
          </div>
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

/** Group two related inputs (e.g. an X / Y coordinate pair) side by side. */
function Pair({ children }: { children: React.ReactNode }) {
  return <div className="svt-pair">{children}</div>;
}

// ── Polar / Forward ───────────────────────────────────────────────────────
export function PolarForwardTool({ projectId }: { projectId?: string }) {
  const axis = useAxisLabels();
  const { add } = useProjectPoints(projectId);
  const [startPno, setStartPno] = useState("");
  const [y0, setY0] = useState("1000"), [x0, setX0] = useState("1000");
  const [az, setAz] = useState<number | null>(45), [d, setD] = useState("100");
  const [res, setRes] = useState<string | null>(null);
  const [geom, setGeom] = useState<{ start: NE; end: NE } | null>(null);
  const [computed, setComputed] = useState<NE | null>(null);
  const run = () => {
    const dist = num(d), sy = num(y0), sx = num(x0);
    if (![sy, sx, dist].every(Number.isFinite) || az == null) { setGeom(null); setComputed(null); return setRes(`⚠ Enter a valid start ${axis.first}, ${axis.second}, bearing and distance.`); }
    const start: NE = { n: sx, e: sy };
    const p = forward(start, az, dist);
    setGeom({ start, end: p });
    setComputed(p);
    setRes(`New point\n  ${axis.first}:  ${p.e.toFixed(3)}\n  ${axis.second}:  ${p.n.toFixed(3)}\n\nForward bearing (WCB): ${fmtBearing(az)} (${az.toFixed(4)}°)`);
  };
  const saveComputed = () => {
    if (!computed || !add) return;
    const p = add({ e: computed.e, n: computed.n, code: "FWD" });
    if (p) setRes((r) => `${r ?? ""}\n\nSaved as point ${p.pointNo}`);
  };
  return <Shell title="Polar / Forward Computation" blurb={`Compute the ${axis.first}, ${axis.second} of a new point from a known point, a forward bearing and a horizontal distance. (${axis.first} = Easting, ${axis.second} = Northing; order follows the project's axis convention.)`}
    result={res}
    diagram={geom ? <PolarDiagram start={geom.start} end={geom.end} /> : undefined}
    actions={computed && projectId && (
      <>
        <CopyButton text={res ?? ""} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={saveComputed}>Save as point</button>
      </>
    )}
    form={<><div className="svt-form">
      {projectId && (
        <ProjectPointPicker
          projectId={projectId}
          value={startPno}
          onChange={(pno, pt) => {
            setStartPno(pno);
            if (pt) { setY0(String(pt.e)); setX0(String(pt.n)); }
          }}
          label={`Start point (${axis.first}, ${axis.second})`}
          placeholder="Pick or type point number"
        />
      )}
      <Pair>
        <Input label={`Start ${axis.first}`} value={y0} set={setY0} />
        <Input label={`Start ${axis.second}`} value={x0} set={setX0} />
      </Pair>
      <Pair>
        <AngleInput label="Forward bearing (WCB)" valueDeg={az} onChange={setAz} />
        <Input label="Distance (m)" value={d} set={setD} />
      </Pair>
    </div><div className="svt-grid-actions"><button className="btn btn-primary btn-sm" onClick={run}>Compute</button></div></>} />;
}

// ── Join / Inverse ──────────────────────────────────────────────────────────
export function JoinInverseTool({ projectId }: { projectId?: string }) {
  const axis = useAxisLabels();
  const [p1no, setP1no] = useState(""), [p2no, setP2no] = useState("");
  const [y1, setY1] = useState("1000"), [x1, setX1] = useState("1000");
  const [y2, setY2] = useState("1100"), [x2, setX2] = useState("1100");
  const [fmt, setFmt] = useState<BearingFormat>("azimuth");
  const [res, setRes] = useState<string | null>(null);
  const [geom, setGeom] = useState<{ a: NE; b: NE } | null>(null);
  const run = () => {
    const f: NE = { n: num(x1), e: num(y1) }, t: NE = { n: num(x2), e: num(y2) };
    if (![f.n, f.e, t.n, t.e].every(Number.isFinite)) { setGeom(null); return setRes(`⚠ Enter valid ${axis.first}, ${axis.second} for both points.`); }
    const { azimuth, distance } = inverse(f, t);
    const backBrg = normalizeAzimuth(azimuth + 180);
    setGeom({ a: f, b: t });
    setRes(`Distance: ${distance.toFixed(3)} m\nForward bearing (P1→P2): ${fmtBearing(azimuth, fmt)} (${azimuth.toFixed(4)}°)\nBack bearing (P2→P1):      ${fmtBearing(backBrg, fmt)} (${backBrg.toFixed(4)}°)`);
  };
  return <Shell title="Join / Inverse (Polar)" blurb={`Compute the forward bearing, back bearing and distance between two known ${axis.first}, ${axis.second} coordinates.`}
    result={res}
    diagram={geom ? <JoinDiagram a={geom.a} b={geom.b} /> : undefined}
    actions={res && <CopyButton text={res} />}
    form={<><div className="svt-form">
      {projectId && (
        <>
          <ProjectPointPicker
            projectId={projectId}
            value={p1no}
            onChange={(pno, pt) => { setP1no(pno); if (pt) { setY1(String(pt.e)); setX1(String(pt.n)); } }}
            label="Point 1"
          />
          <ProjectPointPicker
            projectId={projectId}
            value={p2no}
            onChange={(pno, pt) => { setP2no(pno); if (pt) { setY2(String(pt.e)); setX2(String(pt.n)); } }}
            label="Point 2"
          />
        </>
      )}
      <Pair>
        <Input label={`Point 1 ${axis.first}`} value={y1} set={setY1} />
        <Input label={`Point 1 ${axis.second}`} value={x1} set={setX1} />
      </Pair>
      <Pair>
        <Input label={`Point 2 ${axis.first}`} value={y2} set={setY2} />
        <Input label={`Point 2 ${axis.second}`} value={x2} set={setX2} />
      </Pair>
      <div className="form-group"><label className="form-label">Bearing format</label>
        <select className="input-field" value={fmt} onChange={(e) => setFmt(e.target.value as BearingFormat)}>
          <option value="azimuth">WCB / Forward Bearing (D°M'S")</option><option value="quadrant">Reduced Bearing</option><option value="gon">Gon</option>
        </select></div>
    </div><div className="svt-grid-actions"><button className="btn btn-primary btn-sm" onClick={run}>Compute</button></div></>} />;
}

// ── Intersection ──────────────────────────────────────────────────────────
export function IntersectionTool({ projectId }: { projectId?: string }) {
  const axis = useAxisLabels();
  const { add } = useProjectPoints(projectId);
  const [mode, setMode] = useState<"bearing" | "distance">("bearing");
  const [pAno, setPAno] = useState(""), [pBno, setPBno] = useState("");
  const [y1, setY1] = useState("0"), [x1, setX1] = useState("0"), [y2, setY2] = useState("100"), [x2, setX2] = useState("0");
  const [a1, setA1] = useState<number | null>(45), [a2, setA2] = useState<number | null>(315), [d1, setD1] = useState("70.71"), [d2, setD2] = useState("70.71");
  const [res, setRes] = useState<string | null>(null);
  const [geom, setGeom] = useState<{ a: NE; b: NE; fix: NE | null; mode: "bearing" | "distance"; r1?: number; r2?: number } | null>(null);
  const [fixed, setFixed] = useState<NE | null>(null);
  const run = () => {
    const p1: NE = { n: num(x1), e: num(y1) }, p2: NE = { n: num(x2), e: num(y2) };
    if (![p1.n, p1.e, p2.n, p2.e].every(Number.isFinite)) { setGeom(null); setFixed(null); return setRes(`⚠ Enter valid ${axis.first}, ${axis.second} for both stations.`); }
    if (mode === "bearing") {
      if (a1 == null || a2 == null) { setGeom(null); setFixed(null); return setRes("⚠ Enter valid bearings."); }
      const p = intersectionBearingBearing(p1, a1, p2, a2);
      setGeom({ a: p1, b: p2, fix: p, mode: "bearing" });
      setFixed(p);
      return setRes(p ? `Intersection\n  ${axis.first}: ${p.e.toFixed(3)}\n  ${axis.second}: ${p.n.toFixed(3)}` : "⚠ Rays are parallel — no intersection.");
    }
    const r1 = num(d1), r2 = num(d2);
    if (![r1, r2].every(Number.isFinite)) { setGeom(null); setFixed(null); return setRes("⚠ Enter valid distances."); }
    const sols = intersectionDistanceDistance(p1, r1, p2, r2);
    const chosen = sols[0] ?? null;
    setGeom({ a: p1, b: p2, fix: chosen, mode: "distance", r1, r2 });
    setFixed(chosen);
    setRes(sols.length === 0 ? "⚠ Circles do not intersect."
      : "Solution(s):\n" + sols.map((s, i) => `  ${i + 1}: ${axis.first} ${s.e.toFixed(3)}, ${axis.second} ${s.n.toFixed(3)}`).join("\n")
        + (sols.length > 1 ? "\n\nPick the solution on the correct side of the baseline." : ""));
  };
  const saveFixed = () => {
    if (!fixed || !add) return;
    const p = add({ e: fixed.e, n: fixed.n, code: "INT" });
    if (p) setRes((r) => `${r ?? ""}\n\nSaved as point ${p.pointNo}`);
  };
  return <Shell title="Intersection" blurb={`Fix a new point from two known stations using bearing-bearing or distance-distance observations. (${axis.first} = Easting, ${axis.second} = Northing)`}
    result={res}
    diagram={geom ? <IntersectionDiagram a={geom.a} b={geom.b} fix={geom.fix} mode={geom.mode} r1={geom.r1} r2={geom.r2} /> : undefined}
    actions={fixed && projectId && (
      <>
        <CopyButton text={res ?? ""} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={saveFixed}>Save as point</button>
      </>
    )}
    form={<><div className="svt-form">
      <div className="form-group"><label className="form-label">Method</label>
        <select className="input-field" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="bearing">Bearing – Bearing</option><option value="distance">Distance – Distance</option>
        </select></div>
      {projectId && (
        <>
          <ProjectPointPicker projectId={projectId} value={pAno} onChange={(pno, pt) => { setPAno(pno); if (pt) { setY1(String(pt.e)); setX1(String(pt.n)); } }} label="Station A" />
          <ProjectPointPicker projectId={projectId} value={pBno} onChange={(pno, pt) => { setPBno(pno); if (pt) { setY2(String(pt.e)); setX2(String(pt.n)); } }} label="Station B" />
        </>
      )}
      <Pair>
        <Input label={`Station A — ${axis.first}`} value={y1} set={setY1} /><Input label={`Station A — ${axis.second}`} value={x1} set={setX1} />
      </Pair>
      <Pair>
        <Input label={`Station B — ${axis.first}`} value={y2} set={setY2} /><Input label={`Station B — ${axis.second}`} value={x2} set={setX2} />
      </Pair>
      {mode === "bearing"
        ? <Pair><AngleInput label="Bearing from A" valueDeg={a1} onChange={setA1} /><AngleInput label="Bearing from B" valueDeg={a2} onChange={setA2} /></Pair>
        : <Pair><Input label="Distance from A (m)" value={d1} set={setD1} /><Input label="Distance from B (m)" value={d2} set={setD2} /></Pair>}
    </div><div className="svt-grid-actions"><button className="btn btn-primary btn-sm" onClick={run}>Compute</button></div></>} />;
}

// ── Resection ───────────────────────────────────────────────────────────────
export function ResectionTool({ projectId }: { projectId?: string }) {
  const axis = useAxisLabels();
  const { add } = useProjectPoints(projectId);
  const [pAno, setPAno] = useState(""), [pBno, setPBno] = useState(""), [pCno, setPCno] = useState("");
  const [ay, setAy] = useState("0"), [ax, setAx] = useState("0");
  const [by, setBy] = useState("1000"), [bx, setBx] = useState("0");
  const [cy, setCy] = useState("500"), [cx, setCx] = useState("1000");
  const [al, setAl] = useState<number | null>(null), [be, setBe] = useState<number | null>(null), [ga, setGa] = useState<number | null>(null);
  const [res, setRes] = useState<string | null>(null);
  const [geom, setGeom] = useState<{ a: NE; b: NE; c: NE; p: NE | null } | null>(null);
  const [fixed, setFixed] = useState<NE | null>(null);
  const run = () => {
    const A: NE = { n: num(ax), e: num(ay) }, B: NE = { n: num(bx), e: num(by) }, C: NE = { n: num(cx), e: num(cy) };
    if (![A.n, A.e, B.n, B.e, C.n, C.e].every(Number.isFinite)) { setGeom(null); setFixed(null); return setRes(`⚠ Enter valid ${axis.first}, ${axis.second} for A, B, C.`); }
    if (al == null || be == null || ga == null) { setGeom(null); setFixed(null); return setRes("⚠ Enter the three observed angles α, β, γ."); }
    if (Math.abs(al + be + ga - 360) > 0.5) { setGeom(null); setFixed(null); return setRes(`⚠ α + β + γ should total 360° (got ${(al + be + ga).toFixed(3)}°).`); }
    const p = resectionTienstra(A, B, C, al, be, ga);
    setGeom({ a: A, b: B, c: C, p });
    setFixed(p ?? null);
    setRes(p ? `Observer position P\n  ${axis.first}: ${p.e.toFixed(3)}\n  ${axis.second}: ${p.n.toFixed(3)}` : "⚠ Degenerate geometry — cannot resect.");
  };
  const saveFixed = () => {
    if (!fixed || !add) return;
    const p = add({ e: fixed.e, n: fixed.n, code: "RES" });
    if (p) setRes((r) => `${r ?? ""}\n\nSaved as point ${p.pointNo}`);
  };
  return <Shell title="Resection (Three-Point, Tienstra)" blurb={`Fix the observer's ${axis.first}, ${axis.second} from horizontal angles observed to three known stations. α = angle BPC, β = angle CPA, γ = angle APB; they must total 360°.`}
    result={res}
    diagram={geom ? <ResectionDiagram a={geom.a} b={geom.b} c={geom.c} p={geom.p} /> : undefined}
    actions={fixed && projectId && (
      <>
        <CopyButton text={res ?? ""} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={saveFixed}>Save as point</button>
      </>
    )}
    form={<><div className="svt-form">
      {projectId && (
        <>
          <ProjectPointPicker projectId={projectId} value={pAno} onChange={(pno, pt) => { setPAno(pno); if (pt) { setAy(String(pt.e)); setAx(String(pt.n)); } }} label="Station A" />
          <ProjectPointPicker projectId={projectId} value={pBno} onChange={(pno, pt) => { setPBno(pno); if (pt) { setBy(String(pt.e)); setBx(String(pt.n)); } }} label="Station B" />
          <ProjectPointPicker projectId={projectId} value={pCno} onChange={(pno, pt) => { setPCno(pno); if (pt) { setCy(String(pt.e)); setCx(String(pt.n)); } }} label="Station C" />
        </>
      )}
      <Pair>
        <Input label={`A — ${axis.first}`} value={ay} set={setAy} /><Input label={`A — ${axis.second}`} value={ax} set={setAx} />
      </Pair>
      <Pair>
        <Input label={`B — ${axis.first}`} value={by} set={setBy} /><Input label={`B — ${axis.second}`} value={bx} set={setBx} />
      </Pair>
      <Pair>
        <Input label={`C — ${axis.first}`} value={cy} set={setCy} /><Input label={`C — ${axis.second}`} value={cx} set={setCx} />
      </Pair>
      <AngleInput label="α (BPC)" valueDeg={al} onChange={setAl} />
      <Pair>
        <AngleInput label="β (CPA)" valueDeg={be} onChange={setBe} /><AngleInput label="γ (APB)" valueDeg={ga} onChange={setGa} />
      </Pair>
    </div><div className="svt-grid-actions"><button className="btn btn-primary btn-sm" onClick={run}>Resect</button></div></>} />;
}


// ── Bearing / angle converter ───────────────────────────────────────────────
export function AngleConverterTool() {
  const [input, setInput] = useState("45");
  const res = useMemo(() => {
    const az = parseBearing(input);
    if (az == null) return null;
    const backBrg = normalizeAzimuth(az + 180);
    return `WCB / Forward bearing: ${fmtBearing(az, "azimuth")}\nBack bearing:          ${fmtBearing(backBrg, "azimuth")}\nDecimal degrees:       ${az.toFixed(6)}°\nPacked DD.MMSS:        ${packedString(az)}\nReduced bearing:       ${fmtBearing(az, "quadrant")}\nGon / grad:            ${((az / 360) * 400).toFixed(4)} gon\nRadians:               ${((az * Math.PI) / 180).toFixed(6)}`;
  }, [input]);
  return <Shell title="Bearing / Angle Converter" blurb="Convert any direction between WCB / forward bearing (DMS), packed DD.MMSS, decimal degrees, reduced bearing, gon and radians."
    result={res}
    actions={res && (
      <>
        <CopyButton text={res} />
        <CopyButton text={fmtBearing(parseBearing(input) ?? 0, "azimuth")} />
      </>
    )}
    form={<><div className="svt-form">
      <Input label="Direction" value={input} set={setInput} placeholder="45.3020, 123.456, N45°30'E or S30W" />
    </div><div className="svt-grid-actions"><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Results update as you type.</span></div></>} />;
}
