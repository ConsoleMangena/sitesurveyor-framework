import type { ComponentType } from "react";
import type { CadToolId } from "./cadModel.ts";
import {
  MousePointer2, Move, Hand, Maximize2, ZoomIn, Trash2, MapPin,
  PenLine, Pentagon,
  Type, Ruler, FileDown, FileText, ClipboardList, FileInput,
  Waves, Undo2, Redo2, Copy,
  Hexagon, Spline, Globe, Scissors,
  Mountain, Layers2, Diff, Printer,
  Compass, Tag, SquareStack, Workflow, Crosshair,
  MountainSnow, Map,
  RotateCcw, Expand, FlipHorizontal, ArrowLeftRight,
  Circle,
  PaintBucket,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface RibbonAction {
  id: string;
  label: string;
  hint?: string;
}

interface RibbonPanel {
  label: string;
  actions: RibbonAction[];
}

interface CadRibbonProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onAction: (actionId: string) => void;
  datum: string;
  tool: CadToolId;
  /** Whether undo / redo are currently possible (greys out the buttons). */
  canUndo?: boolean;
  canRedo?: boolean;
}

const PANELS: Record<string, RibbonPanel[]> = {
  Home: [
    {
      label: "Navigate",
      actions: [
        { id: "tool:select", label: "Select", hint: "Select entities (S)" },
        { id: "tool:pan", label: "Pan", hint: "Pan viewport (P)" },
        { id: "tool:zoom-window", label: "Zoom Window", hint: "Drag a rectangle to zoom in" },
        { id: "zoom:extents", label: "Extents", hint: "Zoom to extents" },
      ],
    },
    {
      label: "Edit",
      actions: [
        { id: "edit:undo", label: "Undo", hint: "Undo last change (Ctrl+Z)" },
        { id: "edit:redo", label: "Redo", hint: "Redo (Ctrl+Y)" },
        { id: "edit:delete", label: "Delete", hint: "Delete selected entity (Del)" },
        { id: "edit:explode", label: "Explode", hint: "Break selected polylines/boundaries into single line segments" },
      ],
    },
    {
      label: "Modify",
      actions: [
        { id: "tool:move", label: "Move", hint: "Move selected objects: pick base then destination (M)" },
        { id: "tool:copy", label: "Copy", hint: "Copy selected objects: pick base then destination" },
        { id: "tool:rotate", label: "Rotate", hint: "Rotate selected objects: pick base point, then angle" },
        { id: "tool:scale", label: "Scale", hint: "Scale selected objects: pick base point, then scale factor" },
        { id: "tool:mirror", label: "Mirror", hint: "Mirror selected objects: pick two points for the mirror line" },
        { id: "tool:offset", label: "Offset", hint: "Offset the selected polyline/boundary by a distance" },
      ],
    },
  ],
  Survey: [
    {
      label: "Draw",
      actions: [
        { id: "tool:point", label: "Point", hint: "Place a survey point (O)" },
        { id: "tool:control-point", label: "Control Point", hint: "Place a control point (CP) on the CONTROL layer" },
        { id: "tool:line", label: "Line", hint: "Draw line / polyline segments (L). After the first point you can type distance<bearing." },
        { id: "tool:boundary", label: "Boundary", hint: "Draw closed boundary (B)" },
        { id: "tool:circle", label: "Circle", hint: "Pick centre, then a point on the circumference" },
        { id: "tool:arc", label: "Arc", hint: "Pick start, second, and end points along the arc" },
        { id: "cmd:hatch", label: "Hatch", hint: "Convert the selected closed boundary into a filled hatch" },
      ],
    },
    {
      label: "Data",
      actions: [
        { id: "project:points", label: "Project Coordinates", hint: "Select coordinates from the project workspace" },
        { id: "import:dxf", label: "Import DXF", hint: "Import a DXF file from the workspace files" },
      ],
    },
    {
      label: "Field to Finish",
      actions: [
        { id: "f2f:linework", label: "Process Linework", hint: "Join coded points into linework strings (kerbs, fences, buildings) using the feature-code table" },
      ],
    },
    {
      label: "Geometry",
      actions: [
        { id: "geom:hull", label: "Convex Hull", hint: "Convex hull of all points (GeoRust geo)" },
        { id: "geom:simplify", label: "Simplify", hint: "Simplify the selected polyline (Douglas–Peucker)" },
        { id: "geom:reproject", label: "Reproject", hint: "Reproject all points between CRS (PROJ on desktop)" },
      ],
    },
  ],
  Surface: [
    {
      label: "Terrain",
      actions: [
        { id: "surface:tin", label: "Build TIN", hint: "Triangulate survey points into a surface (DTM)" },
        { id: "surface:tin-breaklines", label: "Build TIN + Breaklines", hint: "Triangulate honouring coded breaklines and clipping to the selected boundary (survey-grade DTM)" },
        { id: "surface:boundary", label: "Boundary Surface", hint: "TIN survey points clipped to the selected closed boundary" },
        { id: "surface:contours", label: "Contours", hint: "Generate contours from the surface (index + intermediate, labelled)" },
      ],
    },
    {
      label: "Volumes",
      actions: [
        { id: "surface:volume-elevation", label: "Vol → RL", hint: "Cut/fill between surface and a level" },
        { id: "surface:volume-between", label: "Vol Δ", hint: "Cut/fill between two surfaces" },
        { id: "surface:cutfill-report", label: "Cut/Fill Report", hint: "Generate a printable cut/fill volume report" },
      ],
    },
    {
      label: "Analysis",
      actions: [
        { id: "surface:terrain", label: "Slope / Aspect", hint: "Shade the TIN by slope and report terrain statistics (mean/min/max slope, 3D area)" },
        { id: "surface:profile", label: "Long Section", hint: "Sample a chainage/level profile along the selected polyline or boundary — chart + CSV" },
      ],
    },
    {
      label: "Manage",
      actions: [
        { id: "surface:clear-contours", label: "Clear Contours", hint: "Remove all generated contour lines" },
        { id: "surface:clear-surfaces", label: "Clear Surfaces", hint: "Remove all TIN surfaces and cut/fill models" },
      ],
    },
  ],
  Annotate: [
    {
      label: "Annotation",
      actions: [
        { id: "tool:text", label: "Text", hint: "Place annotation text (T)" },
        { id: "tool:spot-height", label: "Spot Height", hint: "Click on the surface or points to drop elevation labels" },
        { id: "tool:dim-linear", label: "Dimension", hint: "Place a linear dimension between two points" },
        { id: "annotate:label-coord", label: "Coord Label", hint: "Place Y,X coordinate labels next to the selected points" },
        { id: "annotate:label-boundary", label: "Label Boundary", hint: "Annotate the selected boundary/polyline with bearing & distance on each segment" },
        { id: "annotate:label-area", label: "Label Area", hint: "Place an area/perimeter label at the centroid of the selected closed boundary" },
      ],
    },
    {
      label: "Inquiry",
      actions: [
        { id: "tool:measure", label: "Measure", hint: "Measure distance and bearing (M)" },
      ],
    },
  ],
  Output: [
    {
      label: "Plot",
      actions: [
        { id: "plot:layout", label: "Plot / Layout", hint: "Configure a printed sheet (title block, north arrow, scale bar, legend) and print to PDF" },
      ],
    },
    {
      label: "Export",
      actions: [
        { id: "export:dxf", label: "DXF", hint: "Export drawing to DXF" },
        { id: "export:csv", label: "CSV", hint: "Export points to CSV" },
        { id: "export:geojson", label: "GeoJSON", hint: "Export points & linework to GeoJSON" },
        { id: "export:report", label: "Report", hint: "Generate survey report" },
      ],
    },
  ],
};

