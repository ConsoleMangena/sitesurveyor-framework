import {
  Activity,
  Crosshair,
  Database,
  Eraser,
  FileDown,
  FileText,
  FolderGit2,
  Hand,
  Layers,
  LogOut,
  MapPin,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RefreshCw,
  RotateCcw,
  Ruler,
  Sparkles,
  Table2,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { CATEGORY_LABELS, SURVEY_CATEGORY_OPTIONS, type DossierCategory } from "@/lib/surveys/labels.ts";
import type { MapViewInfo } from "./SurveyMap.tsx";

export interface EnginePill {
  state: "ready" | "running" | "error";
  text: string;
}

/** The ribbon is organised by the work being done, the way a GIS workstation is. */
export type RibbonTab = "home" | "data" | "analyze" | "view" | "publish";

/** What a click on the canvas means. Pan is the default and the only one that drags. */
export type MapTool = "pan" | "measure" | "target";

export type ContentsTab = "layers" | "data" | "jobs";

/** One published file the reader can take away. Absent means the run did not write it. */
export interface PublishItem {
  kind: string;
  label: string;
  available: boolean;
}

interface WorkbenchBarProps {
  tab: RibbonTab;
  onTab: (tab: RibbonTab) => void;
  pill: EnginePill;
  onRun: () => void;
  /** A survey is queued or in progress, so a second click cannot pay for another. */
  running: boolean;
  onReload: () => void;
  onClear: () => void;
  /** Hand the survey on screen to SiteSurveyor AI; absent when no run is open. */
  onAskAi?: () => void;
  /** The process the next run will execute. Exactly one, as the platform requires. */
  process: DossierCategory;
  onProcess: (category: DossierCategory) => void;
  onOpenContents: (tab: ContentsTab) => void;
  onResetView: () => void;
  mapTool: MapTool;
  onMapTool: (tool: MapTool) => void;
  tableOpen: boolean;
  onToggleTable: () => void;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onBackToProject?: () => void;
  /** True once a completed run is on screen; nothing can be published before then. */
  published: boolean;
  onExportPdf: () => void;
  downloads: PublishItem[];
  onDownload: (kind: string) => void;
}

const TABS: { id: RibbonTab; label: string; icon: typeof FolderGit2 }[] = [
  { id: "home", label: "Home", icon: FolderGit2 },
  { id: "data", label: "Data", icon: Database },
  { id: "analyze", label: "Analyze", icon: Activity },
  { id: "view", label: "View", icon: Layers },
  { id: "publish", label: "Publish", icon: FileDown },
];

const MAP_TOOLS: { id: MapTool; label: string; icon: typeof Hand; hint: string }[] = [
  { id: "pan", label: "Pan", icon: Hand, hint: "Drag the canvas" },
  { id: "measure", label: "Measure", icon: Ruler, hint: "Click vertices for distance and area" },
  { id: "target", label: "Place target", icon: MapPin, hint: "Click to move the survey centre" },
];

/**
 * The workbench ribbon.
 *
 * Selecting a tab reveals that tab's tools; it never performs an action on its own.
 * Opening a pane is navigation and happens on selection, but exporting a sheet is not,
 * so Publish waits for the reader to press the button.
 */
export function WorkbenchBar({
  tab,
  onTab,
  pill,
  onRun,
  running,
  onReload,
  onClear,
  onAskAi,
  process,
  onProcess,
  onOpenContents,
  onResetView,
  mapTool,
  onMapTool,
  tableOpen,
  onToggleTable,
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
  isFullscreen,
  onToggleFullscreen,
  onBackToProject,
  published,
  onExportPdf,
  downloads,
  onDownload,
}: WorkbenchBarProps) {
  function selectTab(next: RibbonTab) {
    onTab(next);
    if (next === "data") onOpenContents("data");
    if (next === "analyze" && !rightOpen) onToggleRight();
  }

  return (
    <div className="sw-ribbon mb-2 rounded-lg border border-border/80 bg-card/90 shadow-sm backdrop-blur-md">
      <div className="sw-ribbon__tabs flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-2 py-1">
        <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Workbench ribbon">
          {TABS.map(({ id, label, icon: Icon }) => (
            <RibbonTabButton
              key={id}
              active={tab === id}
              onClick={() => selectTab(id)}
              icon={<Icon className="size-3.5" />}
              label={label}
            />
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
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
              title={isFullscreen ? "Show the workspace navigation" : "Fill the window with the workbench"}
            >
              {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              <span className="sr-only">Toggle fullscreen</span>
            </Button>
          ) : null}

          {onBackToProject ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={onBackToProject}
              title="Back to project"
            >
              <LogOut className="size-3.5" />
              <span className="sr-only">Back to project</span>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="sw-ribbon__actions flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={`${tab} tools`}>
          {tab === "home" ? (
            <>
              <RibbonButton onClick={onRun} disabled={running} icon={Play} label="Run survey" primary />
              {onAskAi ? (
                <RibbonButton onClick={onAskAi} icon={Sparkles} label="Ask AI" title="Discuss this survey with SiteSurveyor AI" />
              ) : null}
              <Divider />
              <RibbonButton onClick={onResetView} icon={RotateCcw} label="Fit AOI" title="Frame the study area again" />
              <RibbonButton onClick={onReload} icon={RefreshCw} label="Reload" title="Ask the platform for the queue again" />
              <RibbonButton onClick={onClear} icon={Eraser} label="Clear board" title="Take this survey off the canvas without deleting it" />
            </>
          ) : null}

          {tab === "data" ? (
            <>
              <RibbonButton
                onClick={() => onOpenContents("data")}
                icon={Database}
                label="EO coverages"
                title="The coverages this run actually read, as it recorded them"
              />
              <RibbonButton onClick={() => onOpenContents("layers")} icon={Layers} label="Layers" />
              <RibbonButton onClick={() => onOpenContents("jobs")} icon={FolderGit2} label="Jobs & runs" />
            </>
          ) : null}

          {tab === "analyze" ? (
            <>
              <div className="flex items-center gap-1" role="group" aria-label="EO process">
                {SURVEY_CATEGORY_OPTIONS.map(({ id, dossier }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={process === dossier}
                    onClick={() => onProcess(dossier)}
                    title={`${CATEGORY_LABELS[dossier].name} — produces ${CATEGORY_LABELS[dossier].noun}`}
                    className={`h-7 rounded-md border px-2 text-[11.5px] font-medium transition-colors ${
                      process === dossier
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {CATEGORY_LABELS[dossier].short}
                  </button>
                ))}
              </div>
              <Divider />
              <RibbonButton
                onClick={onRun}
                disabled={running}
                icon={Play}
                label={`Run ${CATEGORY_LABELS[process].short}`}
                primary
              />
              <RibbonButton
                onClick={onToggleRight}
                icon={Activity}
                label={rightOpen ? "Hide results" : "Show results"}
              />
            </>
          ) : null}

          {tab === "view" ? (
            <>
              <div className="flex items-center gap-1" role="group" aria-label="Canvas tool">
                {MAP_TOOLS.map(({ id, label, icon: Icon, hint }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={mapTool === id}
                    onClick={() => onMapTool(id)}
                    title={hint}
                    className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11.5px] font-medium transition-colors ${
                      mapTool === id
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <Divider />
              <RibbonButton
                onClick={onToggleTable}
                icon={Table2}
                label="Attribute table"
                pressed={tableOpen}
              />
              <RibbonButton onClick={onResetView} icon={Crosshair} label="Fit AOI" />
            </>
          ) : null}

          {tab === "publish" ? (
            <>
              <RibbonButton
                onClick={onExportPdf}
                disabled={!published}
                icon={FileText}
                label="PDF map sheet"
                primary
                title={published ? "Export the cartographic sheet" : "Run or select a completed survey first"}
              />
              <Divider />
              {downloads.map((item) => (
                <RibbonButton
                  key={item.kind}
                  onClick={() => onDownload(item.kind)}
                  disabled={!item.available}
                  icon={FileDown}
                  label={item.label}
                  title={item.available ? `Download ${item.label}` : "This run did not publish that file"}
                />
              ))}
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <PanelToggle side="left" open={leftOpen} onClick={onToggleLeft} label="Contents" />
          <PanelToggle side="right" open={rightOpen} onClick={onToggleRight} label="Analysis" />
        </div>
      </div>
    </div>
  );
}

function RibbonButton({
  onClick,
  icon: Icon,
  label,
  disabled,
  primary,
  pressed,
  title,
}: {
  onClick: () => void;
  icon: typeof Play;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  pressed?: boolean;
  title?: string;
}) {
  return (
    <Button
      type="button"
      variant={primary ? "default" : "outline"}
      size="sm"
      className={`h-7 shrink-0 gap-1.5 text-[11.5px] ${
        pressed ? "bg-accent/40 font-semibold" : ""
      } ${primary ? "" : "font-medium"}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-pressed={pressed}
    >
      <Icon className={`size-3.5 shrink-0 ${primary ? "fill-current" : ""}`} aria-hidden="true" />
      <span>{label}</span>
    </Button>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-border/80" aria-hidden="true" />;
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
      className={`relative flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "bg-background font-semibold text-foreground shadow-xs"
          : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
      }`}
    >
      <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      <span>{label}</span>
      {active ? (
        <span className="absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-primary" aria-hidden="true" />
      ) : null}
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
    ? side === "left" ? PanelLeftClose : PanelRightClose
    : side === "left" ? PanelLeftOpen : PanelRightOpen;
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
  /** What the canvas tool is measuring, when one is active. */
  measure?: string | null;
}

/** The thin line that tells you where the camera is and what the queue is doing. */
export function StatusStrip({ view, crs, job, basis, measure }: StatusStripProps) {
  return (
    <footer className="sw-status mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/70 bg-card/70 px-3 py-1.5 text-[11px] text-muted-foreground shadow-2xs backdrop-blur-xs">
      <div className="flex items-center gap-1.5 font-mono">
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        <span className="font-semibold text-foreground">{view?.coords ?? "—"}</span>
      </div>
      <Sep />
      <span className="font-mono text-[10.5px]">{crs}</span>
      <Sep />
      <span className="font-mono text-[10.5px]">{view ? `Zoom ${view.zoom} · ${view.scale}` : "Zoom —"}</span>
      <Sep />
      <span role="status" aria-live="polite" className="font-medium text-foreground">
        {job}
      </span>
      {measure ? (
        <>
          <Sep />
          <span className="font-mono text-[10.5px] text-foreground" aria-live="polite">{measure}</span>
        </>
      ) : null}
      <span className="ml-auto font-mono text-[10px] text-muted-foreground/80">{basis}</span>
    </footer>
  );
}

function Sep() {
  return <span className="size-1 rounded-full bg-border" aria-hidden="true" />;
}