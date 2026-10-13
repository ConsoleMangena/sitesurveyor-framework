import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CadModelState, CadSelection, CadToolId, SelectedItem, SurveyEllipse, Viewport } from "./cadModel.ts";
import { canvasColor, isSelected, resolveColor, selectionFromItems } from "./cadModel.ts";
import {
  fitToBox,
  niceGridSpacing,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type BBox,
  type ScreenSize,
} from "./cadViewportMath.ts";
import { inverse } from "./survey/cogo.ts";
import { fmtBearing, fmtDistance, type BearingFormat } from "./survey/format.ts";
import { sampleZ } from "./survey/surface.ts";
import { axisBadgeLabels, type AxisConvention } from "./cadSettings.ts";
import { buildCodeTable, resolveFeature } from "./survey/featureCodes.ts";
import { symbolMarkup } from "./survey/symbols.ts";
import { applyGridSnap, findOsnapHit, orthoConstraint, type OsnapHit } from "./viewport/snapping.ts";
import { boxSelect, pickEntityAt } from "./viewport/hitTesting.ts";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

/** Shared feature-code table for resolving point symbols in the viewport. */
const VIEWPORT_CODE_TABLE = buildCodeTable();

interface CadViewportProps {
  model: CadModelState;
  tool: CadToolId;
  selection: CadSelection;
  bearingFormat: BearingFormat;
  snap: boolean;
  ortho: boolean;
  showGrid: boolean;
  osnap: boolean;
  /** When true, snap spacing tracks the zoom-dependent grid; else uses `snapSpacing`. */
  snapAuto?: boolean;
  /** Fixed snap spacing (survey units) used when `snapAuto` is false. */
  snapSpacing?: number;
  /** Decimal places for the on-canvas coordinate readout. */
  coordDecimals?: number;
  /** Axis-label convention for the coordinate readout / WCS icon. */
  axisConvention?: AxisConvention;
  /** Show point number/code labels next to survey points. */
  showPointLabels?: boolean;
  /** Show spot elevations (RL) next to survey points. */
  showPointElevations?: boolean;
  /** Show bearing/distance labels along linework segments. */
  showSegmentLabels?: boolean;
  onCursorMove: (world: { n: number; e: number }) => void;
  onPickPoint: (world: { n: number; e: number }) => void;
  onSelectEntity: (sel: CadSelection) => void;
  pendingVertices: { n: number; e: number }[];
  fitSignal: number;
  /** Bumping this applies `scaleTarget` (screen px per survey unit) to the view. */
  scaleSignal?: number;
  /** Screen pixels per survey unit to apply when `scaleSignal` changes. */
  scaleTarget?: number;
  onScaleChange?: (label: string) => void;
  onCommit?: () => void;
  onContextMenu?: (ev: React.MouseEvent) => void;
  /** Forwarded so keyboard shortcuts (Delete, Esc, etc.) work while the
   *  viewport itself holds focus after a pick. */
  onKeyDown?: (ev: React.KeyboardEvent) => void;
  /** Called when the user submits a value from the dynamic cursor input. */
  onDynInput?: (value: string) => void;
}

type World = { n: number; e: number };
interface CursorInfo {
  x: number;
  y: number;
  lines: string[];
}

const DRAG_THRESHOLD = 4;
const TOOL_LABELS: Record<CadToolId, string> = {
  select: "Select",
  pan: "Pan",
  point: "Point",
  "control-point": "Control Point",
  line: "Line",
  boundary: "Boundary",
  text: "Text",
  "spot-height": "Spot Height",
  measure: "Measure",
  move: "Move",
  copy: "Copy",
  rotate: "Rotate",
  scale: "Scale",
  mirror: "Mirror",
  offset: "Offset",
  "dim-linear": "Dimension",
  circle: "Circle",
  arc: "Arc",
  "zoom-window": "Zoom Window",
};
const CROSSHAIR_GAP = 4;

/** Clamp label font size so text stays legible at high zoom but does not
 *  dominate the canvas when zoomed out. */
function labelFontSize(scale: number, base: number): number {
  return Math.max(7, Math.min(base, base * Math.min(1, scale / 4)));
}

function formatGridLabel(value: number, spacing: number): string {
  const decimals = spacing >= 1 ? 0 : 1;
  return value.toFixed(decimals);
}

