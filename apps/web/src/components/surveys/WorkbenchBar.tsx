import { useState } from "react";
import {
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RefreshCw,
  RotateCcw,
  Eraser,
  Maximize2,
  Minimize2,
  LogOut,
  Sparkles,
  Layers,
  Crosshair,
  Activity,
  FileDown,
  FolderGit2,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import type { MapViewInfo } from "./SurveyMap.tsx";

export interface EnginePill {
  state: "ready" | "running" | "error";
  text: string;
}

export type RibbonTab = "project" | "layers" | "analysis" | "targets" | "export";

interface WorkbenchBarProps {
  onRun: () => void;
  /** A survey is queued or in progress, so a second click cannot pay for another. */
  running: boolean;
  onResetView: () => void;
  onReload: () => void;
  onClear: () => void;
  onExportView?: () => void;
  /** Hand the survey on screen to SiteSurveyor AI; absent when no run is open. */
  onAskAi?: () => void;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  pill: EnginePill;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onExitProject?: () => void;
  activeCategory?: string;
}

/**
 * Modern GIS Workstation Ribbon Bar (inspired by RustGIS / ArcGIS Pro).
 *
 * Provides a structured, task-driven ribbon interface organized into:
 * - PROJECT: Execution, AI copilot, queue reload, canvas reset
 * - LAYERS: Map contents, basemap selection, raster drape controls
 * - ANALYSIS: Prospectivity screening, multi-criteria models
 * - TARGETS: Candidate site attributes, drilling/exploration coordinates
 * - EXPORT: Cartographic PDF sheets, mobile GPS KMZ, spatial GeoTIFFs
 */
export function WorkbenchBar({
  onRun,
  running,
  onResetView,
  onReload,
  onClear,
  onExportView,
  onAskAi,
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
  pill,
  isFullscreen,
  onToggleFullscreen,
  onExitProject,
}: WorkbenchBarProps) {
  const [activeTab, setActiveTab] = useState<RibbonTab>("project");

  return (
    <div className="sw-ribbon mb-2 rounded-lg border border-border/80 bg-card/90 shadow-sm backdrop-blur-md transition-all">
      {/* Top Ribbon Tabs Header */}
      <div className="sw-ribbon__tabs flex items-center justify-between border-b border-border/60 px-2 py-1 bg-muted/30">
        <div className="flex items-center gap-1" role="tablist" aria-label="GIS Ribbon Navigation">
          <RibbonTabButton
            active={activeTab === "project"}
            onClick={() => setActiveTab("project")}
            icon={<FolderGit2 className="size-3.5" />}
            label="Project"
          />
          <RibbonTabButton
            active={activeTab === "layers"}
            onClick={() => {
              setActiveTab("layers");
              if (!leftOpen) onToggleLeft();
            }}
            icon={<Layers className="size-3.5" />}
            label="Layers"
          />
          <RibbonTabButton
            active={activeTab === "analysis"}
            onClick={() => {
              setActiveTab("analysis");
              if (!rightOpen) onToggleRight();
            }}
            icon={<Activity className="size-3.5" />}
            label="Analysis"
          />
          <RibbonTabButton
            active={activeTab === "targets"}
            onClick={() => {
              setActiveTab("targets");
              if (!rightOpen) onToggleRight();
            }}
            icon={<Crosshair className="size-3.5" />}
            label="Targets"
          />
          <RibbonTabButton
            active={activeTab === "export"}
            onClick={() => {
              setActiveTab("export");
              onExportView?.();
            }}
            icon={<FileDown className="size-3.5" />}
            label="Export"
          />
        </div>

        {/* Right Station Telemetry */}
        <div className="flex items-center gap-2">
          <span className="sw-pill" data-state={pill.state}>
            <i aria-hidden="true" />
            <span className="font-mono text-[11px]">{pill.text}</span>
          </span>

          {onToggleFullscreen ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={onToggleFullscreen}
              title={isFullscreen ? "Exit Fill Dashboard" : "Fill Dashboard with Earth Observation UI"}
            >
              {isFullscreen ? (
                <Minimize2 className="size-3.5" aria-hidden="true" />
              ) : (
                <Maximize2 className="size-3.5" aria-hidden="true" />
              )}
              <span className="sr-only">Toggle fullscreen</span>
            </Button>
          ) : null}

          {onExitProject ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-destructive hover:bg-destructive/10"
              onClick={onExitProject}
              title="Exit current project"
            >
              <LogOut className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Exit project</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Ribbon Action Tool Group */}
      <div className="sw-ribbon__actions flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Active Tools">
          {activeTab === "project" && (
            <>
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1.5 text-[11.5px] font-medium shadow-sm transition-all"
                disabled={running}
                onClick={onRun}
              >
                <Play className="size-3.5 fill-current shrink-0" aria-hidden="true" />
                <span>Run Survey</span>
              </Button>

              {onAskAi ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-[11.5px] border-primary/30 text-primary hover:bg-primary/10 shrink-0"
                  onClick={onAskAi}
                  title="Discuss this survey with SiteSurveyor AI"
                >
                  <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>Ask AI</span>
                </Button>
              ) : null}

              <div className="h-4 w-px bg-border/80 mx-1" aria-hidden="true" />

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-[11.5px] shrink-0"
                onClick={onResetView}
                title="Frame the study area again"
              >
                <RotateCcw className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Reset View</span>
                <span className="sm:hidden">Reset</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-[11.5px] shrink-0"
                onClick={onReload}
                title="Ask the platform for the queue again"
              >
                <RefreshCw className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Reload</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-[11.5px] shrink-0 text-muted-foreground hover:text-foreground"
                onClick={onClear}
                title="Clear board without deleting"
              >
                <Eraser className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Clear Board</span>
              </Button>
            </>
          )}

          {activeTab === "layers" && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-7 gap-1.5 text-[11.5px] ${leftOpen ? "bg-accent/40 font-semibold" : ""}`}
                onClick={onToggleLeft}
                title="Toggle Contents & Layers panel"
              >
                <Layers className="size-3.5 shrink-0" />
                <span>{leftOpen ? "Hide Layers Pane" : "Show Layers Pane"}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-[11.5px]"
                onClick={onResetView}
              >
                <RotateCcw className="size-3.5 shrink-0" />
                <span>Fit AOI</span>
              </Button>
            </>
          )}

          {activeTab === "analysis" && (
            <>
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1.5 text-[11.5px] font-medium"
                disabled={running}
                onClick={onRun}
              >
                <Play className="size-3.5 fill-current shrink-0" />
                <span>Re-run Analysis</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-7 gap-1.5 text-[11.5px] ${rightOpen ? "bg-accent/40 font-semibold" : ""}`}
                onClick={onToggleRight}
              >
                <Activity className="size-3.5 shrink-0" />
                <span>{rightOpen ? "Hide Analysis Pane" : "Show Analysis Pane"}</span>
              </Button>
            </>
          )}

          {activeTab === "targets" && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-7 gap-1.5 text-[11.5px] ${rightOpen ? "bg-accent/40 font-semibold" : ""}`}
                onClick={onToggleRight}
              >
                <Crosshair className="size-3.5 shrink-0" />
                <span>Candidate Attributes Table</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-[11.5px]"
                onClick={onResetView}
              >
                <RotateCcw className="size-3.5 shrink-0" />
                <span>Focus AOI</span>
              </Button>
            </>
          )}

          {activeTab === "export" && (
            <>
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1.5 text-[11.5px] font-medium bg-primary text-primary-foreground"
                onClick={onExportView}
                title="Export high-res PDF Map Sheet"
              >
                <FileText className="size-3.5 shrink-0" />
                <span>PDF Cartographic Sheet</span>
              </Button>
            </>
          )}
        </div>

        {/* Panel Toggles Group */}
        <div className="flex items-center gap-1.5">
          <PanelToggle
            side="left"
            open={leftOpen}
            onClick={onToggleLeft}
            label="Contents"
          />
          <PanelToggle
            side="right"
            open={rightOpen}
            onClick={onToggleRight}
            label="Analysis"
          />
        </div>
      </div>
    </div>
  );
}

function RibbonTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-all rounded-md ${
        active
          ? "bg-background text-foreground shadow-xs font-semibold"
          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
      }`}
    >
      <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      <span>{label}</span>
      {active && (
        <span
          className="absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-primary"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

function PanelToggle({
  side,
  open,
  onClick,
  label,
}: {
  side: "left" | "right";
  open: boolean;
  onClick: () => void;
  label: string;
}) {
  const Icon = open
    ? side === "left"
      ? PanelLeftClose
      : PanelRightClose
    : side === "left"
      ? PanelLeftOpen
      : PanelRightOpen;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7"
      aria-expanded={open}
      onClick={onClick}
      title={`${open ? "Hide" : "Show"} ${label}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="sr-only">{`${open ? "Hide" : "Show"} ${label} panel`}</span>
    </Button>
  );
}

interface StatusStripProps {
  view: MapViewInfo | null;
  crs: string;
  job: string;
  basis: string;
}

/** The thin line that tells you where the camera is and what the queue is doing.
 *
 * Formatted with precision GIS telemetry metrics (CRS, Lat/Lon, scale, status).
 */
export function StatusStrip({ view, crs, job, basis }: StatusStripProps) {
  return (
    <footer className="sw-status mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/70 bg-card/70 px-3 py-1.5 text-[11px] text-muted-foreground shadow-2xs backdrop-blur-xs">
      <div className="flex items-center gap-1.5 font-mono">
        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
        <span className="text-foreground font-semibold">{view?.coords ?? "—"}</span>
      </div>
      <Sep />
      <span className="font-mono text-[10.5px]">{crs}</span>
      <Sep />
      <span className="font-mono text-[10.5px]">{view ? `Zoom ${view.zoom} · ${view.scale}` : "Zoom —"}</span>
      <Sep />
      <span role="status" aria-live="polite" className="text-foreground font-medium">
        {job}
      </span>
      <span className="ml-auto font-mono text-[10px] text-muted-foreground/80">{basis}</span>
    </footer>
  );
}

function Sep() {
  return (
    <span className="size-1 rounded-full bg-border" aria-hidden="true" />
  );
}
