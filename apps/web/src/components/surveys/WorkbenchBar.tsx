import {
  Camera,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RefreshCw,
  RotateCcw,
  Eraser,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import type { MapViewInfo } from "./SurveyMap.tsx";

export interface EnginePill {
  state: "ready" | "running" | "error";
  text: string;
}

interface WorkbenchBarProps {
  onRun: () => void;
  /** A survey is queued or in progress, so a second click cannot pay for another. */
  running: boolean;
  onResetView: () => void;
  onReload: () => void;
  onClear: () => void;
  onExportView?: () => void;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  pill: EnginePill;
}

/** The engine's toolbar, one for one, with two links it no longer has.
 *
 * `Platform` and `API` were the sandbox's doors back to the site and to the REST and MCP
 * reference; the workbench is inside the site now and there is no HTTP API to document,
 * so both went. `Clear data` became `Clear board` because it clears this screen only —
 * the platform keeps every survey the workspace has run.
 */
export function WorkbenchBar({
  onRun,
  running,
  onResetView,
  onReload,
  onClear,
  onExportView,
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
  pill,
}: WorkbenchBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="sw-toolbar" role="toolbar" aria-label="Workspace actions">
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1.5 text-[11.5px] shrink-0"
          disabled={running}
          onClick={onRun}
        >
          <Play className="size-3.5 shrink-0" aria-hidden="true" />
          <span>Run survey</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-[11.5px] shrink-0"
          onClick={onResetView}
          title="Frame the study area again"
        >
          <RotateCcw className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Reset view</span>
          <span className="sm:hidden">Reset</span>
        </Button>
        {onExportView ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-[11.5px] shrink-0"
            onClick={onExportView}
            title="Export current framed view as high-res PNG or PDF"
          >
            <Camera className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Export view</span>
            <span className="sm:hidden">Export</span>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-[11.5px] shrink-0"
          onClick={onReload}
          title="Ask the platform for the queue again"
        >
          <RefreshCw className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Reload results</span>
          <span className="sm:hidden">Reload</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-[11.5px] shrink-0"
          onClick={onClear}
          title="Take this survey off the workbench. Nothing is deleted."
        >
          <Eraser className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Clear board</span>
          <span className="sm:hidden">Clear</span>
        </Button>

        <div className="hidden min-[981px]:flex items-center gap-1.5">
          <span className="sw-toolbar__divider" aria-hidden="true" />

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

      <span className="sw-pill" data-state={pill.state}>
        <i aria-hidden="true" />
        {pill.text}
      </span>
    </div>
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
 * Every field is measured rather than asserted: the coordinate and zoom come from the
 * map itself, the CRS from the survey result, and the job text from the run row.
 */
export function StatusStrip({ view, crs, job, basis }: StatusStripProps) {
  return (
    <footer className="sw-status mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border pt-2">
      <span>{view?.coords ?? "—"}</span>
      <Sep />
      <span>{crs}</span>
      <Sep />
      <span>{view ? `Zoom ${view.zoom} · ${view.scale}` : "Zoom —"}</span>
      <Sep />
      <span role="status" aria-live="polite">
        {job}
      </span>
      <span className="ml-auto text-[11px] text-muted-foreground">{basis}</span>
    </footer>
  );
}

function Sep() {
  return (
    <span className="size-1 rounded-full bg-border" aria-hidden="true" />
  );
}