const CadViewportComponent = memo(function CadViewport({
  model,
  tool,
  selection,
  bearingFormat,
  snap,
  ortho,
  showGrid,
  osnap,
  snapAuto = true,
  snapSpacing = 1,
  coordDecimals = 3,
  axisConvention = "yx",
  showPointLabels = true,
  showPointElevations = false,
  showSegmentLabels = false,
  onCursorMove,
  onPickPoint,
  onSelectEntity,
  pendingVertices,
  fitSignal,
  scaleSignal = 0,
  scaleTarget,
  onScaleChange,
  onCommit,
  onContextMenu,
  onKeyDown,
  onDynInput,
}: CadViewportProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ScreenSize>({ width: 800, height: 600 });
  const [vp, setVp] = useState<Viewport>({ scale: 4, centerN: 0, centerE: 0 });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [osnapHit, setOsnapHit] = useState<OsnapHit | null>(null);
  const [resolvedWorld, setResolvedWorld] = useState<World | null>(null);
  const [selRect, setSelRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [cursorInfo, setCursorInfo] = useState<CursorInfo | null>(null);
  const dynInputRef = useRef<HTMLInputElement>(null);

  const isChainTool = tool === "line" || tool === "boundary";
  const showDynInput = isChainTool && pendingVertices.length > 0 && onDynInput != null;

  useEffect(() => {
    if (showDynInput) dynInputRef.current?.focus();
  }, [showDynInput, pendingVertices.length]);

  const didInitialFit = useRef(false);
  const selStartRef = useRef<{ x: number; y: number } | null>(null);

  const pressRef = useRef<{
    x: number; y: number; button: number;
    vp: Viewport; panning: boolean; moved: boolean;
  } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bbox = useMemo<BBox | null>(() => {
    // Running min/max — spreading millions of vertices into Math.min(...ns)
    // overflows the call stack on any sizeable topographic model.
    let minN = Infinity, maxN = -Infinity, minE = Infinity, maxE = -Infinity;
    const push = (n: number, e: number) => {
      if (!Number.isFinite(n) || !Number.isFinite(e)) return;
      if (n < minN) minN = n;
      if (n > maxN) maxN = n;
      if (e < minE) minE = e;
      if (e > maxE) maxE = e;
    };
    for (const p of model.points) { push(p.n, p.e); }
    for (const lw of model.linework) {
      for (const v of lw.vertices) { push(v.n, v.e); }
    }
    for (const t of model.texts) { push(t.n, t.e); }
    for (const srf of model.surfaces) {
      if (!Array.isArray(srf.points)) continue;
      for (const v of srf.points) { push(v.n, v.e); }
    }
    for (const a of model.arcs) {
      if (!Number.isFinite(a.radius)) continue;
      // Approximate tight bbox by sampling the arc; use 16 segments for fit.
      const r = a.radius;
      let s = a.startAngle;
      while (s < 0) s += 360;
      let e = a.endAngle;
      while (e < s) e += 360;
      const steps = Math.max(2, Math.floor((e - s) / 30));
      for (let i = 0; i <= steps; i++) {
        const ang = (s + (e - s) * (i / steps)) * (Math.PI / 180);
        push(a.center.n + Math.sin(ang) * r, a.center.e + Math.cos(ang) * r);
      }
      push(a.center.n, a.center.e);
    }
    for (const c of model.circles) {
      if (!Number.isFinite(c.radius)) continue;
      push(c.center.n - c.radius, c.center.e - c.radius);
      push(c.center.n + c.radius, c.center.e + c.radius);
    }
    for (const el of model.ellipses) {
      if (!Number.isFinite(el.semiMajor) || !Number.isFinite(el.semiMinor)) continue;
      const rot = el.rotation * (Math.PI / 180);
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2;
        const x = el.semiMajor * Math.cos(t);
        const y = el.semiMinor * Math.sin(t);
        push(el.center.n + x * sinR + y * cosR, el.center.e + x * cosR - y * sinR);
      }
      push(el.center.n, el.center.e);
    }
    for (const d of model.dimensions) {
      push(d.textPosition.n, d.textPosition.e);
      for (const v of d.defPoints) push(v.n, v.e);
    }
    for (const h of model.hatches) {
      for (const v of h.vertices) push(v.n, v.e);
      for (const hole of h.holes ?? []) {
        for (const v of hole) push(v.n, v.e);
      }
    }
    if (!Number.isFinite(minN)) return null;
    return { minN, maxN, minE, maxE };
  }, [model.points, model.linework, model.texts, model.surfaces, model.arcs, model.circles, model.ellipses, model.dimensions, model.hatches]);

  useEffect(() => {
    if (didInitialFit.current) return;
    if (size.width < 10 || size.height < 10) return;
    if (!bbox) return;
    const id = window.setTimeout(() => {
      setVp(fitToBox(bbox, size));
      didInitialFit.current = true;
    }, 0);
    return () => window.clearTimeout(id);
  }, [bbox, size]);

  useEffect(() => {
    if (fitSignal === 0) return;
    const id = window.setTimeout(() => {
      if (bbox) {
        setVp(fitToBox(bbox, size));
      } else {
        setVp({ scale: 4, centerN: 0, centerE: 0 });
      }
      didInitialFit.current = true;
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  // Apply a user-requested scale (screen px per survey unit) about the view
  // centre, keeping the current centre fixed.
  useEffect(() => {
    if (scaleSignal === 0 || !scaleTarget || scaleTarget <= 0) return;
    const id = window.setTimeout(() => {
      setVp((v) => ({ ...v, scale: scaleTarget }));
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaleSignal]);

  const localPoint = (clientX: number, clientY: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const applySnap = useCallback(
    (world: World): World => {
      const spacing = snapAuto || !(snapSpacing > 0) ? niceGridSpacing(vp) : snapSpacing;
      return applyGridSnap(world, spacing, snap);
    },
    [snap, snapAuto, snapSpacing, vp],
  );

  const applyOrtho = useCallback(
    (world: World): World =>
      orthoConstraint(
        world,
        ortho && pendingVertices.length > 0 ? pendingVertices[pendingVertices.length - 1] : null,
      ),
    [ortho, pendingVertices],
  );

  const visibleLayer = useCallback(
    (layerId: string) => {
      const l = model.layers.find((x) => x.id === layerId);
      return !l || l.visible;
    },
    [model.layers],
  );

  /**
   * Entities on a locked layer stay visible but cannot be selected or edited
   * (AutoCAD behaviour). Hidden layers are excluded too.
   */
  const selectableLayer = useCallback(
    (layerId: string) => {
      const l = model.layers.find((x) => x.id === layerId);
      return !l || (l.visible && !l.locked);
    },
    [model.layers],
  );

  const findOsnap = useCallback(
    (x: number, y: number): OsnapHit | null => {
      if (!osnap) return null;
      return findOsnapHit(model, (w) => worldToScreen(w.n, w.e, vp, size), x, y);
    },
    [osnap, model, vp, size],
  );

  const resolveWorld = useCallback(
    (x: number, y: number): World => {
      const osnapped = findOsnap(x, y);
      if (osnapped) return applyOrtho(osnapped.world);
      const raw = screenToWorld(x, y, vp, size);
      return applyOrtho(applySnap(raw));
    },
    [findOsnap, applyOrtho, applySnap, vp, size],
  );

  /** Sample an ellipse into screen-space polyline points for rendering / picking. */
  const sampleEllipseScreen = useCallback((
    el: SurveyEllipse,
    steps: number,
  ): { x: number; y: number }[] => {
    const pts: { x: number; y: number }[] = [];
    if (!(Number.isFinite(el.semiMajor) && Number.isFinite(el.semiMinor))) return pts;
    const rot = el.rotation * (Math.PI / 180);
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const count = Math.max(steps, 8);
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2;
      const x = el.semiMajor * Math.cos(t);
      const y = el.semiMinor * Math.sin(t);
      pts.push(worldToScreen(
        el.center.n + x * sinR + y * cosR,
        el.center.e + x * cosR - y * sinR,
        vp,
        size,
      ));
    }
    return pts;
  }, [vp, size]);

  const hitTest = useCallback(
    (x: number, y: number): CadSelection => {
      const hit = pickEntityAt(
        model,
        visibleLayer,
        selectableLayer,
        (w) => worldToScreen(w.n, w.e, vp, size),
        x,
        y,
      );
      return hit ? { type: hit.type, id: hit.id } : { type: null, id: null };
    },
    [model, visibleLayer, selectableLayer, vp, size],
  );

  /**
   * AutoCAD-style box selection. Dragging left→right is a WINDOW selection
   * (entities must be fully enclosed); right→left is a CROSSING selection
   * (entities that are enclosed OR cross the box). Returns every match.
   */
  const entitiesInRect = useCallback(
    (x1: number, y1: number, x2: number, y2: number): SelectedItem[] =>
      boxSelect(
        model,
        selectableLayer,
        (w) => worldToScreen(w.n, w.e, vp, size),
        { x: x1, y: y1 },
        { x: x2, y: y2 },
        x2 < x1, // right-to-left drag → crossing
      ),
    [model, selectableLayer, vp, size],
  );

  const handleMouseDown = (ev: React.MouseEvent) => {
    const { x, y } = localPoint(ev.clientX, ev.clientY);
    wrapRef.current?.focus();
    const startPan = ev.button === 1 || (ev.button === 0 && tool === "pan");
    pressRef.current = { x, y, button: ev.button, vp, panning: startPan, moved: false };

    if (ev.button === 0 && (tool === "select" || tool === "zoom-window")) {
      const hit = tool === "select" ? hitTest(x, y) : { type: null, id: null };
      if (hit.type === null) {
        selStartRef.current = { x, y };
        setSelRect({ x1: x, y1: y, x2: x, y2: y });
      }
    }
  };

  // Keep transient pointer data in refs and throttle React updates to one
  // requestAnimationFrame. This prevents the whole SVG from reconciling on
  // every mousemove event while keeping cursor feedback snappy.
  const latestMouseRef = useRef<{ x: number; y: number } | null>(null);
  const rafQueuedRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const processMouseMoveRef = useRef<() => void>(() => {});

  processMouseMoveRef.current = () => {
    rafQueuedRef.current = false;
    const pos = latestMouseRef.current;
    if (!pos) return;
    const { x, y } = pos;

    setCursor({ x, y });

    const press = pressRef.current;
    if (press) {
      if (Math.hypot(x - press.x, y - press.y) > DRAG_THRESHOLD) press.moved = true;
      const canDragPan = press.panning || press.button === 1;
      if (canDragPan && press.moved) {
        const dx = x - press.x;
        const dy = y - press.y;
        setVp({
          scale: press.vp.scale,
          centerE: press.vp.centerE - dx / press.vp.scale,
          centerN: press.vp.centerN + dy / press.vp.scale,
        });
        setCursorInfo(null);
        return;
      }
    }

    const snapHit = findOsnap(x, y);
    setOsnapHit(snapHit);

    const world = resolveWorld(x, y);
    setResolvedWorld(world);
    onCursorMove(world);

    if (selStartRef.current) {
      const { x: sx, y: sy } = selStartRef.current;
      setSelRect({ x1: sx, y1: sy, x2: x, y2: y });
      setCursorInfo(null);
      return;
    }

    const info: CursorInfo = { x, y, lines: [] };
    // Axis labels follow the selected convention. Default `"yx"` is the Zimbabwe
    // Gauss Conform (Lo.) convention: Y = Easting/westing, X = Northing/southing.
    const ax = axisBadgeLabels(axisConvention);
    info.lines.push(`${ax.easting}: ${world.e.toFixed(coordDecimals)}`);
    info.lines.push(`${ax.northing}: ${world.n.toFixed(coordDecimals)}`);

    if (tool === "spot-height") {
      let z: number | null = null;
      if (model.surfaces.length > 0) {
        const surface = model.surfaces[model.surfaces.length - 1];
        z = sampleZ({ points: surface.points, triangles: surface.triangles }, world.n, world.e);
      }
      if (z !== null) {
        info.lines.push(`RL: ${z.toFixed(coordDecimals)}`);
      } else {
        info.lines.push(`RL: --`);
      }
    }

    if (pendingVertices.length > 0 && (tool === "line" || tool === "boundary" || tool === "measure")) {
      const last = pendingVertices[pendingVertices.length - 1];
      const inv = inverse(last, world);
      info.lines.push(`${fmtBearing(inv.azimuth, bearingFormat)}`);
      info.lines.push(`${fmtDistance(inv.distance)}`);
    }

    setCursorInfo(info);
  };

  const scheduleMouseUpdate = useCallback(() => {
    if (rafQueuedRef.current) return;
    rafQueuedRef.current = true;
    rafIdRef.current = requestAnimationFrame(() => processMouseMoveRef.current());
  }, []);

  const cancelMouseUpdate = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    rafQueuedRef.current = false;
  }, []);

  const handleMouseMove = (ev: React.MouseEvent) => {
    const { x, y } = localPoint(ev.clientX, ev.clientY);
    latestMouseRef.current = { x, y };
    scheduleMouseUpdate();
  };

  /** Merge new items into the existing selection (additive when Shift held). */
  const commitSelection = useCallback(
    (newItems: SelectedItem[], additive: boolean) => {
      const existing = selection.items ?? (selection.type && selection.id
        ? [{ type: selection.type, id: selection.id } as SelectedItem]
        : []);
      if (!additive) {
        onSelectEntity(selectionFromItems(newItems));
        return;
      }
      // Shift toggles each clicked entity in/out of the set.
      const map = new Map(existing.map((it) => [`${it.type}:${it.id}`, it]));
      for (const it of newItems) {
        const key = `${it.type}:${it.id}`;
        if (map.has(key)) map.delete(key);
        else map.set(key, it);
      }
      onSelectEntity(selectionFromItems([...map.values()]));
    },
    [selection, onSelectEntity],
  );

  const handleMouseUp = (ev: React.MouseEvent) => {
    const press = pressRef.current;
    pressRef.current = null;
    if (!press) return;
    const additive = ev.shiftKey;

    if (selStartRef.current) {
      const start = selStartRef.current;
      selStartRef.current = null;
      setSelRect(null);

      const { x: ex, y: ey } = localPoint(ev.clientX, ev.clientY);
      const dx = Math.abs(ex - start.x);
      const dy = Math.abs(ey - start.y);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        if (tool === "zoom-window") {
          const minX = Math.min(start.x, ex), maxX = Math.max(start.x, ex);
          const minY = Math.min(start.y, ey), maxY = Math.max(start.y, ey);
          const sw = screenToWorld(minX, maxY, vp, size);
          const ne = screenToWorld(maxX, minY, vp, size);
          const box: BBox = { minN: sw.n, maxN: ne.n, minE: sw.e, maxE: ne.e };
          setVp(fitToBox(box, size));
          return;
        }
        const hits = entitiesInRect(start.x, start.y, ex, ey);
        commitSelection(hits, additive);
        return;
      }
    }

    if (press.button !== 0) return;
    if (press.moved) return;

    const { x, y } = localPoint(ev.clientX, ev.clientY);
    if (tool === "pan") return;
    if (tool === "zoom-window") return;

    if (tool === "select") {
      const hit = hitTest(x, y);
      if (hit.type && hit.id) {
        commitSelection([{ type: hit.type, id: hit.id }], additive);
      } else if (!additive) {
        onSelectEntity({ type: null, id: null, items: [] });
      }
      return;
    }

    onPickPoint(resolveWorld(x, y));
  };

  const handleMouseLeave = () => {
    cancelMouseUpdate();
    latestMouseRef.current = null;
    pressRef.current = null;
    selStartRef.current = null;
    setSelRect(null);
    setCursor(null);
    setOsnapHit(null);
    setResolvedWorld(null);
    setCursorInfo(null);
  };

  // Cancel any pending cursor update when the component unmounts.
  useEffect(() => () => cancelMouseUpdate(), [cancelMouseUpdate]);

  const handleWheel = (ev: React.WheelEvent) => {
    const { x, y } = localPoint(ev.clientX, ev.clientY);
    const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
    setVp((v) => zoomAt(v, factor, x, y, size));
  };

  const handleDoubleClick = () => onCommit?.();

  const handleZoomIn = useCallback(() => {
    setVp((v) => zoomAt(v, 1.4, size.width / 2, size.height / 2, size));
  }, [size]);

  const handleZoomOut = useCallback(() => {
    setVp((v) => zoomAt(v, 1 / 1.4, size.width / 2, size.height / 2, size));
  }, [size]);

  const handleZoomExtents = useCallback(() => {
    if (bbox) {
      setVp(fitToBox(bbox, size));
    } else {
      setVp({ scale: 4, centerN: 0, centerE: 0 });
    }
  }, [bbox, size]);

  const handleContextMenuInner = (ev: React.MouseEvent) => {
    ev.preventDefault();
    onContextMenu?.(ev);
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  /**
   * AutoCAD-style grid: major grid lines plus dotted intersections.
   * Minor grid lines are omitted so the canvas stays clean and readable.
   */
  const gridElements = useMemo(() => {
    if (!showGrid) return null;
    const spacing = niceGridSpacing(vp);
    const majorEvery = 5;
    const tl = screenToWorld(0, 0, vp, size);
    const br = screenToWorld(size.width, size.height, vp, size);
    const startE = Math.floor(Math.min(tl.e, br.e) / spacing) * spacing;
    const endE = Math.ceil(Math.max(tl.e, br.e) / spacing) * spacing;
    const startN = Math.floor(Math.min(tl.n, br.n) / spacing) * spacing;
    const endN = Math.ceil(Math.max(tl.n, br.n) / spacing) * spacing;

    // Draw full grid only up to a reasonable density so very tight zoom levels
    // do not explode the DOM. Beyond that, fall back to just the major axes.
    const eCount = (endE - startE) / spacing;
    const nCount = (endN - startN) / spacing;
    const maxLines = 2000;
    const showMinor = eCount <= maxLines && nCount <= maxLines;

    const elements: React.ReactNode[] = [];
    const majorEs: number[] = [];
    const majorNs: number[] = [];
    let minorVerticalD = "";
    let minorHorizontalD = "";

    for (let e = startE; e <= endE; e += spacing) {
      const idx = Math.round(e / spacing);
      const major = idx % majorEvery === 0;
      const axis = Math.abs(e) < 1e-9;
      const a = worldToScreen(startN, e, vp, size);
      const b = worldToScreen(endN, e, vp, size);
      if (axis || major) {
        if (major) majorEs.push(e);
        elements.push(
          <line
            key={`ve-${e}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={axis ? "var(--cad-text-dim)" : "var(--cad-grid-major)"}
            strokeWidth={axis ? 1.5 : 0.9}
            opacity={axis ? 0.9 : 0.85}
          />,
        );
      } else if (showMinor) {
        minorVerticalD += `M${a.x.toFixed(2)},${a.y.toFixed(2)} L${b.x.toFixed(2)},${b.y.toFixed(2)} `;
      }
    }
    for (let n = startN; n <= endN; n += spacing) {
      const idx = Math.round(n / spacing);
      const major = idx % majorEvery === 0;
      const axis = Math.abs(n) < 1e-9;
      const a = worldToScreen(n, startE, vp, size);
      const b = worldToScreen(n, endE, vp, size);
      if (axis || major) {
        if (major) majorNs.push(n);
        elements.push(
          <line
            key={`hn-${n}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={axis ? "var(--cad-text-dim)" : "var(--cad-grid-major)"}
            strokeWidth={axis ? 1.5 : 0.9}
            opacity={axis ? 0.9 : 0.85}
          />,
        );
      } else if (showMinor) {
        minorHorizontalD += `M${a.x.toFixed(2)},${a.y.toFixed(2)} L${b.x.toFixed(2)},${b.y.toFixed(2)} `;
      }
    }

    if (showMinor && minorVerticalD) {
      elements.push(
        <path
          key="minor-v"
          d={minorVerticalD}
          fill="none"
          stroke="var(--cad-grid)"
          strokeWidth={0.45}
          opacity={0.55}
        />,
      );
    }
    if (showMinor && minorHorizontalD) {
      elements.push(
        <path
          key="minor-h"
          d={minorHorizontalD}
          fill="none"
          stroke="var(--cad-grid)"
          strokeWidth={0.45}
          opacity={0.55}
        />,
      );
    }

    // Dotted grid at every major intersection.
    let dotKey = 0;
    for (const e of majorEs) {
      for (const n of majorNs) {
        const s = worldToScreen(n, e, vp, size);
        elements.push(
          <circle
            key={`dot-${dotKey++}`}
            cx={s.x}
            cy={s.y}
            r={1.4}
            fill="var(--cad-grid-major)"
            opacity={0.7}
          />,
        );
      }
    }

    // Coordinate labels along the left and bottom edges. Density is throttled
    // so labels do not overlap when zoomed out, and font size scales down with
    // the viewport so the numbers stay readable without dominating the canvas.
    const bottomN = Math.min(tl.n, br.n);
    const leftE = Math.min(tl.e, br.e);
    const maxAxisLabels = 24;
    const labelStepE = Math.max(1, Math.ceil(majorEs.length / maxAxisLabels));
    const labelStepN = Math.max(1, Math.ceil(majorNs.length / maxAxisLabels));
    const gridFontSize = labelFontSize(vp.scale, 10);

    for (let i = 0; i < majorEs.length; i += labelStepE) {
      const e = majorEs[i];
      const s = worldToScreen(bottomN, e, vp, size);
      elements.push(
        <text
          key={`el-${e}`}
          x={s.x}
          y={size.height - 6}
          fontSize={gridFontSize}
          fill="var(--cad-text-dim)"
          textAnchor="middle"
          className="cad-grid-label"
        >
          {formatGridLabel(e, spacing)}
        </text>,
      );
    }
    for (let i = 0; i < majorNs.length; i += labelStepN) {
      const n = majorNs[i];
      const s = worldToScreen(n, leftE, vp, size);
      elements.push(
        <text
          key={`nl-${n}`}
          x={8}
          y={s.y - 4}
          fontSize={gridFontSize}
          fill="var(--cad-text-dim)"
          textAnchor="start"
          className="cad-grid-label"
        >
          {formatGridLabel(n, spacing)}
        </text>,
      );
    }

    return elements;
  }, [showGrid, vp, size]);

  const surfaceElements = useMemo(() => {
    return model.surfaces.map((srf) => {
      if (!srf.visible) return null;
      if (!visibleLayer(srf.layerId)) return null;
      if (!Array.isArray(srf.points) || !Array.isArray(srf.triangles)) return null;
      const layer = model.layers.find((l) => l.id === srf.layerId);
      const selected = isSelected(selection, "surface", srf.id);
      const color = canvasColor(selected ? "#5cc3ff" : layer?.color ?? "#5cc3ff");
      const screen = srf.points.map((v) => worldToScreen(v.n, v.e, vp, size));

      // Batch all triangles into one fill path and one stroke path per surface.
      // This avoids thousands of individual <polygon> DOM nodes, which is the
      // main bottleneck when displaying dense TIN surfaces.
      let fillD = "";
      let strokeD = "";
      for (const t of srf.triangles) {
        const a = screen[t.a];
        const b = screen[t.b];
        const c = screen[t.c];
        if (!a || !b || !c) continue;
        const tri = `M${a.x.toFixed(2)},${a.y.toFixed(2)} L${b.x.toFixed(2)},${b.y.toFixed(2)} L${c.x.toFixed(2)},${c.y.toFixed(2)} Z`;
        if (selected) fillD += tri;
        strokeD += tri;
      }

      return (
        <g key={srf.id} opacity={selected ? 0.85 : 0.5}>
          {selected && fillD && (
            <path
              d={fillD}
              fill="rgba(92, 195, 255, 0.08)"
              stroke="none"
            />
          )}
          {strokeD && (
            <path
              d={strokeD}
              fill="none"
              stroke={color}
              strokeWidth={selected ? 1 : 0.5}
            />
          )}
        </g>
      );
    });
  }, [model.surfaces, model.layers, visibleLayer, selection, vp, size]);

  const lineworkElements = useMemo(() => {
    return model.linework.map((lw) => {
      if (!visibleLayer(lw.layerId)) return null;
      const layer = model.layers.find((l) => l.id === lw.layerId);
      const color = canvasColor(resolveColor(lw.color, layer?.color, "#334155"));
      const pts = lw.vertices.map((v) => worldToScreen(v.n, v.e, vp, size));
      if (!pts.length) return null;
      const d =
        pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") +
        (lw.closed ? " Z" : "");
      const selected = isSelected(selection, "linework", lw.id);

      const isContour = lw.layerId === "CONTOURS" || lw.layerId === "CONTOURS_INDEX";
      const isIndexContour = lw.layerId === "CONTOURS_INDEX";
      const baseW = isIndexContour
        ? 2.0
        : lw.kind === "boundary" ? 2.4 : lw.kind === "polyline" ? 1.6 : 1.2;
      const sw = selected ? baseW + 0.8 : baseW;

      const labels: React.ReactNode[] = [];
      if (showSegmentLabels && !isContour) {
        for (let i = 1; i < lw.vertices.length; i++) {
          const a = lw.vertices[i - 1];
          const b = lw.vertices[i];
          const inv = inverse(a, b);
          const mid = worldToScreen((a.n + b.n) / 2, (a.e + b.e) / 2, vp, size);
          const angle = Math.atan2(b.e - a.e, b.n - a.n);
          const offX = -Math.sin(angle) * 10;
          const offY = Math.cos(angle) * 10;
          labels.push(
            <text key={`${lw.id}-lbl-${i}`} x={mid.x + offX} y={mid.y + offY - 3}
              fill="var(--cad-entity-text)" stroke="var(--cad-entity-stroke)" strokeWidth={1.5}
              paintOrder="stroke fill" fontSize={labelFontSize(vp.scale, 11)} fontFamily="Arial, 'Helvetica Neue', Helvetica, 'Liberation Sans', sans-serif"
              textAnchor="middle" className="cad-seg-label">
              {fmtBearing(inv.azimuth, bearingFormat)} · {fmtDistance(inv.distance)}
            </text>,
          );
        }
      } else if (lw.label && isIndexContour && lw.vertices.length >= 2) {
        // Show the elevation label once per contour, placed at the midpoint of
        // the polyline and rotated to follow the contour direction.
        const midIdx = Math.floor(lw.vertices.length / 2);
        const va = lw.vertices[Math.max(0, midIdx - 1)];
        const vb = lw.vertices[Math.min(lw.vertices.length - 1, midIdx)];
        const midPt = worldToScreen((va.n + vb.n) / 2, (va.e + vb.e) / 2, vp, size);
        // Rotation angle so text follows the contour. Screen coords: atan2
        // with y inverted because screen Y goes downward.
        const sa = worldToScreen(va.n, va.e, vp, size);
        const sb = worldToScreen(vb.n, vb.e, vp, size);
        let angleDeg = Math.atan2(sb.y - sa.y, sb.x - sa.x) * (180 / Math.PI);
        // Keep text upright (readable left-to-right).
        if (angleDeg > 90) angleDeg -= 180;
        if (angleDeg < -90) angleDeg += 180;
          labels.push(
            <text
              key={`${lw.id}-elev`}
              x={midPt.x}
              y={midPt.y - 4}
              fill="var(--cad-entity-text)"
              stroke="rgba(10,14,20,0.85)" strokeWidth={1.5}
              paintOrder="stroke fill"
              fontSize={labelFontSize(vp.scale, 10)}
              fontWeight={500}
              fontFamily="Arial, 'Helvetica Neue', Helvetica, 'Liberation Sans', sans-serif"
              textAnchor="middle"
              className="cad-seg-label"
              transform={`rotate(${angleDeg.toFixed(1)}, ${midPt.x}, ${midPt.y - 4})`}
            >
              {lw.label}
            </text>,
          );
      }
      return (
        <g key={lw.id}>
          {selected && (
            <path
              d={d}
              fill={lw.closed ? "rgba(92, 195, 255, 0.08)" : "none"}
              stroke="#5cc3ff"
              strokeWidth={sw + 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.55}
            />
          )}
          <path d={d} fill={lw.closed ? `${color}18` : "none"} stroke={color}
            strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          {selected && pts.map((p, i) => (
            <rect key={`vh-${i}`} x={p.x - 4} y={p.y - 4} width={8} height={8}
              fill="none" stroke="#2b9ed8" strokeWidth={1.5} rx={0} />
          ))}
          {labels}
        </g>
      );
    });
  }, [model.linework, model.layers, visibleLayer, selection, vp, size, showSegmentLabels, bearingFormat]);

  const pointElements = useMemo(() => {
    return model.points.map((p) => {
      if (!visibleLayer(p.layerId)) return null;
      const layer = model.layers.find((l) => l.id === p.layerId);
      const color = canvasColor(resolveColor(p.color, layer?.color, "#0ea5e9"));
      const s = worldToScreen(p.n, p.e, vp, size);
      const selected = isSelected(selection, "point", p.id);
      const feature = resolveFeature(p.code, VIEWPORT_CODE_TABLE);
      const symR = selected ? 6 : 5;
      return (
        <g key={p.id}>
          {selected && (
            <rect x={s.x - 6} y={s.y - 6} width={12} height={12} fill="none"
              stroke="#5cc3ff" strokeWidth={1.5} rx={1} />
          )}
          {feature.symbol === "dot" ? (
            <circle cx={s.x} cy={s.y} r={selected ? 4.5 : 3.5} fill={color}
              stroke={selected ? "#f0f0f8" : "none"} strokeWidth={selected ? 1.5 : 0} />
          ) : (
            <g
              transform={`translate(${s.x} ${s.y})`}
              stroke={color}
              strokeWidth={1.3}
              fill={color}
              dangerouslySetInnerHTML={{ __html: symbolMarkup(feature.symbol, symR) }}
            />
          )}
          {showPointLabels && (
            <text x={s.x + 7} y={s.y - 5} fill="var(--cad-entity-text)" stroke="var(--cad-entity-stroke)" strokeWidth={1.5}
              paintOrder="stroke fill" fontSize={labelFontSize(vp.scale, 11)}
              fontFamily="Arial, 'Helvetica Neue', Helvetica, 'Liberation Sans', sans-serif">
              {p.pointNo}{p.code ? ` ${p.code}` : ""}
            </text>
          )}
          {showPointElevations && p.z != null && (
            <text x={s.x + 7} y={s.y + (showPointLabels ? 8 : -5)} fill="var(--cad-entity-text)" stroke="var(--cad-entity-stroke)" strokeWidth={1.5}
              paintOrder="stroke fill" fontSize={labelFontSize(vp.scale, 10)} opacity={0.85}
              fontFamily="Arial, 'Helvetica Neue', Helvetica, 'Liberation Sans', sans-serif">
              {p.z.toFixed(2)}
            </text>
          )}
        </g>
      );
    });
  }, [model.points, model.layers, visibleLayer, selection, vp, size, showPointLabels, showPointElevations]);

  const textElements = useMemo(() => {
    return model.texts.map((t) => {
      if (!visibleLayer(t.layerId)) return null;
      const layer = model.layers.find((l) => l.id === t.layerId);
      const s = worldToScreen(t.n, t.e, vp, size);
      const selected = isSelected(selection, "text", t.id);
      const baseColor = canvasColor(resolveColor(t.color, layer?.color, "#334155"));
      // DXF text height is in drawing/world units. Scale it by the viewport so
      // text stays the correct size relative to the geometry. Clamp the screen
      // size so labels never become huge when zoomed out or unreadably small.
      const worldHeight = t.height && t.height > 0 ? t.height : 2.5;
      const fontSize = Math.max(7, Math.min(24, worldHeight * vp.scale));
      const rotation = t.rotation ?? 0;
      const transform = rotation !== 0
        ? `rotate(${(-rotation).toFixed(1)}, ${s.x.toFixed(1)}, ${s.y.toFixed(1)})`
        : undefined;
      return (
        <text key={t.id} x={s.x} y={s.y}
          fill={selected ? "#5cc3ff" : baseColor}
          stroke="rgba(10,14,20,0.85)" strokeWidth={1.5}
          paintOrder="stroke fill"
          fontSize={fontSize} fontWeight={selected ? 600 : 400}
          fontFamily="Arial, 'Helvetica Neue', Helvetica, 'Liberation Sans', sans-serif"
          transform={transform}>
          {t.text}
        </text>
      );
    });
  }, [model.texts, model.layers, visibleLayer, selection, vp, size]);

  const nativeEntityElements = useMemo(() => {
    const arcToSvg = (a: { center: { n: number; e: number }; radius: number; startAngle: number; endAngle: number }) => {
      const rPx = a.radius * vp.scale;
      const start = worldToScreen(
        a.center.n + Math.sin(a.startAngle * (Math.PI / 180)) * a.radius,
        a.center.e + Math.cos(a.startAngle * (Math.PI / 180)) * a.radius,
        vp,
        size,
      );
      const end = worldToScreen(
        a.center.n + Math.sin(a.endAngle * (Math.PI / 180)) * a.radius,
        a.center.e + Math.cos(a.endAngle * (Math.PI / 180)) * a.radius,
        vp,
        size,
      );
      const center = worldToScreen(a.center.n, a.center.e, vp, size);
      const sweep = end.x * (start.y - center.y) + start.x * (center.y - end.y) + center.x * (end.y - start.y);
      let span = a.endAngle - a.startAngle;
      while (span < 0) span += 360;
      return `M ${start.x} ${start.y} A ${rPx} ${rPx} 0 ${span > 180 ? 1 : 0} ${sweep > 0 ? 0 : 1} ${end.x} ${end.y}`;
    };

    const el: React.ReactNode[] = [];
    for (const h of model.hatches) {
      if (!visibleLayer(h.layerId)) continue;
      const layer = model.layers.find((l) => l.id === h.layerId);
      const color = canvasColor(resolveColor(h.color, layer?.color, "#334155"));
      const selected = isSelected(selection, "hatch", h.id);
      const outer = h.vertices.map((v) => worldToScreen(v.n, v.e, vp, size));
      if (outer.length < 3) continue;
      const parts: string[] = [];
      parts.push(outer.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z");
      for (const hole of h.holes ?? []) {
        const pts = hole.map((v) => worldToScreen(v.n, v.e, vp, size));
        if (pts.length < 3) continue;
        parts.push(pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z");
      }
      el.push(
        <path
          key={h.id}
          d={parts.join(" ")}
          fill={selected ? "rgba(92, 195, 255, 0.15)" : `${color}20`}
          stroke={selected ? "#5cc3ff" : color}
          strokeWidth={selected ? 1.5 : 1}
        />,
      );
    }
    for (const c of model.circles) {
      if (!visibleLayer(c.layerId)) continue;
      const layer = model.layers.find((l) => l.id === c.layerId);
      const color = canvasColor(resolveColor(c.color, layer?.color, "#334155"));
      const s = worldToScreen(c.center.n, c.center.e, vp, size);
      const selected = isSelected(selection, "circle", c.id);
      const rPx = c.radius * vp.scale;
      el.push(
        <g key={c.id}>
          {selected && <circle cx={s.x} cy={s.y} r={rPx} fill="none" stroke="#5cc3ff" strokeWidth={2.5} opacity={0.55} />}
          <circle cx={s.x} cy={s.y} r={rPx} fill="none" stroke={color} strokeWidth={selected ? 1.8 : 1.2} />
        </g>,
      );
    }
    for (const a of model.arcs) {
      if (!visibleLayer(a.layerId)) continue;
      const layer = model.layers.find((l) => l.id === a.layerId);
      const color = canvasColor(resolveColor(a.color, layer?.color, "#334155"));
      const selected = isSelected(selection, "arc", a.id);
      const d = arcToSvg(a);
      el.push(
        <g key={a.id}>
          {selected && <path d={d} fill="none" stroke="#5cc3ff" strokeWidth={2.5} opacity={0.55} strokeLinecap="round" />}
          <path d={d} fill="none" stroke={color} strokeWidth={selected ? 1.8 : 1.2} strokeLinecap="round" />
        </g>,
      );
    }
    for (const ellipse of model.ellipses) {
      if (!visibleLayer(ellipse.layerId)) continue;
      const layer = model.layers.find((l) => l.id === ellipse.layerId);
      const color = canvasColor(resolveColor(ellipse.color, layer?.color, "#334155"));
      const selected = isSelected(selection, "ellipse", ellipse.id);
      const pts = sampleEllipseScreen(ellipse, 48);
      if (pts.length === 0) continue;
      const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";
      el.push(
        <g key={ellipse.id}>
          {selected && <path d={d} fill="none" stroke="#5cc3ff" strokeWidth={2.5} opacity={0.55} />}
          <path d={d} fill="none" stroke={color} strokeWidth={selected ? 1.8 : 1.2} />
        </g>,
      );
    }
    for (const d of model.dimensions) {
      if (!visibleLayer(d.layerId)) continue;
      const layer = model.layers.find((l) => l.id === d.layerId);
      const color = canvasColor(resolveColor(d.color, layer?.color, "#334155"));
      const selected = isSelected(selection, "dimension", d.id);
      const pts = d.defPoints.map((v) => worldToScreen(v.n, v.e, vp, size));
      const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
      const tp = worldToScreen(d.textPosition.n, d.textPosition.e, vp, size);
      el.push(
        <g key={d.id}>
          {path && <path d={path} fill="none" stroke={selected ? "#5cc3ff" : color} strokeWidth={selected ? 2 : 1} strokeDasharray="6 4" />}
          <text
            x={tp.x}
            y={tp.y}
            fill={selected ? "#5cc3ff" : color}
            stroke="rgba(10,14,20,0.85)"
            strokeWidth={1.5}
            paintOrder="stroke fill"
            fontSize={12}
            fontWeight={selected ? 600 : 400}
            fontFamily="Arial, 'Helvetica Neue', Helvetica, 'Liberation Sans', sans-serif"
            textAnchor="middle"
          >
            {d.text}
          </text>
        </g>,
      );
    }
    return el;
  }, [model.arcs, model.circles, model.ellipses, model.dimensions, model.hatches, model.layers, visibleLayer, selection, vp, size, sampleEllipseScreen]);

  const renderPending = () => {
    if (pendingVertices.length === 0) return null;
    const pts = pendingVertices.map((v) => worldToScreen(v.n, v.e, vp, size));

    let rubber = "";
    if (cursor && resolvedWorld) {
      const last = pts[pts.length - 1];
      const target = osnapHit ? osnapHit.screen : worldToScreen(resolvedWorld.n, resolvedWorld.e, vp, size);
      rubber = `M${last.x},${last.y} L${target.x},${target.y}`;
    }
    const placed = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    const endX = cursor && resolvedWorld
      ? (osnapHit ? osnapHit.screen.x : worldToScreen(resolvedWorld.n, resolvedWorld.e, vp, size).x)
      : 0;
    const endY = cursor && resolvedWorld
      ? (osnapHit ? osnapHit.screen.y : worldToScreen(resolvedWorld.n, resolvedWorld.e, vp, size).y)
      : 0;
    return (
      <g>
        {pendingVertices.length > 1 && (
          <path d={placed} fill="none" stroke="#5cc3ff" strokeWidth={1.8} strokeLinejoin="round" />
        )}
        {rubber && (
          <path d={rubber} fill="none" stroke="#5cc3ff" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.85} />
        )}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill="#5cc3ff" stroke="#f0f0f8" strokeWidth={0.5} />
            <text x={p.x + 5} y={p.y - 6} fill="var(--cad-entity-text)" fontSize={8}
              textAnchor="start" className="cad-seg-label">
              {i + 1}
            </text>
          </g>
        ))}
        {rubber && (
          <g>
            <line x1={endX - 3} y1={endY - 3} x2={endX + 3} y2={endY + 3}
              stroke="#5cc3ff" strokeWidth={0.8} opacity={0.5} />
            <line x1={endX + 3} y1={endY - 3} x2={endX - 3} y2={endY + 3}
              stroke="#5cc3ff" strokeWidth={0.8} opacity={0.5} />
          </g>
        )}
      </g>
    );
  };

  const renderOsnap = () => {
    if (!osnapHit) return null;
    const { x, y } = osnapHit.screen;
    const c = "#3bb46e";
    if (osnapHit.kind === "midpoint") {
      return (
        <polygon points={`${x},${y - 6} ${x + 6},${y + 4} ${x - 6},${y + 4}`}
          fill="none" stroke={c} strokeWidth={1.5} />
      );
    }
    if (osnapHit.kind === "node") {
      return (
        <g stroke={c} strokeWidth={1.5} fill="none">
          <circle cx={x} cy={y} r={5} />
          <line x1={x - 6} y1={y - 6} x2={x + 6} y2={y + 6} />
          <line x1={x - 6} y1={y + 6} x2={x + 6} y2={y - 6} />
        </g>
      );
    }
    return <rect x={x - 5} y={y - 5} width={10} height={10} fill="none" stroke={c} strokeWidth={1.5} />;
  };

  const scaleBar = useMemo(() => {
    const targetPx = 100;
    const worldLen = targetPx / vp.scale;
    const pow = Math.pow(10, Math.floor(Math.log10(worldLen)));
    const nice = [1, 2, 5, 10].map((m) => m * pow).reduce((best, c) =>
      Math.abs(c * vp.scale - targetPx) < Math.abs(best * vp.scale - targetPx) ? c : best, pow);
    const px = nice * vp.scale;
    return { px, label: `${nice} m` };
  }, [vp.scale]);

  useEffect(() => {
    onScaleChange?.(scaleBar.label);
  }, [scaleBar.label, onScaleChange]);

  const cursorClass =
    tool === "pan" ? "cad-cursor-pan" : tool === "select" ? "cad-cursor-select" : "cad-cursor-cross";

  return (
    <div
      ref={wrapRef}
      className={`cad-canvas-grid ${cursorClass}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenuInner}
      onWheel={handleWheel}
      role="application"
      aria-label="CAD model space"
    >
      <svg className="cad-drawing-svg" width={size.width} height={size.height}>
        {gridElements}
        {surfaceElements}
        {lineworkElements}
        {nativeEntityElements}
        {textElements}
        {pointElements}
        {renderPending()}
        {renderOsnap()}

        {selRect && (
          <rect
            x={Math.min(selRect.x1, selRect.x2)}
            y={Math.min(selRect.y1, selRect.y2)}
            width={Math.abs(selRect.x2 - selRect.x1)}
            height={Math.abs(selRect.y2 - selRect.y1)}
            fill={selRect.x2 >= selRect.x1 ? "rgba(65, 140, 255, 0.08)" : "rgba(50, 205, 120, 0.08)"}
            stroke={selRect.x2 >= selRect.x1 ? "#418cff" : "#32cd78"}
            strokeWidth={1}
            strokeDasharray={selRect.x2 >= selRect.x1 ? "none" : "4 2"}
            rx={1}
          />
        )}
      </svg>

      {/* Crosshair — AutoCAD-style hairlines with center gap + pickbox */}
      {cursor && tool !== "pan" && (
        <svg className="cad-crosshair" width={size.width} height={size.height}>
          <defs>
            <filter id="crosshair-glow">
              <feGaussianBlur stdDeviation="1" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter={tool === "select" ? undefined : "url(#crosshair-glow)"}>
            <line x1={cursor.x} y1={0} x2={cursor.x} y2={cursor.y - CROSSHAIR_GAP}
              stroke="#5cc3ff" strokeWidth={0.8} opacity={0.45} />
            <line x1={cursor.x} y1={cursor.y + CROSSHAIR_GAP} x2={cursor.x} y2={size.height}
              stroke="#5cc3ff" strokeWidth={0.8} opacity={0.45} />
            <line x1={0} y1={cursor.y} x2={cursor.x - CROSSHAIR_GAP} y2={cursor.y}
              stroke="#5cc3ff" strokeWidth={0.8} opacity={0.45} />
            <line x1={cursor.x + CROSSHAIR_GAP} y1={cursor.y} x2={size.width} y2={cursor.y}
              stroke="#5cc3ff" strokeWidth={0.8} opacity={0.45} />
            <rect
              x={cursor.x - 5}
              y={cursor.y - 5}
              width={10}
              height={10}
              fill="rgba(43, 158, 216, 0.08)"
              stroke="#5cc3ff"
              strokeWidth={1.2}
            />
          </g>
        </svg>
      )}

      {/* Dynamic input tooltip — shows coordinates and bearing/distance at cursor */}
      {cursorInfo && tool !== "pan" && (
        <div
          className="cad-dynamic-tip"
          style={{
            left: Math.min(cursorInfo.x + 16, size.width - 160),
            top: Math.max(cursorInfo.y - 48, 4),
          }}
        >
          {cursorInfo.lines.map((line, i) => (
            <span key={i} className="cad-dynamic-tip-line">{line}</span>
          ))}
        </div>
      )}

      {/* AutoCAD-style dynamic input box near the last picked point */}
      {showDynInput && (
        <div
          className="cad-dyn-input-wrap"
          style={(() => {
            const last = pendingVertices[pendingVertices.length - 1];
            const s = worldToScreen(last.n, last.e, vp, size);
            return { left: Math.min(s.x + 16, size.width - 200), top: Math.max(s.y - 38, 4) };
          })()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
        >
          <input
            ref={dynInputRef}
            type="text"
            className="cad-dyn-input"
            defaultValue=""
            placeholder="dist<bearing"
            spellCheck={false}
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                dynInputRef.current?.blur();
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                const input = dynInputRef.current;
                const v = input?.value.trim() ?? "";
                if (v === "") {
                  onCommit?.();
                } else {
                  onDynInput?.(v);
                  if (input) input.value = "";
                }
                return;
              }
              if (!e.ctrlKey && !e.metaKey) e.stopPropagation();
            }}
          />
        </div>
      )}

      <div className="cad-viewport-hud" aria-hidden="true">
        <span className="cad-hud-tool">{TOOL_LABELS[tool]}</span>
        <span className="cad-hud-divider" />
        <span>
          {pendingVertices.length > 0
            ? `${pendingVertices.length} point${pendingVertices.length === 1 ? "" : "s"} picked · Enter/right-click to finish`
            : tool === "select"
              ? "Click entities to inspect · drag to window-select"
              : tool === "pan"
                ? "Drag model space to pan"
                : "Click in model space to place geometry"}
        </span>
      </div>

      {/* WCS icon (AutoCAD-style coordinate axes at bottom-left) */}
      <div className="cad-ucs-icon" aria-hidden="true" title={`Coordinate system: ${axisBadgeLabels(axisConvention).first}, ${axisBadgeLabels(axisConvention).second}`}>
        <svg width="68" height="44" viewBox="0 0 68 44">
          <line x1="6" y1="36" x2="32" y2="36" stroke="#e06c75" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="6" y1="36" x2="6" y2="10" stroke="#3bb46e" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="6" cy="36" r="2.5" fill="#f0f0f8" />
          <text x="35" y="39" fill="#e06c75" textAnchor="start" fontSize="9"
            fontFamily="'Segoe UI', system-ui, sans-serif" fontWeight="700">{axisBadgeLabels(axisConvention).easting}</text>
          <text x="3" y="8" fill="#3bb46e" textAnchor="start" fontSize="9"
            fontFamily="'Segoe UI', system-ui, sans-serif" fontWeight="700">{axisBadgeLabels(axisConvention).northing}</text>
        </svg>
      </div>

      {/* Zoom controls */}
      <div className="cad-zoom-controls" aria-label="Zoom controls">
        <button
          type="button"
          className="cad-zoom-btn"
          onClick={handleZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn size={15} />
        </button>
        <button
          type="button"
          className="cad-zoom-btn"
          onClick={handleZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut size={15} />
        </button>
        <button
          type="button"
          className="cad-zoom-btn"
          onClick={handleZoomExtents}
          title="Zoom extents"
          aria-label="Zoom to extents"
        >
          <Maximize2 size={15} />
        </button>
      </div>

      {/* Scale bar */}
      <div className="cad-scale-bar" aria-hidden="true">
        <div className="cad-scale-bar-line" style={{ width: `${Math.max(20, scaleBar.px)}px` }} />
        <span>{scaleBar.label}</span>
      </div>
    </div>
  );
});

export const CadViewport = CadViewportComponent;
