import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAsyncAction } from "../../../hooks/useAsyncAction.ts";
import type { HubProject } from "../../../pages/shared/ProjectHubPage.tsx";
import "../../../styles/cad.css";
import "../../../styles/cad-admin-theme.css";

import type { CadSelection, CadToolId } from "./cad/cadModel.ts";
import { CAD_COLORS } from "./cad/cadModel.ts";
import { useCadModel } from "./cad/useCadModel.ts";
import { useCadSettings } from "./cad/useCadSettings.ts";
import { useCadLayouts } from "./cad/useCadLayouts.ts";
import { MODEL_TAB } from "./cad/cadLayouts.ts";
import { runCommand } from "./cad/useCadCommands.ts";
import { handleToolPick } from "./cad/tools/pickFlows.ts";
import { buildCommandRegistry, DEFAULT_COMMAND_ENTRIES, type RegistryHost } from "./cad/commands/commandRegistry.ts";
import {
  intersectionBearingBearing,
  intersectionDistanceDistance,
  type NE,
} from "./cad/survey/cogo.ts";

import { CadRibbon } from "./cad/CadRibbon.tsx";
import { CadMenuBar } from "./cad/CadMenuBar.tsx";
import type { CadMenuAction } from "./cad/CadMenuBar.tsx";
import { CadViewport } from "./cad/CadViewport.tsx";
import { Cad3dViewport } from "./cad/Cad3dViewport.tsx";
import { CadRightPanel } from "./cad/CadRightPanel.tsx";
import { CadChatPanel } from "./cad/CadChatPanel.tsx";
import { CadSettingsPopover } from "./cad/CadSettingsPanel.tsx";
import { CadStatusBar } from "./cad/CadStatusBar.tsx";
import { CadCommandLine, type CommandLogEntry } from "./cad/CadCommandLine.tsx";
import { CadPlotDialog } from "./cad/CadPlotDialog.tsx";
import { CadPointDialog } from "./cad/CadPointDialog.tsx";
import { CadControlPointDialog } from "./cad/CadControlPointDialog.tsx";
import { CadProjectPointsSelector } from "./cad/CadProjectPointsSelector.tsx";
import { CadImportDxfDialog } from "./cad/CadImportDxfDialog.tsx";
import { CadReportDialog } from "./cad/CadReportDialog.tsx";
import { parseCadFile, lastCadBackend } from "./cad/survey/cadBridge.ts";
import { CadDialogProvider } from "./cad/CadDialogProvider.tsx";
import { useCadDialog } from "./cad/cadDialogContext.ts";
import {
  DEFAULT_PLOT_OPTIONS,
  DEFAULT_TITLE_BLOCK,
  buildPlotSvg,
  openPlotWindow,
  type PlotOptions,
} from "./cad/io/plot.ts";
import { SlidersHorizontal, Box, Square, ChevronDown, Bot } from "lucide-react";

import { pointsToCsv } from "./cad/io/csv.ts";
import { modelToDxf, downloadText } from "./cad/io/dxf.ts";
import { addProjectOutput } from "../tools/calculators/projectOutputs.ts";
import { buildSurveyReport, buildCutFillReport, openReportWindow } from "./cad/io/report.ts";
import { modelFromGeoJson, toGeoModel } from "./cad/io/geojson.ts";
import {
  modelToGeoJson,
  lastGeomBackend,
} from "./cad/survey/geomBridge.ts";
import { runBuildSurface, runBuildSurfaceWithBreaklines, runBuildBoundarySurface } from "./cad/analysis/surfaceWorkflows.ts";
import { runBuildContours } from "./cad/analysis/contourWorkflows.ts";
import { runVolumeToElevation, runVolumeBetween } from "./cad/analysis/volumeWorkflows.ts";
import type { WorkflowServices } from "./cad/analysis/workflowCtx.ts";
import { forward, inverse, polygonArea, polylineLength } from "./cad/survey/cogo.ts";
import { runTerrainAnalysis } from "./cad/analysis/terrainWorkflows.ts";
import { runExtractProfile } from "./cad/analysis/profileWorkflow.ts";
import { runProcessLinework } from "./cad/analysis/fieldToFinishWorkflow.ts";
import { runConvexHull, runReproject, runSimplifySelection } from "./cad/analysis/geomWorkflows.ts";
import { fmtArea, fmtBearing, fmtCoord, fmtDistance, parseDistanceBearing } from "./cad/survey/format.ts";
import { axisBadgeLabels } from "./cad/cadSettings.ts";

function cadCrsLabel(project: HubProject): string {
  if (project.crsType === 'projected') return project.crsEpsg ? `EPSG:${project.crsEpsg}` : 'Projected';
  if (project.crsType === 'local') return 'Local';
  return 'Other';
}

function cadCrsTooltip(project: HubProject): string {
  if (project.crsType === 'local') {
    return `Local site grid. Origin offset: E ${project.localOriginE}, N ${project.localOriginN}`;
  }
  if (project.crsType === 'projected') {
    return `Projected CRS${project.crsEpsg ? ` — EPSG:${project.crsEpsg}` : ''}`;
  }
  return 'Coordinate system: other / unspecified';
}

interface CadWorkspaceProps {
  activeProject: HubProject;
  workspaceId: string;
  setProjectMobileMenuOpen: (v: boolean) => void;
  exitCadWorkspace: () => void;
}

/** Tools that build multi-vertex linework, committed on double-click / Enter / right-click. */
const LINEWORK_TOOLS: Record<string, "line" | "boundary"> = {
  line: "line",
  boundary: "boundary",
};

const MODIFY_TOOLS: CadToolId[] = ["move", "copy", "rotate", "scale", "mirror", "offset"];

let logCounter = 0;

/** Point-placement form that appears when the Point / Control Point tool is clicked. */
export type PointFormOpenState = {
  open: boolean;
  world: { n: number; e: number } | null;
  pointNo: string;
  code: string;
  elev: string;
  layerId: string;
  title: string;
};

/** Control-point form with manual coordinate entry (accurate placement). */
export type ControlPointFormOpenState = {
  open: boolean;
  pointNo: string;
  code: string;
};

export function CadWorkspace(props: CadWorkspaceProps) {
  return (
    <CadDialogProvider>
      <CadWorkspaceContent {...props} />
    </CadDialogProvider>
  );
}

