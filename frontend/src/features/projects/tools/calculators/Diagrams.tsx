/**
 * Shared SVG diagrams for the survey computation tools.
 *
 * Every diagram auto-scales a set of NE points into a fixed viewBox with
 * padding, mirroring the plan-preview convention in AreaTool's <Poly>. They
 * are intentionally schematic (not to absolute scale across tools) so the
 * geometry of each computation is visually obvious.
 *
 * NOTE on axes: points carry the cogo {n, e} struct. In the Zimbabwe/Southern
 * African Gauss convention e = Y (westing) and n = X (southing); for UTM e =
 * Easting, n = Northing. We draw e horizontally and n vertically (north up),
 * which reads correctly for both once the labels are interpreted accordingly.
 */
import type { NE } from "../../components/cad/survey/cogo.ts";

const W = 320;
const H = 240;
const PAD = 26;

interface Scale {
  x: (e: number) => number;
  y: (n: number) => number;
}

/** Build a scaler that fits all `pts` into the padded viewBox (north up). */
function makeScale(pts: NE[]): Scale {
  const es = pts.map((p) => p.e);
  const ns = pts.map((p) => p.n);
  const minE = Math.min(...es);
  const maxE = Math.max(...es);
  const minN = Math.min(...ns);
  const maxN = Math.max(...ns);
  const spanE = maxE - minE || 1;
  const spanN = maxN - minN || 1;
  // Keep aspect ratio square-ish by using the larger span for both axes so the
  // figure isn't distorted.
  const span = Math.max(spanE, spanN);
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const cx = (minE + maxE) / 2;
  const cy = (minN + maxN) / 2;
  return {
    x: (e: number) => W / 2 + ((e - cx) / span) * innerW,
    y: (n: number) => H / 2 - ((n - cy) / span) * innerH,
  };
}

function Svg({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg
      className="svt-plot"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={label}
    >
      {children}
    </svg>
  );
}

interface Marker {
  p: NE;
  label: string;
  /** "known" stations are filled accent; "result" points are highlighted. */
  kind?: "known" | "result" | "ref";
}

function Station({ s, m }: { s: Scale; m: Marker }) {
  const color =
    m.kind === "result" ? "var(--color-success)" : m.kind === "ref" ? "var(--text-muted)" : "var(--accent)";
  const r = m.kind === "result" ? 5 : 4;
  return (
    <>
      <circle cx={s.x(m.p.e)} cy={s.y(m.p.n)} r={r} fill={color} />
      <text
        x={s.x(m.p.e) + 7}
        y={s.y(m.p.n) - 6}
        fontSize="11"
        fill="var(--text-h)"
        style={{ fontWeight: 600 }}
      >
        {m.label}
      </text>
    </>
  );
}

function line(s: Scale, a: NE, b: NE) {
  return { x1: s.x(a.e), y1: s.y(a.n), x2: s.x(b.e), y2: s.y(b.n) };
}

/** Polar / forward: start → new point along a bearing. */
export function PolarDiagram({ start, end }: { start: NE; end: NE }) {
  const s = makeScale([start, end]);
  const l = line(s, start, end);
  // A short north arrow at the start to convey azimuth reference.
  const nx = s.x(start.e);
  const ny = s.y(start.n);
  return (
    <Svg label="Polar forward computation">
      <line x1={nx} y1={ny} x2={nx} y2={ny - 34} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3" />
      <text x={nx + 3} y={ny - 34} fontSize="10" fill="var(--text-muted)">N</text>
      <line {...l} stroke="var(--accent)" strokeWidth="2" />
      <Station s={s} m={{ p: start, label: "From", kind: "known" }} />
      <Station s={s} m={{ p: end, label: "New", kind: "result" }} />
    </Svg>
  );
}

/** Join / inverse: line between two known points. */
export function JoinDiagram({ a, b }: { a: NE; b: NE }) {
  const s = makeScale([a, b]);
  const ax = s.x(a.e);
  const ay = s.y(a.n);
  return (
    <Svg label="Join inverse computation">
      <line x1={ax} y1={ay} x2={ax} y2={ay - 30} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3" />
      <text x={ax + 3} y={ay - 30} fontSize="10" fill="var(--text-muted)">N</text>
      <line {...line(s, a, b)} stroke="var(--accent)" strokeWidth="2" />
      <Station s={s} m={{ p: a, label: "P1", kind: "known" }} />
      <Station s={s} m={{ p: b, label: "P2", kind: "known" }} />
    </Svg>
  );
}

/** Intersection: two stations plus rays/arcs meeting at the fixed point. */
export function IntersectionDiagram({
  a,
  b,
  fix,
  mode,
  r1,
  r2,
}: {
  a: NE;
  b: NE;
  fix: NE | null;
  mode: "bearing" | "distance";
  r1?: number;
  r2?: number;
}) {
  const pts = [a, b, ...(fix ? [fix] : [])];
  const s = makeScale(pts);
  return (
    <Svg label="Intersection computation">
      {fix && <line {...line(s, a, fix)} stroke="var(--accent)" strokeWidth="1.5" />}
      {fix && <line {...line(s, b, fix)} stroke="var(--accent)" strokeWidth="1.5" />}
      <line {...line(s, a, b)} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 3" />
      {mode === "distance" && r1 != null && fix && (
        <circle cx={s.x(a.e)} cy={s.y(a.n)} r={Math.abs(s.x(a.e) - s.x(a.e + r1))} fill="none" stroke="var(--border)" strokeWidth="1" />
      )}
      {mode === "distance" && r2 != null && fix && (
        <circle cx={s.x(b.e)} cy={s.y(b.n)} r={Math.abs(s.x(b.e) - s.x(b.e + r2))} fill="none" stroke="var(--border)" strokeWidth="1" />
      )}
      <Station s={s} m={{ p: a, label: "A", kind: "known" }} />
      <Station s={s} m={{ p: b, label: "B", kind: "known" }} />
      {fix && <Station s={s} m={{ p: fix, label: "P", kind: "result" }} />}
    </Svg>
  );
}

/** Resection: triangle of known stations with the observer inside. */
export function ResectionDiagram({ a, b, c, p }: { a: NE; b: NE; c: NE; p: NE | null }) {
  const pts = [a, b, c, ...(p ? [p] : [])];
  const s = makeScale(pts);
  const tri =
    `M ${s.x(a.e)} ${s.y(a.n)} L ${s.x(b.e)} ${s.y(b.n)} L ${s.x(c.e)} ${s.y(c.n)} Z`;
  return (
    <Svg label="Resection computation">
      <path d={tri} fill="color-mix(in oklab, var(--accent) 8%, transparent)" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 3" />
      {p && <line {...line(s, p, a)} stroke="var(--accent)" strokeWidth="1.3" />}
      {p && <line {...line(s, p, b)} stroke="var(--accent)" strokeWidth="1.3" />}
      {p && <line {...line(s, p, c)} stroke="var(--accent)" strokeWidth="1.3" />}
      <Station s={s} m={{ p: a, label: "A", kind: "known" }} />
      <Station s={s} m={{ p: b, label: "B", kind: "known" }} />
      <Station s={s} m={{ p: c, label: "C", kind: "known" }} />
      {p && <Station s={s} m={{ p, label: "P", kind: "result" }} />}
    </Svg>
  );
}
