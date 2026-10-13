import { useState } from "react";
import { IntersectionTool, ResectionTool } from "./FormTools.tsx";

type Mode = "intersection" | "resection";

interface PointFixingToolProps {
  projectId?: string;
}

/** Combined point-fixing workspace.
 *
 * Intersection fixes a new point from two known stations; resection fixes the
 * observer from three known stations. Both are control-dependent point-fixing
 * methods, so grouping them keeps the COGO list short and the workflow discoverable.
 */
export function PointFixingTool({ projectId }: PointFixingToolProps) {
  const [mode, setMode] = useState<Mode>("intersection");

  return (
    <div className="svt-combined">
      <div className="svt-mode-bar" role="tablist" aria-label="Point fixing mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "intersection"}
          className={`svt-mode-btn ${mode === "intersection" ? "active" : ""}`}
          onClick={() => setMode("intersection")}
        >
          Intersection
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "resection"}
          className={`svt-mode-btn ${mode === "resection" ? "active" : ""}`}
          onClick={() => setMode("resection")}
        >
          Resection
        </button>
      </div>

      {mode === "intersection" && <IntersectionTool projectId={projectId} />}
      {mode === "resection" && <ResectionTool projectId={projectId} />}
    </div>
  );
}
