import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CadModelState } from "./cadModel.ts";
import type { BearingFormat } from "./survey/format.ts";
import type { AxisConvention } from "./cadSettings.ts";
import {
  buildPlotSvg,
  openPlotWindow,
  sheetFrame,
  type FurnitureKey,
  type PaperSize,
  type PaperOrientation,
  type PlotOptions,
  type TitleBlock,
} from "./io/plot.ts";
import {
  Printer,
  Download,
  ZoomIn,
  ZoomOut,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Hand,
  RotateCcw,
  X,
} from "lucide-react";
import { downloadText } from "./io/dxf.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Label } from "@/components/ui/label.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/** Survey-coordinate span of the visible geometry (for a sensible pan step). */
function modelSpan(model: CadModelState): number {
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  const visit = (n: number, e: number) => {
    if (e < minE) minE = e; if (e > maxE) maxE = e;
    if (n < minN) minN = n; if (n > maxN) maxN = n;
  };
  for (const p of model.points) visit(p.n, p.e);
  for (const l of model.linework) for (const v of l.vertices) visit(v.n, v.e);
  for (const t of model.texts) visit(t.n, t.e);
  for (const a of model.arcs) {
    visit(a.center.n + a.radius, a.center.e);
    visit(a.center.n - a.radius, a.center.e);
    visit(a.center.n, a.center.e + a.radius);
    visit(a.center.n, a.center.e - a.radius);
  }
  for (const c of model.circles) {
    visit(c.center.n + c.radius, c.center.e);
    visit(c.center.n - c.radius, c.center.e);
    visit(c.center.n, c.center.e + c.radius);
    visit(c.center.n, c.center.e - c.radius);
  }
  for (const el of model.ellipses) {
    const rot = el.rotation * (Math.PI / 180);
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      const x = el.semiMajor * Math.cos(t);
      const y = el.semiMinor * Math.sin(t);
      visit(el.center.n + x * sinR + y * cosR, el.center.e + x * cosR - y * sinR);
    }
  }
  for (const d of model.dimensions) {
    visit(d.textPosition.n, d.textPosition.e);
    for (const v of d.defPoints) visit(v.n, v.e);
  }
  for (const h of model.hatches) {
    for (const v of h.vertices) visit(v.n, v.e);
    for (const hole of h.holes ?? []) for (const v of hole) visit(v.n, v.e);
  }
  if (!Number.isFinite(minE)) return 100;
  return Math.max(maxE - minE, maxN - minN, 1);
}

const DEFAULT_VIEW = { offsetE: 0, offsetN: 0, zoom: 1 };

interface CadPlotDialogProps {
  model: CadModelState;
  bearingFormat: BearingFormat;
  /** Axis-label convention (from CAD settings) applied to the graticule. */
  axisConvention?: AxisConvention;
  /** Seed for the title block / sheet defaults. */
  initialOptions: PlotOptions;
  /** Filename stem for SVG export. */
  fileStem: string;
  onClose: () => void;
  log: (text: string, kind?: "info" | "error") => void;
  /**
   * When set, the dialog persists every option change back to the owning
   * layout (paper space), so the sheet configuration is remembered — exactly
   * like editing a layout in AutoCAD.
   */
  onOptionsChange?: (options: PlotOptions) => void;
  /** Optional title shown in the header (e.g. the layout name). */
  layoutName?: string;
}

const PAPERS: PaperSize[] = ["A4", "A3", "A2", "A1", "A0"];
const SCALE_PRESETS = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];

/**
 * AutoCAD-style plot dialog: configure the sheet (paper, scale, title block,
 * furniture) and either print to PDF or export the print-ready SVG. A live
 * preview renders the exact sheet that will be printed.
 */
