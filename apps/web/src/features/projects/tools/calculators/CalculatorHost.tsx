import "../../../../styles/survey-tools.css";
import { ArrowLeft, X, Info } from "lucide-react";
import type { CalcToolId } from "../toolRegistry.ts";
import { CALC_TOOLS_BY_ID, NON_CAD_TOOLS } from "../toolRegistry.ts";
import type { HubProject } from "../../../../pages/shared/ProjectHubPage.tsx";
import type { AxisConvention } from "../../components/cad/cadSettings.ts";
import { LevellingTool } from "./LevellingTool.tsx";
import { TraverseTool } from "./TraverseTool.tsx";
import { AreaTool } from "./AreaTool.tsx";
import { AngleConverterTool } from "./FormTools.tsx";
import { PolarJoinTool } from "./PolarJoinTool.tsx";
import { AxisConventionProvider } from "./AxisConventionContext.tsx";
import { useState } from "react";

interface CalculatorHostProps {
  calc: CalcToolId;
  activeProject?: HubProject | null;
  onClose: () => void;
}

function projectIdFrom(activeProject?: HubProject | null): string | undefined {
  // Project points/outputs are stored under the stable DB id (the Coordinates
  // page keys them the same way) — the short display id is NOT unique.
  return activeProject?.dbId;
}

function toAxisConvention(value: string | undefined): AxisConvention {
  return value === "xy" ? "xy" : "yx";
}

function crsBadge(project: HubProject): string {
  if (project.crsType === 'projected') return project.crsEpsg ? `EPSG:${project.crsEpsg}` : 'Projected CRS';
  if (project.crsType === 'local') return 'Local grid';
  return 'CRS: other';
}

function crsTooltip(project: HubProject): string {
  if (project.crsType === 'local') {
    return `Local site grid. Origin offset: E ${project.localOriginE}, N ${project.localOriginN}`;
  }
  if (project.crsType === 'projected') {
    return `Projected CRS${project.crsEpsg ? ` — EPSG:${project.crsEpsg}` : ''}`;
  }
  return 'Coordinate system: other / unspecified';
}

/** Full-screen, sidebar-free survey computation workspace.
 *
 * Rendered with fixed positioning so it covers both the workspace shell and
 * the project hub sidebars, giving the user the full viewport for calculating
 * in the field or office. On mobile it becomes an edge-to-edge sheet with
 * large touch targets and bottom safe-area padding.
 */
export function CalculatorHost({ calc, activeProject, onClose }: CalculatorHostProps) {
  const [showAbout, setShowAbout] = useState(false);
  const tool = CALC_TOOLS_BY_ID[calc];
  const category = tool?.category ?? "COGO & Computation";
  const toolBlurb = tool?.description ?? "";

  // Derive the 1-based number that matches the hub list ordering.
  const cogoTools = NON_CAD_TOOLS.filter(
    (t) => t.category === "COGO & Computation" && t.behavior.kind !== "soon",
  );
  const toolNumber = tool ? cogoTools.findIndex((t) => t.id === tool.id) + 1 : 0;
  const toolLabel = toolNumber > 0
    ? `${toolNumber}. ${tool?.label ?? calc}`
    : (tool?.label ?? calc);

  return (
    <div className="svt-workspace" role="dialog" aria-modal="true" aria-label={toolLabel}>
      <header className="svt-workspace-topbar">
        <div className="svt-topbar-left">
          <button
            type="button"
            className="svt-topbar-back"
            onClick={onClose}
            title="Back to project hub"
            aria-label="Back to project hub"
          >
            <ArrowLeft size={18} strokeWidth={2.5} />
          </button>
          <div className="svt-topbar-title">
            <span className="svt-topbar-category">{category}</span>
            <h1 className="svt-topbar-label">{toolLabel}</h1>
          </div>
        </div>

        <div className="svt-topbar-right">
          {activeProject && (
            <>
              <span className="svt-topbar-crs" title={crsTooltip(activeProject)}>
                {crsBadge(activeProject)}
              </span>
              <span className="svt-topbar-project" title={activeProject.name}>
                {activeProject.id} · {activeProject.name}
              </span>
            </>
          )}
          <button
            type="button"
            className={`svt-topbar-icon ${showAbout ? "active" : ""}`}
            onClick={() => setShowAbout(v => !v)}
            title="About this tool"
            aria-label="About this tool"
          >
            <Info size={18} />
          </button>
          <button
            type="button"
            className="svt-topbar-icon"
            onClick={onClose}
            title="Close tool"
            aria-label="Close tool"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {showAbout && toolBlurb && (
        <div className="svt-about-bar">
          <p>{toolBlurb}</p>
        </div>
      )}

      <AxisConventionProvider convention={toAxisConvention(activeProject?.axisConvention)}>
        <div className="svt-workspace-body">
          {calc === "levelling" && <LevellingTool projectId={projectIdFrom(activeProject)} />}
          {calc === "traverse-adjustment" && <TraverseTool projectId={projectIdFrom(activeProject)} />}
          {calc === "area-volume" && <AreaTool projectId={projectIdFrom(activeProject)} />}
          {calc === "angle-converter" && <AngleConverterTool />}
          {calc === "polar-join" && <PolarJoinTool projectId={projectIdFrom(activeProject)} />}
        </div>
      </AxisConventionProvider>
    </div>
  );
}