const ICON_MAP: Record<string, ComponentType<{ size?: number | string; className?: string }>> = {
  "tool:select": MousePointer2,
  "tool:pan": Hand,
  "tool:zoom-window": ZoomIn,
  "zoom:extents": Maximize2,
  "edit:undo": Undo2,
  "edit:redo": Redo2,
  "edit:delete": Trash2,
  "edit:explode": Scissors,
  "tool:move": Move,
  "tool:copy": Copy,
  "tool:rotate": RotateCcw,
  "tool:scale": Expand,
  "tool:mirror": FlipHorizontal,
  "tool:offset": ArrowLeftRight,
  "tool:dim-linear": Ruler,
  "tool:point": MapPin,
  "tool:control-point": Crosshair,
  "project:points": MapPin,
  "import:dxf": FileInput,
  "geom:hull": Hexagon,
  "geom:simplify": Spline,
  "geom:reproject": Map,
  "tool:line": PenLine,
  "tool:boundary": Pentagon,
  "tool:text": Type,
  "tool:spot-height": Crosshair,
  "tool:measure": Ruler,
  "tool:circle": Circle,
  "tool:arc": Spline,
  "cmd:hatch": PaintBucket,
  "f2f:linework": Workflow,
  "surface:tin": Mountain,
  "surface:tin-breaklines": MountainSnow,
  "surface:boundary": Pentagon,
  "surface:contours": Waves,
  "surface:volume-elevation": Layers2,
  "surface:volume-between": Diff,
  "surface:cutfill-report": ClipboardList,
  "surface:terrain": Compass,
  "surface:profile": TrendingUp,
  "surface:clear-contours": Trash2,
  "surface:clear-surfaces": Trash2,
  "annotate:label-boundary": Tag,
  "annotate:label-area": SquareStack,
  "annotate:label-coord": MapPin,
  "plot:layout": Printer,
  "export:dxf": FileDown,
  "export:csv": FileDown,
  "export:geojson": Globe,
  "export:report": FileText,
};