export function CadPlotDialog({
  model,
  bearingFormat,
  axisConvention = "yx",
  initialOptions,
  fileStem,
  onClose,
  log,
  onOptionsChange,
  layoutName,
}: CadPlotDialogProps) {
  const [opts, setOpts] = useState<PlotOptions>({ ...initialOptions, bearingFormat, axisConvention });

  // Persist option edits back to the owning layout (debounced via effect).
  useEffect(() => {
    onOptionsChange?.(opts);
    // Only react to local option edits; the callback identity is stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts]);

  const set = <K extends keyof PlotOptions>(key: K, value: PlotOptions[K]) =>
    setOpts((o) => ({ ...o, [key]: value }));

  const setTb = <K extends keyof TitleBlock>(key: K, value: TitleBlock[K]) =>
    setOpts((o) => ({ ...o, titleBlock: { ...o.titleBlock, [key]: value } }));

  // ── Layout viewport (AutoCAD pan/zoom inside paper space) ──────────────────
  const span = useMemo(() => modelSpan(model), [model]);
  const view = opts.view ?? DEFAULT_VIEW;

  const setView = (next: Partial<typeof DEFAULT_VIEW>) =>
    setOpts((o) => ({ ...o, view: { ...(o.view ?? DEFAULT_VIEW), ...next } }));

  /** Pan the sheet by a fraction of the drawing span (screen-relative). */
  const pan = (dxFrac: number, dyFrac: number) => {
    const step = (span / Math.max(view.zoom, 0.1)) * 0.15;
    setView({ offsetE: view.offsetE + dxFrac * step, offsetN: view.offsetN + dyFrac * step });
  };
  const zoomBy = (factor: number) =>
    setView({ zoom: Math.min(50, Math.max(0.02, view.zoom * factor)) });
  const resetView = () => setOpts((o) => ({ ...o, view: { ...DEFAULT_VIEW } }));
  const viewModified = view.offsetE !== 0 || view.offsetN !== 0 || view.zoom !== 1;

  const result = useMemo(() => buildPlotSvg(model, opts), [model, opts]);

  // ── Paper sheet canvas pan / zoom ──────────────────────────────────────────
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [sheetPan, setSheetPan] = useState({ x: 0, y: 0 });
  const [sheetZoom, setSheetZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Active furniture drag (title block / north arrow / …). Kept in a ref so
  // mousemove stays cheap; `draggingElement` mirrors it for cursors/Esc.
  const furnitureDragRef = useRef<{
    el: SVGGElement;
    key: FurnitureKey;
    startPx: { x: number; y: number };
    base: { dx: number; dy: number };
    bbox: { x: number; y: number; width: number; height: number };
    scale: number;
    live: { tx: number; ty: number } | null;
  } | null>(null);
  const [draggingElement, setDraggingElement] = useState(false);

  // Recenter paper sheet view whenever sheet paper size or orientation changes.
  useEffect(() => {
    setSheetPan({ x: 0, y: 0 });
    setSheetZoom(1);
  }, [opts.paper, opts.orientation]);

  // Measure the preview pane so the sheet can be sized to the largest fit.
  const [paneSize, setPaneSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Register the observer in the ref callback, not a mount effect: the dialog
  // content is portaled, so the pane may attach *after* mount effects run —
  // an effect here raced that and left paneSize at zero forever (sheet never
  // fitted its pane, cropping the title block).
  const attachPreviewPane = useCallback((node: HTMLDivElement | null) => {
    previewWrapRef.current = node;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setPaneSize({ w: rect.width, h: rect.height });
    });
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, []);

  const PREVIEW_PAD = 40; // px breathing room around the sheet
  const fitScale = useMemo(() => {
    if (paneSize.w <= 0 || paneSize.h <= 0) return 0;
    // Apply a 0.95 safety factor to prevent edge clipping due to rounding or subpixel issues
    return Math.max(
      0,
      Math.min(
        ((paneSize.w - PREVIEW_PAD) * 0.95) / result.paperW,
        ((paneSize.h - PREVIEW_PAD) * 0.95) / result.paperH,
      ),
    );
  }, [paneSize, result.paperW, result.paperH]);

  const handlePreviewMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Smart hit-test: pressing on a furniture element moves that element;
    // pressing anywhere else pans the sheet (existing behaviour).
    const furnEl = (e.target as Element).closest?.("[data-furniture]") as SVGGElement | null;
    if (furnEl && fitScale > 0) {
      e.preventDefault();
      try {
        const bbox = furnEl.getBBox();
        furnitureDragRef.current = {
          el: furnEl,
          key: furnEl.getAttribute("data-furniture") as FurnitureKey,
          startPx: { x: e.clientX, y: e.clientY },
          base: opts.furnitureOffsets?.[furnEl.getAttribute("data-furniture") as FurnitureKey] ?? { dx: 0, dy: 0 },
          bbox,
          scale: fitScale * sheetZoom,
          live: null,
        };
        setDraggingElement(true);
        return;
      } catch {
        // getBBox can fail if the node is not rendered — fall through to pan.
      }
    }
    e.preventDefault();
    dragStart.current = { x: e.clientX, y: e.clientY, panX: sheetPan.x, panY: sheetPan.y };
    setDragging(true);
  };

  /** Keep a dragged element's bbox inside the drawing frame (sheet mm). */
  const clampFurnitureDelta = (
    fd: NonNullable<typeof furnitureDragRef.current>,
    tx: number,
    ty: number,
  ): { tx: number; ty: number } => {
    const frame = sheetFrame(opts);
    const minTx = frame.x - fd.bbox.x;
    const maxTx = frame.x + frame.w - (fd.bbox.x + fd.bbox.width);
    const minTy = frame.y - fd.bbox.y;
    const maxTy = frame.y + frame.h - (fd.bbox.y + fd.bbox.height);
    return {
      tx: Math.min(maxTx, Math.max(minTx, tx)),
      ty: Math.min(maxTy, Math.max(minTy, ty)),
    };
  };

  const handlePreviewMouseMove = (e: React.MouseEvent) => {
    // Live furniture drag: cheap direct-DOM transform, committed on release.
    const fd = furnitureDragRef.current;
    if (fd) {
      const rawTx = fd.base.dx + (e.clientX - fd.startPx.x) / fd.scale;
      const rawTy = fd.base.dy + (e.clientY - fd.startPx.y) / fd.scale;
      const clamped = clampFurnitureDelta(fd, rawTx, rawTy);
      fd.live = clamped;
      fd.el.style.transform = `translate(${clamped.tx}mm, ${clamped.ty}mm)`;
      return;
    }
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setSheetPan({
      x: dragStart.current.panX + dx,
      y: dragStart.current.panY + dy,
    });
  };

  /** Commit the in-progress furniture drag into PlotOptions (WYSIWYG). */
  const endFurnitureDrag = (commit: boolean) => {
    const fd = furnitureDragRef.current;
    if (!fd) return;
    furnitureDragRef.current = null;
    setDraggingElement(false);
    // Clear the live style; committing triggers an SVG rebuild with the
    // offset baked in, cancelling simply reverts to the previous position.
    fd.el.style.transform = "";
    if (!commit || !fd.live) return;
    const round = (v: number) => Math.round(v * 2) / 2; // snap to 0.5 mm
    setOpts((o) => ({
      ...o,
      furnitureOffsets: {
        ...o.furnitureOffsets,
        [fd.key]: { dx: round(fd.live!.tx), dy: round(fd.live!.ty) },
      },
    }));
  };

  // Esc cancels an active furniture drag.
  useEffect(() => {
    if (!draggingElement) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") endFurnitureDrag(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingElement]);

  const endPreviewDrag = () => {
    endFurnitureDrag(true); // no-op unless an element drag is active
    dragStart.current = null;
    setDragging(false);
  };

  const zoomSheetBy = (factor: number, mx = 0, my = 0) => {
    setSheetZoom((prev) => {
      const next = Math.min(5, Math.max(0.2, prev * factor));
      const actual = next / prev;
      setSheetPan((p) => ({
        x: p.x * actual + mx * (1 - actual),
        y: p.y * actual + my * (1 - actual),
      }));
      return next;
    });
  };

  const handlePreviewWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) {
      // Zoom at cursor (Pinch on trackpad, or Ctrl+Wheel)
      const wrap = previewWrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const mx = e.clientX - cx;
      const my = e.clientY - cy;
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomSheetBy(factor, mx, my);
    } else {
      // Pan/scroll the sheet (Standard mouse wheel or 2-finger swipe)
      // Browsers often convert Shift+Wheel to deltaX automatically.
      setSheetPan((p) => ({
        x: p.x - e.deltaX,
        y: p.y - e.deltaY,
      }));
    }
  };

  const resetSheetView = () => {
    setSheetPan({ x: 0, y: 0 });
    setSheetZoom(1);
  };

  const handleFitExtents = () => {
    resetView();
    log("Viewport reset to fit extents.");
  };

  const handlePrint = () => {
    openPlotWindow(result, `${opts.titleBlock.drawingTitle} — ${opts.titleBlock.projectName}`);
    log(`Plot opened — ${opts.paper} ${opts.orientation}, 1:${result.denominator}. Use the print dialog to save as PDF.`);
  };

  const handleExportSvg = () => {
    downloadText(`${fileStem}_plot.svg`, result.svg, "image/svg+xml");
    log(`Exported plot sheet to SVG (${opts.paper}, 1:${result.denominator}).`);
  };

  const tb = opts.titleBlock;

  return (
    <DialogTemplate
      open
      onOpenChange={onClose}
      title={
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="truncate">{layoutName ? `${layoutName} — paper space` : "Plot layout — printed format"}</span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto shrink-0 font-normal">
            <span className="rounded-full border bg-background/80 px-2.5 py-0.5 font-medium">
              {result.paperW} × {result.paperH} mm
            </span>
            <span className="rounded-full border bg-primary/10 px-2.5 py-0.5 font-semibold text-primary">
              1:{result.denominator}
            </span>
            {result.extentHa != null && (
              <span className="hidden rounded-full border bg-muted/50 px-2.5 py-0.5 sm:inline">
                extent {result.extentHa.toFixed(4)} ha
              </span>
            )}
          </div>
        </div>
      }
      description="Configure the sheet and drag or wheel the preview to position the drawing."
      icon={<Printer className="size-4" />}
      size="screen"
      className="sm:rounded-none"
      contentClassName="p-0 flex flex-1 min-h-0 overflow-hidden"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={handleExportSvg}
          >
            <Download size={13} /> Export SVG
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1 text-xs"
            onClick={handlePrint}
          >
            <Printer size={14} /> Print / PDF
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={onClose}
          >
            <X size={14} /> Close
          </Button>
        </>
      }
    >
      <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ── Controls ─────────────────────────────────────────────── */}
          <ScrollArea className="w-80 shrink-0 border-r border-border/60 bg-muted/20">
            <div className="space-y-5 p-4">
              <ControlSection title="Sheet">
                <FieldRow label="Paper size">
                  <Select
                    value={opts.paper}
                    onValueChange={(v) => set("paper", v as PaperSize)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAPERS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>

                <FieldRow label="Orientation">
                  <Select
                    value={opts.orientation}
                    onValueChange={(v) => set("orientation", v as PaperOrientation)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="landscape">Landscape</SelectItem>
                      <SelectItem value="portrait">Portrait</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>

                <FieldRow label="Scale 1:">
                  <Select
                    value={opts.scaleDenominator === "fit" ? "fit" : String(opts.scaleDenominator)}
                    onValueChange={(v) =>
                      set("scaleDenominator", v === "fit" ? "fit" : Number(v))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fit">Fit to sheet ({result.denominator})</SelectItem>
                      {SCALE_PRESETS.map((s) => (
                        <SelectItem key={s} value={String(s)}>1:{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>

                <FieldRow label="Margin (mm)">
                  <Input
                    type="number"
                    min={4}
                    max={30}
                    className="h-8 text-xs"
                    value={opts.marginMm}
                    onChange={(e) => set("marginMm", Math.max(4, Math.min(30, Number(e.target.value) || 10)))}
                  />
                </FieldRow>
              </ControlSection>

              <Separator />

              <ControlSection title="Viewport (pan / zoom)">
                <div
                  role="group"
                  aria-label="Pan and zoom the layout viewport"
                  className="grid grid-cols-3 gap-1.5"
                >
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-full"
                    title="Pan up"
                    aria-label="Pan up"
                    onClick={() => pan(0, 1)}
                  >
                    <ArrowUp size={13} />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-full"
                    title="Pan left"
                    aria-label="Pan left"
                    onClick={() => pan(-1, 0)}
                  >
                    <ArrowLeft size={13} />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-full"
                    title="Reset view"
                    aria-label="Reset view"
                    onClick={handleFitExtents}
                  >
                    <Maximize2 size={12} />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-full"
                    title="Pan right"
                    aria-label="Pan right"
                    onClick={() => pan(1, 0)}
                  >
                    <ArrowRight size={13} />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-full"
                    title="Pan down"
                    aria-label="Pan down"
                    onClick={() => pan(0, -1)}
                  >
                    <ArrowDown size={13} />
                  </Button>
                  <div className="col-span-1" />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => zoomBy(1 / 1.25)}
                  >
                    <ZoomOut size={13} /> Out
                  </Button>
                  <span
                    className="text-xs font-medium tabular-nums text-muted-foreground"
                    title="Viewport zoom factor"
                  >
                    {(view.zoom * 100).toFixed(0)}%
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => zoomBy(1.25)}
                  >
                    <ZoomIn size={13} /> In
                  </Button>
                </div>

                {viewModified && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 w-full text-xs gap-1"
                    onClick={handleFitExtents}
                  >
                    <RotateCcw size={12} /> Reset to extents
                  </Button>
                )}
              </ControlSection>

              <Separator />

              <ControlSection title="Sheet elements">
                <Toggle label="North arrow" checked={opts.showNorthArrow} onChange={(v) => set("showNorthArrow", v)} />
                <Toggle label="Scale bar" checked={opts.showScaleBar} onChange={(v) => set("showScaleBar", v)} />
                <Toggle label="Legend" checked={opts.showLegend} onChange={(v) => set("showLegend", v)} />
                <Toggle label="Coordinate grid" checked={opts.showGrid} onChange={(v) => set("showGrid", v)} />
                <Toggle label="Point labels" checked={opts.showPointLabels} onChange={(v) => set("showPointLabels", v)} />
                <Toggle label="Bearings & distances" checked={opts.showSegmentLabels} onChange={(v) => set("showSegmentLabels", v)} />
                <Toggle label="Beacon schedule" checked={opts.showBeaconTable} onChange={(v) => set("showBeaconTable", v)} />
                <Toggle label="SG approval block" checked={opts.showApprovalBlock} onChange={(v) => set("showApprovalBlock", v)} />
                {opts.furnitureOffsets && Object.keys(opts.furnitureOffsets).length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full text-xs gap-1"
                    onClick={() => set("furnitureOffsets", undefined)}
                  >
                    <RotateCcw size={12} /> Reset element positions
                  </Button>
                )}
              </ControlSection>

              <Separator />

              <ControlSection title="Title block">
                <TextField label="Drawing title" value={tb.drawingTitle} onChange={(v) => setTb("drawingTitle", v)} />
                <TextField label="Plan No. (e.g. GP 1234/26)" value={tb.planNo ?? ""} onChange={(v) => setTb("planNo", v)} placeholder="—" />
                <TextField label="Property / land" value={tb.property ?? ""} onChange={(v) => setTb("property", v)} placeholder={tb.projectName} />
                <TextField label="Owner / applicant" value={tb.owner ?? ""} onChange={(v) => setTb("owner", v)} placeholder={tb.client} />
                <TextField label="Locality (district, province)" value={tb.locality ?? ""} onChange={(v) => setTb("locality", v)} placeholder="Mazowe District, Mash. Central" />
                <TextField label="Surveyor" value={tb.surveyor} onChange={(v) => setTb("surveyor", v)} />
                <TextField label="Surveyor reg. no." value={tb.surveyorRegNo ?? ""} onChange={(v) => setTb("surveyorRegNo", v)} placeholder="e.g. LS 1042" />
                <TextField label="Checked by" value={tb.checkedBy ?? ""} onChange={(v) => setTb("checkedBy", v)} />
                <TextField label="Datum / grid note" value={tb.datum} onChange={(v) => setTb("datum", v)} placeholder="Zimbabwe National Grid · Arc 1950 · UTM 35S" />
                <TextField label="Drawing No." value={tb.drawingNo} onChange={(v) => setTb("drawingNo", v)} />
                <TextField label="Sheet" value={tb.sheet} onChange={(v) => setTb("sheet", v)} />
                <TextField label="Revision" value={tb.revision} onChange={(v) => setTb("revision", v)} />
                <TextField label="Date of survey" value={tb.date} onChange={(v) => setTb("date", v)} />
              </ControlSection>
            </div>
          </ScrollArea>

          {/* ── Live preview ─────────────────────────────────────────── */}
          <div className="relative flex min-w-0 flex-1 flex-col bg-[#0c0e12]">
            <div
              ref={attachPreviewPane}
              className={cn(
                "absolute inset-0 flex select-none items-center justify-center overflow-hidden",
                dragging ? "cursor-grabbing" : "cursor-grab",
              )}
              onMouseDown={handlePreviewMouseDown}
              onMouseMove={handlePreviewMouseMove}
              onMouseUp={endPreviewDrag}
              onMouseLeave={endPreviewDrag}
              onWheel={handlePreviewWheel}
            >
              <div
                className="cad-plot-preview-sheet shadow-2xl transition-transform duration-75 ease-out"
                style={
                  fitScale > 0
                    ? {
                        width: result.paperW * fitScale * sheetZoom,
                        height: result.paperH * fitScale * sheetZoom,
                        transform: `translate3d(${sheetPan.x}px, ${sheetPan.y}px, 0)`,
                      }
                    : undefined
                }
                dangerouslySetInnerHTML={{ __html: result.svg }}
              />
            </div>
            <div className="absolute left-3 top-3 z-10 rounded-md border border-white/10 bg-black/60 px-2.5 py-1 text-xs text-white/90 backdrop-blur-sm">
              {opts.paper} · {opts.orientation} · 1:{result.denominator}
            </div>
            <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-white/10 bg-black/60 p-1 text-xs text-white/90 backdrop-blur-sm">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-white hover:bg-white/20"
                title="Zoom out sheet"
                onClick={() => zoomSheetBy(1 / 1.25)}
              >
                <ZoomOut size={12} />
              </Button>
              <button
                type="button"
                className="px-1.5 py-0.5 text-[11px] font-medium text-white/80 hover:text-white"
                title="Reset sheet view"
                onClick={resetSheetView}
              >
                {Math.round(sheetZoom * 100)}%
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-white hover:bg-white/20"
                title="Zoom in sheet"
                onClick={() => zoomSheetBy(1.25)}
              >
                <ZoomIn size={12} />
              </Button>
            </div>
            <div
              className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-md border border-white/10 bg-black/60 px-2.5 py-1 text-xs text-white/70 backdrop-blur-sm"
              aria-hidden="true"
            >
              <Hand size={12} /> Drag or scroll to pan · Ctrl+Scroll to zoom
            </div>
          </div>
      </div>
    </DialogTemplate>
  );
}

function ControlSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = `plot-toggle-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 transition-colors",
        checked ? "border-primary/30 bg-primary/5" : "border-border/60 bg-card",
      )}
    >
      <Label htmlFor={id} className="cursor-pointer text-xs font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-primary" />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input
        className="h-8 text-xs"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