function CadWorkspaceContent({
  activeProject,
  workspaceId,
  setProjectMobileMenuOpen,
  exitCadWorkspace,
}: CadWorkspaceProps) {
  useEffect(() => {
    document.body.classList.add("cad-admin-scope");
    return () => document.body.classList.remove("cad-admin-scope");
  }, []);

  const cad = useCadModel(activeProject.dbId, workspaceId);
  const { model, selection } = cad;

  const settingsApi = useCadSettings(activeProject.dbId);
  const { settings, update: updateSettings } = settingsApi;
  const { bearingFormat, snap, ortho, showGrid, osnap, view3d } = settings;

  // Keep project-controlled drafting conventions in sync with the Project Hub.
  // Project hub settings are the source of truth for the whole project.
  useEffect(() => {
    const projectConvention = activeProject.axisConvention === 'xy' ? 'xy' : 'yx';
    const updates: Partial<typeof settings> = {};
    if (settings.axisConvention !== projectConvention) updates.axisConvention = projectConvention;

    const projectBearing = activeProject.bearingFormat || 'azimuth';
    if (settings.bearingFormat !== projectBearing) updates.bearingFormat = projectBearing as typeof settings.bearingFormat;

    const projectAngle = activeProject.angleEntry || 'packed';
    if (settings.angleEntry !== projectAngle) updates.angleEntry = projectAngle as typeof settings.angleEntry;

    const projectDecimals = typeof activeProject.coordDecimals === 'number' ? activeProject.coordDecimals : 3;
    if (settings.coordDecimals !== projectDecimals) updates.coordDecimals = projectDecimals;

    if (Object.keys(updates).length > 0) updateSettings(updates);
  }, [
    activeProject.axisConvention,
    activeProject.bearingFormat,
    activeProject.angleEntry,
    activeProject.coordDecimals,
    settings.axisConvention,
    settings.bearingFormat,
    settings.angleEntry,
    settings.coordDecimals,
    settings,
    updateSettings,
  ]);

  const [tool, setTool] = useState<CadToolId>("select");
  const [pendingTool, setPendingTool] = useState<CadToolId | null>(null);
  const [ribbonTab, setRibbonTab] = useState<string>("Home");

  /** Active drawing colour for new geometry. null = ByLayer (AutoCAD default). */
  const [activeColor, setActiveColor] = useState<string | null>(null);

  /** Whether the drawing-settings popover (anchored to the top-bar gear) is open. */
  const [settingsOpen, setSettingsOpen] = useState(false);

  /** Whether the plot/layout dialog is open. */
  const [plotOpen, setPlotOpen] = useState(false);

  /** Whether the SiteSurveyor AI chat panel is docked beside the canvas. */
  const [aiChatOpen, setAiChatOpen] = useState(false);

  /** Point-placement form that appears when the Point / Control Point tool is clicked. */
  const [pointForm, setPointForm] = useState<PointFormOpenState>({ open: false, world: null, pointNo: "1", code: "", elev: "", layerId: "POINTS", title: "Place Survey Point" });

  /** Control-point form with manual coordinate entry (accurate placement). */
  const [controlPointForm, setControlPointForm] = useState<ControlPointFormOpenState>({ open: false, pointNo: "1", code: "CP" });

  const dialog = useCadDialog();

  const [cursor, setCursor] = useState<{ n: number; e: number } | null>(null);
  const [scaleLabel, setScaleLabel] = useState("1 m");
  const [fitSignal, setFitSignal] = useState(0);
  /** Bumped to push a target scale (px per survey unit) into the viewport. */
  const [scaleSignal, setScaleSignal] = useState(0);
  const [scaleTarget, setScaleTarget] = useState<number | undefined>(undefined);

  const [pendingVertices, setPendingVertices] = useState<{ n: number; e: number }[]>([]);
  /**
   * The LINE tool now behaves like an open polyline so the whole chain can be
   * selected and deleted as one object. This holds the id of the running
   * polyline while the command is active.
   */
  const [runningLineId, setRunningLineId] = useState<string | null>(null);
  /** True while the running-LINE transaction (single undo step) is open. */
  const lineTxActiveRef = useRef(false);
  const [projectPointsOpen, setProjectPointsOpen] = useState(false);
  const [importDxfOpen, setImportDxfOpen] = useState(false);
  const [reportDialog, setReportDialog] = useState<{ open: boolean; title: string; html: string } | null>(null);
  const [lastTool, setLastTool] = useState<CadToolId>("select");
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>([
    { id: ++logCounter, kind: "info", text: `Engineering Surveyor CAD ready — ${activeProject.name}` },
    { id: ++logCounter, kind: "info", text: "Pick a tool or type a command. Enter / right-click to finish linework." },
  ]);

  /** Keep the LINE tool's running polyline in sync with pending vertices. */
  const syncRunningLine = useCallback(async () => {
    if (tool !== "line") {
      // Tool switched away mid-draw: discard the open transaction instead of
      // leaving committed chain fragments behind.
      if (lineTxActiveRef.current) {
        cad.discardTransaction();
        lineTxActiveRef.current = false;
      }
      setRunningLineId(null);
      return;
    }
    if (pendingVertices.length < 2) {
      if (lineTxActiveRef.current) {
        cad.discardTransaction();
        lineTxActiveRef.current = false;
        setRunningLineId(null);
      }
      return;
    }
    if (runningLineId == null) {
      cad.beginTransaction();
      lineTxActiveRef.current = true;
      const created = cad.addLinework({
        kind: "polyline",
        vertices: pendingVertices,
        closed: false,
        color: activeColor,
      });
      setRunningLineId(created.id);
    } else {
      cad.updateLinework(runningLineId, { vertices: pendingVertices });
    }
  }, [tool, pendingVertices, cad, activeColor, runningLineId]);

  useAsyncAction(syncRunningLine, [syncRunningLine]);

  const datum = activeProject.datum || "No datum set";

  // Title-block seed (project metadata) for both the ad-hoc plot dialog and the
  // persistent AutoCAD-style layouts.
  const titleSeed = useMemo(
    () =>
      DEFAULT_TITLE_BLOCK(
        activeProject.name,
        activeProject.id,
        activeProject.client ?? "",
        activeProject.datum ?? "",
      ),
    [activeProject.name, activeProject.id, activeProject.client, activeProject.datum],
  );

  // AutoCAD-style layouts (paper space). Switching to a layout tab presents the
  // model on a to-scale sheet; "Model" returns to full-size drawing.
  const layoutApi = useCadLayouts(activeProject.dbId, titleSeed);

  // Seed the plot dialog from project metadata and the current drafting prefs.
  // It is only used as the dialog's initial state, so recomputing on each open
  // (rather than live) is intentional.
  const plotOptions = useMemo<PlotOptions>(() => {
    const base = DEFAULT_PLOT_OPTIONS(titleSeed);
    return {
      ...base,
      bearingFormat,
      axisConvention: settings.axisConvention,
      showPointLabels: settings.showPointLabels,
      showSegmentLabels: settings.showSegmentLabels,
      showGrid: settings.showGrid,
      scaleDenominator: "fit",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleSeed, plotOpen]);

  const log = useCallback((text: string, kind: CommandLogEntry["kind"] = "info") => {
    setCommandLog((prev) => [...prev.slice(-40), { id: ++logCounter, kind, text }]);
  }, []);

  const fitExtents = useCallback(() => {
    setFitSignal((s) => s + 1);
  }, []);

  const cadServices = useMemo<WorkflowServices>(
    () => ({
      dialog,
      log,
      fitExtents,
      show3d: () => settingsApi.update({ view3d: true }),
      openReport: openReportWindow,
      downloadCsv: (filename, rows) =>
        downloadText(filename, rows.map((r) => r.join(",")).join("\n"), "text/csv"),
      projectName: activeProject.name,
      projectId: activeProject.id,
      projectDbId: activeProject.dbId,
      addOutput: (draft) => {
        addProjectOutput(activeProject.dbId, draft);
      },
    }),
    [dialog, log, fitExtents, settingsApi, activeProject.name, activeProject.id, activeProject.dbId],
  );

  // The AI bridge can trigger zoom-extents from chat commands (e.g. "[CAD] zoom extents").
  useEffect(() => {
    const onAiZoomExtents = () => fitExtents();
    window.addEventListener("cad:ai-zoom-extents", onAiZoomExtents);
    return () => window.removeEventListener("cad:ai-zoom-extents", onAiZoomExtents);
  }, [fitExtents]);

  const hasGeometry = useCallback(
    () =>
      model.points.length > 0 ||
      model.linework.length > 0 ||
      model.texts.length > 0 ||
      model.surfaces.length > 0 ||
      model.arcs.length > 0 ||
      model.circles.length > 0 ||
      model.ellipses.length > 0 ||
      model.dimensions.length > 0 ||
      model.hatches.length > 0,
    [
      model.points.length,
      model.linework.length,
      model.texts.length,
      model.surfaces.length,
      model.arcs.length,
      model.circles.length,
      model.ellipses.length,
      model.dimensions.length,
      model.hatches.length,
    ],
  );

  /**
   * Enter paper space (AutoCAD "Layout"). Activates the current layout tab, or
   * the first layout if Model is active, creating one if none exist yet.
   */
  const openLayout = useCallback(() => {
    if (!hasGeometry()) {
      log("Plot: nothing to lay out yet — draw or import some geometry first.", "error");
      return;
    }
    if (layoutApi.active !== MODEL_TAB) return; // already in a layout
    const first = layoutApi.layouts[0];
    if (first) layoutApi.setActive(first.id);
    else layoutApi.add();
  }, [hasGeometry, layoutApi, log]);

  const handleSelectTab = useCallback(
    (tab: string) => {
      if (tab !== MODEL_TAB && !hasGeometry()) {
        log("Layout: nothing to lay out yet — draw or import some geometry first.", "error");
        return;
      }
      layoutApi.setActive(tab);
      if (tab === MODEL_TAB) log("Switched to Model space.");
      else {
        const l = layoutApi.layouts.find((x) => x.id === tab);
        if (l) log(`Switched to layout "${l.name}" (paper space).`);
      }
    },
    [hasGeometry, layoutApi, log],
  );

  const handleAddLayout = useCallback(() => {
    const created = layoutApi.add();
    if (created) log(`Created layout "${created.name}".`);
  }, [layoutApi, log]);

  /**
   * PLOT command: open the to-scale print/PDF window for the current sheet.
   * Uses the active layout's saved options when in paper space, otherwise the
   * ad-hoc plot defaults (and shows the dialog so the user can also tweak it).
   */
  const requestPlot = useCallback(() => {
    if (!hasGeometry()) {
      log("PLOT: nothing to plot yet — draw or import some geometry first.", "error");
      return;
    }
    const active = layoutApi.activeLayout;
    if (active) {
      const result = buildPlotSvg(model, {
        ...active.options,
        bearingFormat,
        axisConvention: settings.axisConvention,
      });
      openPlotWindow(result, `${active.options.titleBlock.drawingTitle} — ${active.name}`);
      log(`Plotting "${active.name}" — ${active.options.paper}, 1:${result.denominator}.`);
    } else {
      setPlotOpen(true);
    }
  }, [hasGeometry, layoutApi.activeLayout, model, bearingFormat, settings.axisConvention, log]);

  /**
   * Apply a plotting scale 1:`denominator` to the viewport. We map ground
   * metres to screen pixels at a standard 96 dpi (1 px ≈ 0.0254/96 m on paper),
   * so px-per-ground-unit = 96 / 0.0254 / denominator. This makes "1:500"
   * render at the conventional on-screen size; the scale bar confirms it.
   */
  const applyScale = useCallback((denominator: number) => {
    if (!Number.isFinite(denominator) || denominator <= 0) {
      log("Scale: enter a positive denominator (e.g. 500 for 1:500).", "error");
      return;
    }
    const pxPerMetrePaper = 96 / 0.0254; // ≈ 3779.5 px per paper metre at 96 dpi
    const pxPerGroundUnit = pxPerMetrePaper / denominator;
    settingsApi.update({ scaleDenominator: Math.round(denominator) });
    setScaleTarget(pxPerGroundUnit);
    setScaleSignal((s) => s + 1);
    log(`Scale set to 1:${Math.round(denominator)}.`);
  }, [settingsApi, log]);

  const isDrawingTool = LINEWORK_TOOLS[tool] != null || tool === "point" || tool === "control-point" || tool === "text" || tool === "measure";

  const commitPending = useCallback(
    (closeChain = false) => {
      // LINE: the running polyline was already created when the second point was
      // picked. Finishing the command just leaves it in the model and selects
      // it. If only a start point was picked, treat it as a cancellation.
      if (tool === "line") {
        setPendingVertices((verts) => {
          if (verts.length < 2) {
            if (verts.length > 0) log("Cancelled (a line needs at least 2 points).", "info");
            if (lineTxActiveRef.current) {
              cad.discardTransaction();
              lineTxActiveRef.current = false;
            }
          } else if (runningLineId) {
            log(`Line created (${verts.length} vertices).`);
            cad.setSelection({ type: "linework", id: runningLineId });
          }
          return [];
        });
        if (lineTxActiveRef.current) {
          cad.endTransaction();
          lineTxActiveRef.current = false;
        }
        setRunningLineId(null);
        return;
      }

      const kind = tool === "boundary" ? "boundary" : null;
      if (!kind) {
        setPendingVertices([]);
        return;
      }
      setPendingVertices((verts) => {
        if (verts.length < 2) {
          if (verts.length > 0) log("Linework needs at least 2 vertices.", "error");
          return [];
        }
        const closed = kind === "boundary" || closeChain;
        const created = cad.addLinework({ kind, vertices: verts, closed, color: activeColor });
        log(`${kind} created (${verts.length} vertices)${closed ? ", closed" : ""}.`);
        cad.setSelection({ type: "linework", id: created.id });
        return [];
      });
    },
    [tool, cad, log, activeColor, runningLineId],
  );

  /** AutoCAD-style dynamic input: accept distance<bearing while drawing a chain. */
  const handleDynInput = useCallback(
    (raw: string) => {
      if (pendingVertices.length === 0) return;
      const parsed = parseDistanceBearing(raw, settings.angleEntry);
      if (!parsed) {
        log("Invalid entry. Use distance<bearing, e.g. 50<30 or @25<N45E", "error");
        return;
      }
      const start = pendingVertices[pendingVertices.length - 1];
      const end = forward(start, parsed.azimuthDeg, parsed.distance);
      setPendingVertices((verts) => [...verts, end]);
      const axis = axisBadgeLabels(settings.axisConvention);
      log(
        `Segment ${fmtDistance(parsed.distance)} m @ ${fmtBearing(parsed.azimuthDeg, bearingFormat)} ` +
          `→ ${axis.first} ${fmtCoord(end.e)} ${axis.second} ${fmtCoord(end.n)}`,
      );
    },
    [pendingVertices, settings.angleEntry, settings.axisConvention, bearingFormat, log],
  );

  const cancelPending = useCallback(() => {
    if (tool === "line" && lineTxActiveRef.current) {
      // Discard restores the model from before the chain was started — no
      // "ghost" polyline can be resurrected by the next undo.
      cad.discardTransaction();
      lineTxActiveRef.current = false;
      log("Line cancelled.");
    } else if (tool === "line" && runningLineId) {
      cad.deleteLinework(runningLineId);
      log("Line cancelled.");
    } else {
      setPendingVertices((verts) => {
        if (verts.length) log("Cancelled.", "info");
        return [];
      });
    }
    setPendingVertices([]);
    setRunningLineId(null);
  }, [tool, runningLineId, cad, log]);

  const handlePickPoint = useCallback(
    async (world: { n: number; e: number }) => {
      // Block drawing onto a locked active layer (AutoCAD convention).
      const drawsToActiveLayer =
        tool === "point" || tool === "text" || tool === "line" || tool === "boundary" || tool === "circle" || tool === "arc";
      if (drawsToActiveLayer) {
        const active = cad.layerById(model.activeLayerId);
        if (active?.locked) {
          log(`Layer "${active.name}" is locked. Unlock it or pick another active layer to draw.`, "error");
          return;
        }
      }
      await handleToolPick({
        world,
        tool,
        cad,
        model,
        dialog,
        log,
        activeColor,
        pendingVertices,
        setPendingVertices,
        setPointForm,
        setControlPointForm,
        coordDecimals: settings.coordDecimals,
      });
    },
    [tool, cad, dialog, log, activeColor, model, settings.coordDecimals, pendingVertices],
  );

  const handleSelectEntity = useCallback(
    (sel: CadSelection) => {
      cad.setSelection(sel);
      const count = sel.items?.length ?? (sel.type ? 1 : 0);
      if (pendingTool && count > 0) {
        const t = pendingTool;
        setPendingTool(null);
        setLastTool(t);
        setTool(t);
        log(`${t}: selection ready — tool resumed.`);
        return;
      }
      if (count > 1) log(`Selected ${count} objects.`);
      else if (sel.type) log(`Selected ${sel.type}.`);
    },
    [cad, log, pendingTool],
  );

  const hasSelection = useCallback(() => {
    const sel = cad.selection;
    return (sel.items && sel.items.length > 0) || (!!sel.type && !!sel.id);
  }, [cad.selection]);

  const changeTool = useCallback((t: CadToolId) => {
    setPendingVertices([]);
    setRunningLineId(null);
    setPendingTool(null);
    if (MODIFY_TOOLS.includes(t) && !hasSelection()) {
      setPendingTool(t);
      setTool("select");
      log(`${t}: select objects first, then the tool will resume.`);
      return;
    }
    setLastTool(t);
    setTool(t);
  }, [hasSelection, log]);

  const repeatLastTool = useCallback(() => {
    changeTool(lastTool);
  }, [lastTool, changeTool]);

  const deleteSelection = useCallback(() => {
    const sel = cad.selection;
    const items = sel.items && sel.items.length
      ? sel.items
      : sel.type && sel.id
        ? [{ type: sel.type, id: sel.id }]
        : [];
    if (items.length === 0) {
      log("Nothing selected to delete.", "error");
      return;
    }
    // One logical delete = one undo step (batch into a transaction).
    cad.beginTransaction();
    try {
      for (const it of items) {
        if (it.type === "point") cad.deletePoint(it.id);
        else if (it.type === "linework") cad.deleteLinework(it.id);
        else if (it.type === "text") cad.deleteText(it.id);
        else if (it.type === "surface") cad.deleteSurface(it.id);
        else if (it.type === "arc") cad.deleteArc(it.id);
        else if (it.type === "circle") cad.deleteCircle(it.id);
        else if (it.type === "ellipse") cad.deleteEllipse(it.id);
        else if (it.type === "dimension") cad.deleteDimension(it.id);
        else if (it.type === "hatch") cad.deleteHatch(it.id);
      }
    } finally {
      cad.endTransaction();
    }
    log(`Deleted ${items.length} object${items.length === 1 ? "" : "s"}.`);
  }, [cad, log]);

  /** Break selected polylines/boundaries into individual line segments. */
  const explodeSelection = useCallback(() => {
    const sel = cad.selection;
    const items = sel.items && sel.items.length
      ? sel.items
      : sel.type && sel.id
        ? [{ type: sel.type, id: sel.id }]
        : [];
    const lwIds = items.filter((i) => i.type === "linework").map((i) => i.id);
    if (lwIds.length === 0) {
      log("Explode: select polylines / boundaries first.", "error");
      return;
    }
    let created = 0;
    const newIds: string[] = [];
    cad.beginTransaction();
    try {
      for (const id of lwIds) {
        const lw = model.linework.find((l) => l.id === id);
        if (!lw || lw.vertices.length < 2) continue;
        const segCount = lw.closed ? lw.vertices.length : lw.vertices.length - 1;
        for (let i = 0; i < segCount; i++) {
          const a = lw.vertices[i];
          const b = lw.vertices[(i + 1) % lw.vertices.length];
          const seg = cad.addLinework({
            kind: "line",
            vertices: [a, b],
            closed: false,
            layerId: lw.layerId,
            color: lw.color,
            // Only the first segment carries the parent's label (contour RL
            // etc.) — copying it to every segment spams the drawing.
            label: i === 0 ? lw.label : undefined,
          });
          newIds.push(seg.id);
          created += 1;
        }
        cad.deleteLinework(id);
      }
    } finally {
      cad.endTransaction();
    }
    if (created > 0) {
      cad.setSelection({
        type: "linework",
        id: newIds[newIds.length - 1],
        items: newIds.map((id) => ({ type: "linework" as const, id })),
      });
    }
    log(`Exploded ${lwIds.length} linework object(s) into ${created} line segment(s).`);
  }, [cad, model.linework, log]);

  /** Select every visible entity (Ctrl+A). */
  const selectAll = useCallback(() => {
    const items = [
      ...model.points.map((p) => ({ type: "point" as const, id: p.id })),
      ...model.linework.map((l) => ({ type: "linework" as const, id: l.id })),
      ...model.texts.map((t) => ({ type: "text" as const, id: t.id })),
      ...model.surfaces.map((s) => ({ type: "surface" as const, id: s.id })),
      ...model.arcs.map((a) => ({ type: "arc" as const, id: a.id })),
      ...model.circles.map((c) => ({ type: "circle" as const, id: c.id })),
      ...model.ellipses.map((el) => ({ type: "ellipse" as const, id: el.id })),
      ...model.dimensions.map((d) => ({ type: "dimension" as const, id: d.id })),
      ...model.hatches.map((h) => ({ type: "hatch" as const, id: h.id })),
    ];
    if (items.length === 0) { log("Nothing to select.", "info"); return; }
    const primary = items[items.length - 1];
    cad.setSelection({ type: primary.type, id: primary.id, items });
    log(`Selected ${items.length} object${items.length === 1 ? "" : "s"}.`);
  }, [model.points, model.linework, model.texts, model.surfaces, model.arcs, model.circles, model.ellipses, model.dimensions, model.hatches, cad, log]);

  const findPoint = useCallback(
    (pno: string): NE | null => {
      const p = model.points.find((x) => x.pointNo === pno.trim());
      return p ? { n: p.n, e: p.e } : null;
    },
    [model.points],
  );

  const runIntersection = useCallback(async () => {
    const mode = await dialog.prompt("Intersection type — 'BB' (bearing-bearing) or 'DD' (distance-distance):", "BB");
    if (!mode) return;
    const m = mode.trim().toUpperCase();
    if (m === "BB") {
      const p1no = await dialog.prompt("From point 1 (Pt #):");
      const az1 = await dialog.prompt("Bearing from point 1 (deg):");
      const p2no = await dialog.prompt("From point 2 (Pt #):");
      const az2 = await dialog.prompt("Bearing from point 2 (deg):");
      const p1 = p1no ? findPoint(p1no) : null;
      const p2 = p2no ? findPoint(p2no) : null;
      if (!p1 || !p2 || az1 == null || az2 == null) { log("Intersection: invalid input.", "error"); return; }
      const res = intersectionBearingBearing(p1, parseFloat(az1), p2, parseFloat(az2));
      if (!res) { log("Intersection: rays are parallel.", "error"); return; }
      const created = cad.addPoint({ pointNo: cad.nextPointNo(), n: res.n, e: res.e, z: null, code: "INT", color: activeColor });
      log(`Intersection point ${created.pointNo}: N ${res.n.toFixed(3)} E ${res.e.toFixed(3)}`);
    } else if (m === "DD") {
      const p1no = await dialog.prompt("From point 1 (Pt #):");
      const r1 = await dialog.prompt("Distance from point 1 (m):");
      const p2no = await dialog.prompt("From point 2 (Pt #):");
      const r2 = await dialog.prompt("Distance from point 2 (m):");
      const p1 = p1no ? findPoint(p1no) : null;
      const p2 = p2no ? findPoint(p2no) : null;
      if (!p1 || !p2 || r1 == null || r2 == null) { log("Intersection: invalid input.", "error"); return; }
      const sols = intersectionDistanceDistance(p1, parseFloat(r1), p2, parseFloat(r2));
      if (!sols.length) { log("Intersection: circles do not intersect.", "error"); return; }
      // Batch-created points must not share a number — count locally from the
      // model snapshot (nextPointNo() would report the same base for both
      // solutions because state hasn't updated between the two creations).
      let solPtNo = (() => {
        let max = 1000;
        for (const p of model.points) {
          const n = parseInt(p.pointNo, 10);
          if (Number.isFinite(n) && n > max) max = n;
        }
        return max + 1;
      })();
      for (const s of sols) {
        const created = cad.addPoint({ pointNo: String(solPtNo++), n: s.n, e: s.e, z: null, code: "INT", color: activeColor });
        log(`Intersection point ${created.pointNo}: N ${s.n.toFixed(3)} E ${s.e.toFixed(3)}`);
      }
    } else {
      log("Intersection: choose BB or DD.", "error");
    }
  }, [cad, dialog, findPoint, log, activeColor, model.points]);

  /** COGO inverse: needs exactly two selected points. */
  const runInverse = useCallback(() => {
    const items = cad.selection.items ?? [];
    const ptIds = items.filter((i) => i.type === "point").map((i) => i.id);
    const pts = model.points.filter((p) => ptIds.includes(p.id)).slice(0, 2);
    if (ptIds.length !== 2 || pts.length !== 2) {
      log("Inverse: select exactly two points.", "error");
      return;
    }
    const inv = inverse(pts[0], pts[1]);
    log(`Inverse ${pts[0].pointNo} → ${pts[1].pointNo}: dist ${fmtDistance(inv.distance)}, bearing ${fmtBearing(inv.azimuth, bearingFormat)}, dN ${(pts[1].n - pts[0].n).toFixed(3)}, dE ${(pts[1].e - pts[0].e).toFixed(3)}`);
  }, [cad.selection, model.points, log, bearingFormat]);

  /** COGO area: needs one selected closed boundary/linework. */
  const runArea = useCallback(() => {
    const items = cad.selection.items ?? [];
    const lwIds = items.filter((i) => i.type === "linework").map((i) => i.id);
    const lw = model.linework.find((l) => lwIds.includes(l.id));
    if (!lw || !lw.closed || lw.vertices.length < 3) {
      log("Area: select a closed polygon/boundary.", "error");
      return;
    }
    const area = polygonArea(lw.vertices);
    let perimeter = polylineLength(lw.vertices);
    if (lw.closed && lw.vertices.length >= 2) {
      const a = lw.vertices[lw.vertices.length - 1];
      const b = lw.vertices[0];
      perimeter += Math.hypot(b.e - a.e, b.n - a.n);
    }
    log(`Area: ${fmtArea(area)}, perimeter ${fmtDistance(perimeter)} (${lw.vertices.length} vertices)`);
  }, [cad.selection, model.linework, log]);

  const importProjectPoints = useCallback(
    (rows: { pointNo: string; n: number; e: number; z: number | null; code: string }[]) => {
      const existingNos = new Set(cad.model.points.map((p) => p.pointNo.trim()));
      const toImport = rows.filter((r) => !existingNos.has(r.pointNo.trim()));
      if (toImport.length === 0) {
        log("No new project points to import — all selected point numbers already exist.", "info");
        return;
      }
      cad.ensureLayerById("PROJECT");
      const count = cad.importPoints(toImport, "PROJECT");
      log(`Imported ${count} project point(s) from workspace.`);
      fitExtents();
    },
    [cad, log, fitExtents],
  );

  const exportDxf = useCallback(() => {
    if (!model.points.length && !model.linework.length && !model.texts.length) {
      log("Nothing to export.", "error");
      return;
    }
    const dxf = modelToDxf(model);
    const safe = activeProject.id.replace(/[^a-z0-9_-]/gi, "_");
    downloadText(`${safe}.dxf`, dxf, "application/dxf");
    addProjectOutput(activeProject.dbId, {
      label: "CAD DXF Export",
      description: `${model.points.length} point(s), ${model.linework.length} line object(s)`,
      fileName: `${safe}.dxf`,
      mimeType: "application/dxf",
      content: dxf,
    });
    log("Exported DXF.");
  }, [model, activeProject.id, activeProject.dbId, log]);

  const exportCsv = useCallback(() => {
    if (!model.points.length) { log("No points to export.", "error"); return; }
    const csv = pointsToCsv(model.points);
    const safe = activeProject.id.replace(/[^a-z0-9_-]/gi, "_");
    downloadText(`${safe}_points.csv`, csv, "text/csv");
    addProjectOutput(activeProject.dbId, {
      label: "CAD Points CSV",
      description: `${model.points.length} point(s)`,
      fileName: `${safe}_points.csv`,
      mimeType: "text/csv",
      content: csv,
    });
    log(`Exported ${model.points.length} point(s) to CSV.`);
  }, [model, activeProject.id, activeProject.dbId, log]);

  const exportReport = useCallback(() => {
    const body = buildSurveyReport(activeProject.name, activeProject.id, model, settings.axisConvention);
    openReportWindow(`Survey Report — ${activeProject.name}`, body);
    log("Generated survey report.");
  }, [model, activeProject.name, activeProject.id, settings.axisConvention, log]);

  const exportCutFillReport = useCallback(async () => {
    const cutFillSurfaces = model.surfaces.filter((s) => s.cutFill);
    if (cutFillSurfaces.length === 0) {
      await dialog.alert("No cut/fill data found. Run Vol → RL or Vol Δ first to generate volume data.");
      return;
    }
    const body = buildCutFillReport(activeProject.name, activeProject.id, model);
    setReportDialog({ open: true, title: `Cut/Fill Report — ${activeProject.name}`, html: body });
    log("Generated cut/fill volume report.");
  }, [model, activeProject.name, activeProject.id, dialog, log]);

  // ── GeoJSON (GeoRust geojson) ──────────────────────────────────────────────

  const exportGeoJson = useCallback(async () => {
    if (!model.points.length && !model.linework.length) {
      log("Nothing to export to GeoJSON.", "error");
      return;
    }
    const geojson = await modelToGeoJson(toGeoModel(model.points, model.linework));
    const safe = activeProject.id.replace(/[^a-z0-9_-]/gi, "_");
    downloadText(`${safe}.geojson`, geojson, "application/geo+json");
    addProjectOutput(activeProject.dbId, {
      label: "CAD GeoJSON Export",
      description: `${model.points.length} point(s), ${model.linework.length} line object(s)`,
      fileName: `${safe}.geojson`,
      mimeType: "application/geo+json",
      content: geojson,
    });
    log(
      `Exported ${model.points.length} point(s) and ${model.linework.length} line(s) to GeoJSON (${lastGeomBackend()}).`,
    );
  }, [model, activeProject.id, activeProject.dbId, log]);

  // ── GeoJSON import ────────────────────────────────────────────────────────

  const importGeoJson = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".geojson,.json,application/geo+json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void (async () => {
        try {
          const text = await file.text();
          const parsed = modelFromGeoJson(text);
          for (const w of parsed.warnings) log(`GeoJSON: ${w}`, "info");
          for (const e of parsed.errors) log(`GeoJSON: ${e}`, "error");
          const entityCount = parsed.points.length + parsed.linework.length;
          if (entityCount === 0) return;

          cad.beginTransaction();
          try {
            let pNo = (() => {
              let max = 1000;
              for (const p of model.points) {
                const n = parseInt(p.pointNo, 10);
                if (Number.isFinite(n) && n > max) max = n;
              }
              return max + 1;
            })();
            const gjLayerOf = (raw: string) => {
              const slug = raw.replace(/[^a-zA-Z0-9_-]/g, "_").toUpperCase();
              return slug ? cad.ensureLayerById(slug).id : cad.ensureLayerById("GJ_IMPORT").id;
            };
            for (const p of parsed.points) {
              const pno = p.pointNo && !findPoint(p.pointNo) ? p.pointNo : String(pNo++);
              cad.addPoint({
                pointNo: pno,
                n: p.n,
                e: p.e,
                z: p.z ?? null,
                code: p.code ?? "",
                layerId: gjLayerOf(p.layerId ?? ""),
              });
            }
            for (const lw of parsed.linework) {
              if (lw.vertices.length < 2) continue;
              cad.addLinework({
                kind: lw.closed ? "boundary" : "polyline",
                vertices: lw.vertices.map((v) => ({ n: v.n, e: v.e })),
                closed: lw.closed,
                layerId: gjLayerOf(lw.layerId ?? ""),
              });
            }
          } finally {
            cad.endTransaction();
          }
          fitExtents();
          log(`GeoJSON import (${file.name}): ${parsed.points.length} point(s), ${parsed.linework.length} line object(s).`);
        } catch (err) {
          log(err instanceof Error ? err.message : "GeoJSON import failed.", "error");
        }
      })();
    };
    input.click();
  }, [cad, model.points, findPoint, fitExtents, log]);

  // ── DXF / DWG import from workspace files ─────────────────────────────────
  const importCadFile = useCallback(
    async (file: File) => {
      cad.beginTransaction();
      try {
        const result = await parseCadFile(file);
        const layerIdByName = new Map<string, string>();
        const layerIdPrefix = "CAD_";

        for (const layerName of result.layerNames) {
          const slug =
            layerName === "0"
              ? "0"
              : `${layerIdPrefix}${layerName.replace(/[^a-zA-Z0-9_-]/g, "_").toUpperCase()}`;
          const layer = cad.ensureLayerById(slug);
          const updates: Partial<{ name: string; color: string }> = {};
          if (layer.name !== layerName && layerName !== "0") {
            updates.name = layerName;
          }
          const layerStyle = result.layerStyles[layerName];
          if (layerStyle?.color && layerStyle.color.startsWith("#")) {
            updates.color = layerStyle.color.toLowerCase() === "#ffffff" ? "#000000" : layerStyle.color;
          }
          if (Object.keys(updates).length > 0) {
            cad.updateLayer(layer.id, updates);
          }
          layerIdByName.set(layerName, layer.id);
        }

        let pointCount = 0;
        let lineCount = 0;
        let textCount = 0;
        let skippedPaper = 0;

        const toColor = (style?: { color?: string | null }): string | undefined => {
          const c = style?.color;
          if (!c?.startsWith("#")) return undefined;
          // Pure white is invisible on the light CAD canvas; map to black.
          return c.toLowerCase() === "#ffffff" ? "#000000" : c;
        };

        // Batch-created points must not share a number: cad.nextPointNo() is
        // a stale closure that reports the pre-import maximum for every new
        // point. Count locally from the model snapshot.
        let importedPtNo = (() => {
          let max = 1000;
          for (const p of model.points) {
            const n = parseInt(p.pointNo, 10);
            if (Number.isFinite(n) && n > max) max = n;
          }
          return max + 1;
        })();

        for (const p of result.points) {
          if (p.paperSpace) {
            skippedPaper++;
            continue;
          }
          if (!Number.isFinite(p.n) || !Number.isFinite(p.e)) continue;
          cad.addPoint({
            pointNo: String(importedPtNo++),
            n: p.n,
            e: p.e,
            z: p.z,
            code: p.code || "CAD",
            layerId: layerIdByName.get(p.layerName) ?? "0",
            color: toColor(p.style),
          });
          pointCount++;
        }

        for (const lw of result.linework) {
          if (lw.paperSpace) {
            skippedPaper++;
            continue;
          }
          const vertices = lw.vertices.filter((v) => Number.isFinite(v.n) && Number.isFinite(v.e));
          if (vertices.length === 0) continue;
          cad.addLinework({
            kind: lw.kind === "line" ? "line" : "polyline",
            vertices: vertices.map((v) => ({ n: v.n, e: v.e })),
            closed: lw.closed,
            layerId: layerIdByName.get(lw.layerName) ?? "0",
            color: toColor(lw.style),
          });
          lineCount++;
        }

        for (const t of result.texts) {
          if (t.paperSpace) {
            skippedPaper++;
            continue;
          }
          if (!Number.isFinite(t.n) || !Number.isFinite(t.e)) continue;
          cad.addText({
            n: t.n,
            e: t.e,
            text: t.text,
            layerId: layerIdByName.get(t.layerName) ?? "0",
            height: t.height,
            rotation: t.rotation,
            color: toColor(t.style),
          });
          textCount++;
        }

        for (const a of result.arcs) {
          if (a.paperSpace) {
            skippedPaper++;
            continue;
          }
          if (!Number.isFinite(a.centerN) || !Number.isFinite(a.centerE)) continue;
          cad.addArc({
            center: { n: a.centerN, e: a.centerE },
            radius: a.radius,
            startAngle: a.startAngle,
            endAngle: a.endAngle,
            layerId: layerIdByName.get(a.layerName) ?? "0",
            color: toColor(a.style),
          });
        }

        for (const c of result.circles) {
          if (c.paperSpace) {
            skippedPaper++;
            continue;
          }
          if (!Number.isFinite(c.centerN) || !Number.isFinite(c.centerE)) continue;
          cad.addCircle({
            center: { n: c.centerN, e: c.centerE },
            radius: c.radius,
            layerId: layerIdByName.get(c.layerName) ?? "0",
            color: toColor(c.style),
          });
        }

        for (const h of result.hatches) {
          if (h.paperSpace) {
            skippedPaper++;
            continue;
          }
          const outer = h.vertices.filter((v) => Number.isFinite(v.n) && Number.isFinite(v.e));
          if (outer.length < 3) continue;
          cad.addHatch({
            vertices: outer.map((v) => ({ n: v.n, e: v.e })),
            holes: h.holes
              ?.map((hole) => hole.filter((v) => Number.isFinite(v.n) && Number.isFinite(v.e)))
              .filter((hole) => hole.length >= 3),
            pattern: h.pattern ?? null,
            patternScale: h.patternScale ?? null,
            patternAngle: h.patternAngle ?? null,
            layerId: layerIdByName.get(h.layerName) ?? "0",
            color: toColor(h.style),
          });
        }

        for (const d of result.dimensions) {
          if (d.paperSpace) {
            skippedPaper++;
            continue;
          }
          if (!Number.isFinite(d.textN) || !Number.isFinite(d.textE)) continue;
          cad.addDimension({
            kind: d.kind === "angular" || d.kind === "radial" || d.kind === "diameter"
              ? (d.kind as "linear" | "angular" | "radial" | "diameter")
              : "linear",
            text: d.text,
            textPosition: { n: d.textN, e: d.textE },
            defPoints: d.defPoints.filter((p) => Number.isFinite(p.n) && Number.isFinite(p.e)).map((p) => ({ n: p.n, e: p.e })),
            angle: d.angle ?? null,
            layerId: layerIdByName.get(d.layerName) ?? "0",
            color: toColor(d.style),
          });
        }

        for (const el of result.ellipses) {
          if (el.paperSpace) {
            skippedPaper++;
            continue;
          }
          if (!Number.isFinite(el.centerN) || !Number.isFinite(el.centerE)) continue;
          cad.addEllipse({
            center: { n: el.centerN, e: el.centerE },
            semiMajor: el.semiMajor,
            semiMinor: el.semiMinor,
            rotation: el.rotation,
            layerId: layerIdByName.get(el.layerName) ?? "0",
            color: toColor(el.style),
          });
        }

        for (const ins of result.inserts) {
          if (ins.paperSpace) {
            skippedPaper++;
            continue;
          }
          if (!Number.isFinite(ins.n) || !Number.isFinite(ins.e)) continue;
          cad.addText({
            n: ins.n,
            e: ins.e,
            text: ins.blockName,
            layerId: layerIdByName.get(ins.layerName) ?? "0",
            color: toColor(ins.style),
          });
          textCount++;
        }

        fitExtents();
        const backend = lastCadBackend();
        const parts = [
          `${pointCount} point(s)`,
          `${lineCount} line object(s)`,
          `${textCount} text object(s)`,
          `${result.circles.length} circle(s)`,
          `${result.arcs.length} arc(s)`,
          `${result.ellipses.length} ellipse(s)`,
          `${result.hatches.length} hatch(es)`,
          `${result.dimensions.length} dimension(s)`,
          `${result.inserts.length} block insert(s)`,
        ];
        log(`Imported ${file.name} (${backend}): ${parts.join(", ")}.`);
        if (skippedPaper > 0) {
          log(`Skipped ${skippedPaper} paper-space entity approximation(s).`, "info");
        }

        // Print a quick extents summary so users/devs can see where the geometry landed.
        const nVals = result.points.map((p) => p.n)
          .concat(result.linework.flatMap((lw) => lw.vertices.map((v) => v.n)))
          .concat(result.circles.map((c) => c.centerN))
          .concat(result.ellipses.map((el) => el.centerN))
          .concat(result.inserts.map((ins) => ins.n));
        const eVals = result.points.map((p) => p.e)
          .concat(result.linework.flatMap((lw) => lw.vertices.map((v) => v.e)))
          .concat(result.circles.map((c) => c.centerE))
          .concat(result.ellipses.map((el) => el.centerE))
          .concat(result.inserts.map((ins) => ins.e));
        if (nVals.length > 0 && eVals.length > 0) {
          // Running min/max — spreading a large import's coordinates into
          // Math.min(...vals) overflows the call stack.
          let minN = Infinity, maxN = -Infinity, minE = Infinity, maxE = -Infinity;
          for (const v of nVals) {
            if (!Number.isFinite(v)) continue;
            if (v < minN) minN = v;
            if (v > maxN) maxN = v;
          }
          for (const v of eVals) {
            if (!Number.isFinite(v)) continue;
            if (v < minE) minE = v;
            if (v > maxE) maxE = v;
          }
          if (Number.isFinite(minN) && Number.isFinite(minE)) {
            log(
              `Extents: N ${minN.toFixed(2)}..${maxN.toFixed(2)} · E ${minE.toFixed(2)}..${maxE.toFixed(2)}`,
              "info",
            );
          }
        }

        const unsupported = [...new Set(result.unsupported)];
        if (unsupported.length > 0) {
          log(
            `Skipped unsupported entities: ${unsupported.slice(0, 5).join(", ")}${unsupported.length > 5 ? "..." : ""}`,
            "info",
          );
        }
      } catch (err) {
        log(err instanceof Error ? err.message : "Failed to parse CAD file.", "error");
      } finally {
        cad.endTransaction();
      }
    },
    [cad, fitExtents, log, model.points],
  );

  // ── Geometry (GeoRust geo) ─────────────────────────────────────────────────

  const computeConvexHull = useCallback(
    () => runConvexHull(model, cad, cadServices),
    [model, cad, cadServices],
  );

  const simplifySelection = useCallback(
    () => runSimplifySelection(model, cad.selection, cad, cadServices),
    [model, cad, cadServices],
  );

  // ── Reprojection (GeoRust proj on desktop, Karney fallback on web) ─────────

  const reprojectDrawing = useCallback(
    () => runReproject(model, cad, cadServices),
    [model, cad, cadServices],
  );

  // ── Surface (TIN / contours / volumes) ─────────────────────────────────────

  const buildSurface = useCallback(
    () => runBuildSurface(model, cad, cadServices),
    [model, cad, cadServices],
  );

  // ── Field to finish: join coded points into linework strings ────────────────
  const processLinework = useCallback(
    () => runProcessLinework(model, cad, cadServices),
    [model, cad, cadServices],
  );

  // ── Breakline- and boundary-constrained TIN ─────────────────────────────────
  const buildSurfaceWithBreaklines = useCallback(
    () => runBuildSurfaceWithBreaklines(model, cad.selection, cad, cadServices),
    [model, cad, cadServices],
  );

  /** TIN clipped to the currently selected closed boundary (no breaklines). */
  const buildBoundarySurface = useCallback(
    () => runBuildBoundarySurface(model, cad.selection, cad, cadServices),
    [model, cad, cadServices],
  );

  /** Generate contour polylines (index + intermediate) from a TIN surface. */
  const buildContours = useCallback(
    () => runBuildContours(model, cad, cadServices),
    [model, cad, cadServices],
  );

  const computeVolumeToElevation = useCallback(
    () => runVolumeToElevation(model, cad, cadServices),
    [model, cad, cadServices],
  );

  const computeVolumeBetween = useCallback(
    () => runVolumeBetween(model, cad, cadServices),
    [model, cad, cadServices],
  );

  /** Slope/aspect shading overlay + terrain stats report for the latest TIN. */
  const analyseSurfaceTerrain = useCallback(
    () => runTerrainAnalysis(model, cad, cadServices),
    [model, cad, cadServices],
  );

  // ── Long-section (chainage / level profile) extraction ────────────────────

  const extractProfile = useCallback(
    () => runExtractProfile(model, cad.selection, cad, cadServices),
    [model, cad, cadServices],
  );

  // ── Annotation (boundary labels, area label) ────────────────────────────────

  const labelBoundarySegments = useCallback(() => {
    const sel = cad.selection;
    const lw = sel.type === "linework" && sel.id
      ? model.linework.find((l) => l.id === sel.id)
      : undefined;
    if (!lw) {
      log("Label boundary: select a polyline or boundary first.", "error");
      return;
    }
    const verts = lw.vertices;
    const segs = lw.closed ? verts.length : verts.length - 1;
    let placed = 0;
    cad.beginTransaction();
    try {
      for (let i = 0; i < segs; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        const r = inverse(a, b);
        const midN = (a.n + b.n) / 2;
        const midE = (a.e + b.e) / 2;
        const text = `${fmtBearing(r.azimuth, bearingFormat)}  ${fmtDistance(r.distance)} m`;
        cad.ensureLayerById("TEXT");
        cad.addText({ n: midN, e: midE, text, layerId: "TEXT" });
        placed += 1;
      }
    } finally {
      cad.endTransaction();
    }
    log(`Labelled ${placed} segment(s) with bearing & distance.`);
  }, [cad, model.linework, bearingFormat, log]);

  const labelArea = useCallback(() => {
    const sel = cad.selection;
    const lw = sel.type === "linework" && sel.id
      ? model.linework.find((l) => l.id === sel.id)
      : undefined;
    if (!lw || !lw.closed) {
      log("Label area: select a closed boundary first.", "error");
      return;
    }
    const area = polygonArea(lw.vertices);
    const perimeter = polylineLength(lw.vertices) +
      (lw.closed ? inverse(lw.vertices[lw.vertices.length - 1], lw.vertices[0]).distance : 0);
    const cN = lw.vertices.reduce((s, v) => s + v.n, 0) / lw.vertices.length;
    const cE = lw.vertices.reduce((s, v) => s + v.e, 0) / lw.vertices.length;
    cad.ensureLayerById("TEXT");
    cad.addText({ n: cN, e: cE, text: `Area: ${fmtArea(area)}`, layerId: "TEXT" });
    cad.addText({ n: cN - 3, e: cE, text: `Perimeter: ${fmtDistance(perimeter)} m`, layerId: "TEXT" });
    log(`Area label placed — ${fmtArea(area)}, perimeter ${fmtDistance(perimeter)} m.`);
  }, [cad, model.linework, log]);

  const labelCoordinates = useCallback(() => {
    const sel = cad.selection;
    const items = sel.items && sel.items.length
      ? sel.items
      : sel.type && sel.id
        ? [{ type: sel.type, id: sel.id }]
        : [];
    const ptIds = new Set(items.filter((i) => i.type === "point").map((i) => i.id));
    const pts = model.points.filter((p) => ptIds.has(p.id));
    if (pts.length === 0) {
      log("Coord label: select one or more points first.", "error");
      return;
    }
    cad.ensureLayerById("TEXT");
    for (const p of pts) {
      const text = `${p.e.toFixed(settings.coordDecimals)}, ${p.n.toFixed(settings.coordDecimals)}`;
      cad.addText({ n: p.n, e: p.e + 2, text, layerId: "TEXT", color: activeColor });
    }
    log(`Placed ${pts.length} coordinate label(s).`);
  }, [cad, model.points, settings.coordDecimals, activeColor, log]);

  const handleToggle = useCallback((key: "snap" | "ortho" | "grid" | "osnap") => {
    settingsApi.toggle(key === "grid" ? "showGrid" : key);
  }, [settingsApi]);

  const commandCtx = useMemo<RegistryHost>(
    () => ({
      cad,
      bearingFormat,
      axisConvention: settings.axisConvention,
      setTool: changeTool,
      log,
      fitExtents,
      layout: {
        toModel: () => layoutApi.setActive(MODEL_TAB),
        toLayout: openLayout,
        newLayout: handleAddLayout,
        plot: requestPlot,
        names: () => layoutApi.layouts.map((l) => l.name),
      },
      deleteSelection,
      explodeSelection,
      openProjectPoints: () => setProjectPointsOpen(true),
      openImportDxf: () => setImportDxfOpen(true),
      importGeoJson,
      exportDxf,
      exportCsv,
      exportReport,
      exportGeoJson,
      exportCutFillReport,
      openLayout,
      runIntersection,
      runInverse,
      runArea,
      labelBoundarySegments,
      labelArea,
      labelCoordinates,
      processLinework,
      computeConvexHull,
      simplifySelection,
      reprojectDrawing,
      buildSurface,
      buildSurfaceWithBreaklines,
      buildBoundarySurface,
      buildContours,
      computeVolumeToElevation,
      computeVolumeBetween,
      analyseSurfaceTerrain,
      extractProfile,
      toggleView: handleToggle,
      toggle3d: () => settingsApi.toggle("view3d"),
    }),
    [
      cad, bearingFormat, settings.axisConvention, changeTool, log, fitExtents, layoutApi, openLayout, handleAddLayout,
      requestPlot, deleteSelection, explodeSelection, importGeoJson, exportDxf, exportCsv, exportReport, exportGeoJson,
      exportCutFillReport, runIntersection, runInverse, runArea, labelBoundarySegments, labelArea, labelCoordinates,
      processLinework, computeConvexHull, simplifySelection, reprojectDrawing, buildSurface, buildSurfaceWithBreaklines,
      buildBoundarySurface, buildContours, computeVolumeToElevation, computeVolumeBetween, analyseSurfaceTerrain,
      extractProfile, handleToggle, settingsApi,
    ],
  );

  const registry = useMemo(() => buildCommandRegistry(DEFAULT_COMMAND_ENTRIES), []);

  const handleRibbonAction = useCallback(
    (actionId: string) => {
      registry.runRibbon(actionId, commandCtx);
    },
    [registry, commandCtx],
  );

  const handleCommandSubmit = useCallback(
    (raw: string) => {
      log(raw, "input");

      // AutoCAD-style distance<angle entry while drawing lines/boundaries.
      if (
        pendingVertices.length > 0 &&
        (tool === "line" || tool === "boundary")
      ) {
        const parsed = parseDistanceBearing(raw, settings.angleEntry);
        if (parsed) {
          const start = pendingVertices[pendingVertices.length - 1];
          const end = forward(start, parsed.azimuthDeg, parsed.distance);
          setPendingVertices((verts) => [...verts, end]);
          const axis = axisBadgeLabels(settings.axisConvention);
          log(
            `Segment ${fmtDistance(parsed.distance)} m @ ${fmtBearing(parsed.azimuthDeg, bearingFormat)} ` +
              `→ ${axis.first} ${fmtCoord(end.e)} ${axis.second} ${fmtCoord(end.n)}`,
          );
          return;
        }
      }

      runCommand(raw, commandCtx);
    },
    [commandCtx, settings.angleEntry, settings.axisConvention, tool, pendingVertices, setPendingVertices, bearingFormat, log],
  );

  const handleMenuAction = useCallback(
    (action: CadMenuAction) => {
      registry.runMenu(action, commandCtx);
    },
    [registry, commandCtx],
  );

  const handleKeyDown = useCallback(
    (ev: React.KeyboardEvent) => {
      const target = ev.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

      // Undo / redo (AutoCAD: Ctrl+Z / Ctrl+Y; also Ctrl+Shift+Z for redo)
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        if (ev.shiftKey) {
          if (cad.redo()) log("Redo."); else log("Nothing to redo.", "info");
        } else if (pendingVertices.length > 0) {
          // Mid-draw: undo the last picked vertex first, AutoCAD-style.
          setPendingVertices((v) => v.slice(0, -1));
        } else if (cad.undo()) {
          log("Undo.");
        } else {
          log("Nothing to undo.", "info");
        }
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") {
        ev.preventDefault();
        if (cad.redo()) log("Redo."); else log("Nothing to redo.", "info");
        return;
      }

      // Ctrl+A — select all (AutoCAD convention)
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "a") {
        ev.preventDefault();
        selectAll();
        return;
      }

      // F-key toggles (AutoCAD convention)
      if (ev.key === "F3") { ev.preventDefault(); handleToggle("osnap"); return; }
      if (ev.key === "F7") { ev.preventDefault(); handleToggle("grid"); return; }
      if (ev.key === "F8") { ev.preventDefault(); handleToggle("ortho"); return; }
      if (ev.key === "F9") { ev.preventDefault(); handleToggle("snap"); return; }

      if (ev.key === "Enter") { commitPending(false); return; }
      if (ev.key === "Escape") { cancelPending(); cad.setSelection({ type: null, id: null, items: [] }); return; }
      if (ev.key === "Delete") { deleteSelection(); return; }
      if (ev.key === "Backspace") {
        // While drawing, Backspace undoes the last picked vertex (AutoCAD U).
        // The running LINE polyline is kept in sync by the effect above.
        if ((tool === "line" || tool === "boundary") && pendingVertices.length > 0) {
          setPendingVertices((v) => v.slice(0, -1));
          if (tool === "line" && pendingVertices.length <= 1) {
            log("Line cancelled.");
          }
          return;
        }
        deleteSelection();
        return;
      }
      // Close the current chain (AutoCAD "C") when drawing linework.
      if (ev.key.toLowerCase() === "c" && pendingVertices.length >= 2 &&
          (tool === "line" || tool === "boundary")) {
        commitPending(true);
        return;
      }
      // Space repeats last tool (AutoCAD convention)
      if (ev.key === " ") {
        ev.preventDefault();
        if (lastTool !== tool) repeatLastTool();
        return;
      }
      const map: Record<string, CadToolId> = {
        s: "select", p: "pan", o: "point", l: "line",
        b: "boundary", t: "text", m: "measure",
      };
      const t = map[ev.key.toLowerCase()];
      if (t) changeTool(t);
    },
    [commitPending, cancelPending, deleteSelection, selectAll, changeTool, handleToggle, pendingVertices, cad, lastTool, tool, repeatLastTool, log],
  );

  const handleContextMenu = useCallback((ev: React.MouseEvent) => {
    ev.preventDefault();
    if (isDrawingTool) {
      commitPending();
    }
  }, [isDrawingTool, commitPending]);

  const scaleLabelMemo = useMemo(() => scaleLabel, [scaleLabel]);
  const drawingStats = useMemo(
    () => [
      { label: "CRS", value: cadCrsLabel(activeProject), title: cadCrsTooltip(activeProject) },
      { label: "PTS", value: model.points.length },
      { label: "LINES", value: model.linework.length },
      { label: "TEXT", value: model.texts.length },
      { label: "SURF", value: model.surfaces.length },
    ],
    [model.linework.length, model.points.length, model.texts.length, model.surfaces.length, activeProject],
  );

  const commandPrompt = useMemo(() => {
    if (tool === "line") {
      return pendingVertices.length === 0
        ? "LINE Specify first point:"
        : "Specify next point, type distance<bearing, or [Close/Undo] — Enter to finish:";
    }
    if (tool === "boundary") {
      return pendingVertices.length === 0
        ? "BOUNDARY Specify first corner point:"
        : "Specify next corner or [Close/Undo] — Enter to close:";
    }
    if (tool === "measure") return pendingVertices.length === 0 ? "Specify first point:" : "Specify second point:";
    if (tool === "circle") return pendingVertices.length === 0 ? "CIRCLE Specify centre point:" : "Specify point on circumference:";
    if (tool === "arc") {
      return pendingVertices.length === 0
        ? "ARC Specify start point:"
        : pendingVertices.length === 1
          ? "Specify second point on arc:"
          : "Specify end point of arc:";
    }
    if (tool === "rotate") return pendingVertices.length === 0 ? "ROTATE Specify base point:" : "Specify rotation angle (second point):";
    if (tool === "scale") return pendingVertices.length === 0 ? "SCALE Specify base point:" : "Scale factor applied.";
    if (tool === "mirror") return pendingVertices.length === 0 ? "MIRROR Specify first point of mirror line:" : "Specify second point of mirror line:";
    if (tool === "offset") return "OFFSET Specify signed offset distance (positive = left):";
    if (tool === "dim-linear") return pendingVertices.length === 0 ? "DIMLINEAR Specify first extension line origin:" : "Specify second extension line origin:";
    return "Command:";
  }, [tool, pendingVertices.length]);

  return (
    <section
      className="cad-workspace-shell"
      aria-label="Engineering Surveyor CAD workspace"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {projectPointsOpen && (
        <CadProjectPointsSelector
          projectId={activeProject.dbId}
          onImport={importProjectPoints}
          onClose={() => setProjectPointsOpen(false)}
        />
      )}

      <CadImportDxfDialog
        open={importDxfOpen}
        workspaceId={workspaceId}
        projectId={activeProject.dbId}
        onClose={() => setImportDxfOpen(false)}
        onImport={importCadFile}
      />

      <header className="cad-topbar">
        <div className="cad-topbar-left">
          <button className="hub-mobile-menu-btn" style={{ marginRight: "8px" }} onClick={() => setProjectMobileMenuOpen(true)} type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="cad-brand-lockup">
            <span className="cad-project-ref hide-on-mobile">{activeProject.id} · {activeProject.name}</span>
          </div>
        </div>
        <div className="cad-topbar-center hide-on-mobile">
          <span className="cad-topbar-center-stats" aria-label="Drawing summary">
            {drawingStats.map((stat) => (
              <span className="cad-stat-pill" key={stat.label} title={stat.title ?? ''}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </span>
            ))}
          </span>
        </div>
        <div className="cad-topbar-actions">
          <div className="cad-layer-control" title="Set active layer">
            <span
              className="cad-layer-swatch-inline"
              style={{ background: model.layers.find((l) => l.id === model.activeLayerId)?.color ?? "#888" }}
            />
            <div className="cad-layer-select-wrap">
              <select
                value={model.activeLayerId}
                onChange={(e) => cad.setActiveLayer(e.target.value)}
                aria-label="Active layer"
              >
                {model.layers.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <ChevronDown size={12} className="cad-layer-select-arrow" aria-hidden="true" />
            </div>
          </div>

          <div
            className="cad-layer-control"
            title={
              activeColor
                ? ((cad.selection.items?.length ?? (cad.selection.id ? 1 : 0)) > 0
                  ? "Set colour of selected objects"
                  : "Drawing colour for new objects")
                : "ByLayer — follows active layer colour"
            }
          >
            <span
              className={`cad-layer-swatch-inline ${activeColor ? "" : "bylayer"}`}
              style={{
                background: activeColor ?? "transparent",
                ...(activeColor ? {} : {
                  backgroundImage: "linear-gradient(45deg,#999 25%,transparent 25%,transparent 75%,#999 75%),linear-gradient(45deg,#999 25%,transparent 25%,transparent 75%,#999 75%)",
                  backgroundSize: "6px 6px",
                  backgroundPosition: "0 0, 3px 3px",
                }),
              }}
            />
            <div className="cad-layer-select-wrap">
              <select
                value={activeColor ?? "bylayer"}
                aria-label="Drawing colour"
                onChange={(e) => {
                  const val = e.target.value === "bylayer" ? null : e.target.value;
                  setActiveColor(val);
                  const n = cad.setColorOfSelection(val);
                  if (n > 0) log(`Set colour on ${n} object${n === 1 ? "" : "s"}.`);
                }}
              >
                {CAD_COLORS.map((c) => (
                  <option key={c.label} value={c.value ?? "bylayer"}>{c.label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="cad-layer-select-arrow" aria-hidden="true" />
            </div>
          </div>

          <div className="cad-view-toggle" role="group" aria-label="View mode (2D / 3D)">
            <button
              type="button"
              className={`cad-view-toggle-btn ${!view3d ? "active" : ""}`}
              onClick={() => { if (view3d) { settingsApi.toggle("view3d"); log("Switched to 2D plan view."); } }}
              title="2D plan view (top-down)"
              aria-pressed={!view3d}
            >
              <Square size={13} /> 2D
            </button>
            <button
              type="button"
              className={`cad-view-toggle-btn ${view3d ? "active" : ""}`}
              onClick={() => { if (!view3d) { settingsApi.toggle("view3d"); log("Switched to true-3D orbit view — drag to orbit, right/two-finger drag to pan, wheel to zoom."); } }}
              title="True 3D orbit view (uses point and surface elevations)"
              aria-pressed={view3d}
            >
              <Box size={13} /> 3D
            </button>
          </div>

          <button
            type="button"
            className={`cad-settings-btn ${aiChatOpen ? "active" : ""}`}
            onClick={() => setAiChatOpen((v) => !v)}
            title="SiteSurveyor AI"
            aria-label="SiteSurveyor AI"
            aria-pressed={aiChatOpen}
          >
            <Bot size={16} />
          </button>

          <div className="cad-settings-anchor">
            <button
              type="button"
              className={`cad-settings-btn ${settingsOpen ? "active" : ""}`}
              onClick={() => setSettingsOpen((v) => !v)}
              title="Drawing settings — units, precision, snap & display"
              aria-label="Drawing settings"
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
            >
              <SlidersHorizontal size={16} />
            </button>
            {settingsOpen && (
              <CadSettingsPopover
                open={settingsOpen}
                onOpenChange={(v) => setSettingsOpen(v)}
                settingsApi={settingsApi}
                onApplyScale={applyScale}
                onFitExtents={fitExtents}
              />
            )}
          </div>

          <span
            className={`cad-sync-status ${cad.syncStatus}`}
            title={cad.syncError ?? undefined}
          >
            <span className="cad-sync-dot" aria-hidden="true" />
            {cad.syncStatus === "loading" && "Loading…"}
            {cad.syncStatus === "saving" && "Saving…"}
            {cad.syncStatus === "saved" && "All changes saved"}
            {cad.syncStatus === "error" && "Offline — saved locally"}
          </span>
          <button className="cad-exit-btn" type="button" onClick={exitCadWorkspace} title="Exit CAD workspace">Exit</button>
        </div>
      </header>

      <CadMenuBar onAction={handleMenuAction} />

      <CadRibbon
        activeTab={ribbonTab}
        onTabChange={setRibbonTab}
        onAction={handleRibbonAction}
        datum={datum}
        tool={tool}
        canUndo={cad.canUndo}
        canRedo={cad.canRedo}
      />

      <div className="cad-workspace-body">
        {view3d ? (
          <Cad3dViewport
            model={model}
            zScale={settings.zScale}
            coordDecimals={settings.coordDecimals}
            axisConvention={settings.axisConvention}
            showPointLabels={settings.showPointLabels}
            fitSignal={fitSignal}
            selection={selection}
            tool={tool}
            projectId={activeProject.dbId}
            onCursorMove={(w) => setCursor({ n: w.n, e: w.e })}
          />
        ) : (
          <CadViewport
            model={model}
            tool={tool}
            selection={selection}
            bearingFormat={bearingFormat}
            snap={snap}
            ortho={ortho}
            showGrid={showGrid}
            osnap={osnap}
            snapAuto={settings.snapAuto}
            snapSpacing={settings.snapSpacing}
            coordDecimals={settings.coordDecimals}
            axisConvention={settings.axisConvention}
            showPointLabels={settings.showPointLabels}
            showPointElevations={settings.showPointElevations}
            showSegmentLabels={settings.showSegmentLabels}
            scaleSignal={scaleSignal}
            scaleTarget={scaleTarget}
            onCursorMove={setCursor}
            onPickPoint={handlePickPoint}
            onSelectEntity={handleSelectEntity}
            pendingVertices={pendingVertices}
            fitSignal={fitSignal}
            onScaleChange={setScaleLabel}
            onCommit={commitPending}
            onContextMenu={handleContextMenu}
            onDynInput={handleDynInput}
            onKeyDown={(ev) => {
              // The viewport holds focus after a pick, so handle keys here and
              // stop them bubbling to the section to avoid double handling.
              handleKeyDown(ev);
              ev.stopPropagation();
            }}
          />
        )}

        <CadRightPanel
          cad={cad}
          model={model}
          selection={selection}
          bearingFormat={bearingFormat}
          axisConvention={settings.axisConvention}
        />

        {aiChatOpen && (
          <aside className="hidden h-full w-80 shrink-0 md:block">
            <CadChatPanel projectId={activeProject.dbId} cad={cad} onClose={() => setAiChatOpen(false)} />
          </aside>
        )}
      </div>

      <CadCommandLine
        prompt={commandPrompt}
        log={commandLog}
        onSubmit={handleCommandSubmit}
      />

      <CadStatusBar
        cursor={cursor}
        snap={snap}
        ortho={ortho}
        showGrid={showGrid}
        osnap={osnap}
        onToggle={handleToggle}
        scaleLabel={scaleLabelMemo}
        datum={datum}
        coordDecimals={settings.coordDecimals}
        axisConvention={settings.axisConvention}
        scaleDenominator={settings.scaleDenominator}
        layouts={layoutApi.layouts}
        activeTab={layoutApi.active}
        onSelectTab={handleSelectTab}
        onAddLayout={handleAddLayout}
        onRenameLayout={layoutApi.rename}
        onDuplicateLayout={layoutApi.duplicate}
        onDeleteLayout={layoutApi.remove}
      />

      {/* Paper space: the active layout's to-scale sheet (AutoCAD layout tab). */}
      {layoutApi.inLayout && layoutApi.activeLayout && (
        <CadPlotDialog
          key={layoutApi.activeLayout.id}
          model={model}
          bearingFormat={bearingFormat}
          axisConvention={settings.axisConvention}
          initialOptions={layoutApi.activeLayout.options}
          fileStem={`${activeProject.id.replace(/[^a-z0-9_-]/gi, "_")}_${layoutApi.activeLayout.name.replace(/[^a-z0-9_-]/gi, "_")}`}
          layoutName={layoutApi.activeLayout.name}
          onClose={() => layoutApi.setActive(MODEL_TAB)}
          onOptionsChange={(opts) => layoutApi.updateOptions(layoutApi.activeLayout!.id, opts)}
          log={log}
        />
      )}

      {/* Ad-hoc one-off plot (ribbon Plot button, unbound to a layout). */}
      {plotOpen && (
        <CadPlotDialog
          model={model}
          bearingFormat={bearingFormat}
          axisConvention={settings.axisConvention}
          initialOptions={plotOptions}
          fileStem={activeProject.id.replace(/[^a-z0-9_-]/gi, "_")}
          onClose={() => setPlotOpen(false)}
          log={log}
        />
      )}

      <CadPointDialog
        open={pointForm.open}
        initialPointNo={pointForm.pointNo}
        initialCode={pointForm.code}
        initialElevation={pointForm.elev}
        title={pointForm.title}
        onSubmit={(v) => {
          if (!pointForm.world) return;
          const created = cad.addPoint({
            pointNo: v.pointNo,
            n: pointForm.world.n,
            e: pointForm.world.e,
            z: v.z,
            code: v.code,
            layerId: pointForm.layerId,
            color: activeColor,
          });
          const zText = v.z == null ? "no RL" : `RL ${v.z.toFixed(settings.coordDecimals)}`;
          const axis1 = axisBadgeLabels(settings.axisConvention);
          log(`Point ${created.pointNo} placed: ${axis1.first} ${fmtCoord(pointForm.world.e)} ${axis1.second} ${fmtCoord(pointForm.world.n)} · ${zText}`);
          setPointForm((prev) => ({
            ...prev,
            open: false,
            world: null,
            code: v.code,
            elev: v.z == null ? "" : String(v.z),
          }));
        }}
        onCancel={() => setPointForm((prev) => ({ ...prev, open: false, world: null }))}
      />

      <CadControlPointDialog
        open={controlPointForm.open}
        initialPointNo={controlPointForm.pointNo}
        initialCode={controlPointForm.code}
        axisConvention={settings.axisConvention}
        onSubmit={(v) => {
          const created = cad.addPoint({
            pointNo: v.pointNo,
            n: v.n,
            e: v.e,
            z: v.z,
            code: v.code,
            layerId: "CONTROL",
            color: activeColor,
          });
          const zText = v.z == null ? "no RL" : `RL ${v.z.toFixed(settings.coordDecimals)}`;
          const axis2 = axisBadgeLabels(settings.axisConvention);
          log(`Control point ${created.pointNo} placed: ${axis2.first} ${fmtCoord(v.e)} ${axis2.second} ${fmtCoord(v.n)} · ${zText}`);
          setControlPointForm({ open: true, pointNo: cad.nextPointNo(), code: v.code });
        }}
        onCancel={() => {
          setControlPointForm((prev) => ({ ...prev, open: false }));
          changeTool("select");
        }}
      />

      <CadReportDialog
        open={reportDialog?.open ?? false}
        title={reportDialog?.title ?? ""}
        html={reportDialog?.html ?? ""}
        onClose={() => setReportDialog(null)}
      />
    </section>
  );
}