const TABS = ["Home", "Survey", "Surface", "Annotate", "Output"] as const;

export function CadRibbon({ activeTab, onTabChange, onAction, datum, tool, canUndo = true, canRedo = true }: CadRibbonProps) {
  const panels = PANELS[activeTab] ?? [];

  const isDisabled = (actionId: string): boolean => {
    if (actionId === "edit:undo") return !canUndo;
    if (actionId === "edit:redo") return !canRedo;
    return false;
  };

  return (
    <div className="border-b bg-[var(--cad-bg)] shadow-sm">
      <div className="flex items-center gap-1 px-2 pt-2" role="tablist">
        {TABS.map((t) => {
          const isActive = activeTab === t;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(t)}
              type="button"
              className={cn(
                "relative inline-flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cad-accent)]",
                isActive
                  ? "bg-[var(--cad-bg-2)] text-[var(--cad-text-hi)] shadow-[0_-1px_0_0_var(--cad-border)_inset,0_2px_0_0_var(--cad-accent)_inset]"
                  : "text-[var(--cad-text-dim)] hover:bg-[var(--cad-panel)] hover:text-[var(--cad-text-hi)]",
              )}
            >
              {t}
            </button>
          );
        })}
        <span
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--cad-border)] bg-[var(--cad-panel)] px-2.5 py-0.5 pr-3 text-[11px] font-medium text-[var(--cad-text-dim)]"
          title="Project datum / CRS"
        >
          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
          {datum || "No datum set"}
        </span>
      </div>

      <div className="flex gap-0 overflow-x-auto bg-[var(--cad-bg-2)] px-2 py-2.5">
        {panels.map((panel) => (
          <div
            key={panel.label}
            className="flex min-w-0 flex-col gap-1.5 border-r border-[var(--cad-border)] px-3 first:pl-1 last:border-r-0"
          >
            <div className="flex flex-wrap items-stretch gap-1.5">
              {panel.actions.map((a) => {
                const isToolAction = a.id.startsWith("tool:");
                const toolId = a.id.split(":")[1] as CadToolId;
                const active = isToolAction && tool === toolId;
                const disabled = isDisabled(a.id);
                const Icon = ICON_MAP[a.id];
                return (
                  <button
                    key={a.id}
                    onClick={() => { if (!disabled) onAction(a.id); }}
                    title={a.hint ?? a.label}
                    type="button"
                    disabled={disabled}
                    aria-disabled={disabled}
                    className={cn(
"group inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cad-accent)]",
                      "active:scale-[0.98]",
                      active
                        ? "border-[var(--cad-accent)] bg-[var(--cad-accent-bg)] text-[var(--cad-accent)] shadow-sm"
                        : "border-transparent bg-[var(--cad-bg-2)] text-[var(--cad-text)] hover:border-[var(--cad-border)] hover:bg-[var(--cad-panel)] hover:text-[var(--cad-text-hi)] hover:shadow-sm",
                      disabled && "cursor-not-allowed opacity-50 hover:bg-[var(--cad-bg-2)] hover:shadow-none",
                    )}
                  >
                    {Icon && (
                      <Icon
                        size={14}
                        className={cn(
                          "shrink-0 transition-colors",
                          active
                            ? "text-[var(--cad-accent)]"
                            : "text-[var(--cad-text-dim)] group-hover:text-[var(--cad-text-hi)]",
                          disabled && "text-[var(--cad-text-dim)]/60",
                        )}
                      />
                    )}
                    <span className="whitespace-nowrap leading-none">{a.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--cad-text-dim)]">
              {panel.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
