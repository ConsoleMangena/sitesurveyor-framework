import { useState } from "react";
import { HorizontalCurveTool, VerticalCurveTool } from "./AlignmentTools.tsx";

type Mode = "horizontal" | "vertical";

interface CurveDesignToolProps {
  projectId?: string;
}

/** Combined curve design workspace.
 *
 * Road and rail set-out almost always involves both horizontal circular curves
 * and vertical parabolic curves. Grouping them mirrors the design workflow and
 * removes two separate tiles from the COGO grid.
 */
export function CurveDesignTool({ projectId }: CurveDesignToolProps) {
  const [mode, setMode] = useState<Mode>("horizontal");

  return (
    <div className="svt-combined">
      <div className="svt-mode-bar" role="tablist" aria-label="Curve design mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "horizontal"}
          className={`svt-mode-btn ${mode === "horizontal" ? "active" : ""}`}
          onClick={() => setMode("horizontal")}
        >
          Horizontal Curve
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "vertical"}
          className={`svt-mode-btn ${mode === "vertical" ? "active" : ""}`}
          onClick={() => setMode("vertical")}
        >
          Vertical Curve
        </button>
      </div>

      {mode === "horizontal" && <HorizontalCurveTool projectId={projectId} />}
      {mode === "vertical" && <VerticalCurveTool projectId={projectId} />}
    </div>
  );
}
