import { useState } from "react";
import { PolarForwardTool, JoinInverseTool } from "./FormTools.tsx";

type Mode = "forward" | "inverse";

interface PolarJoinToolProps {
  projectId?: string;
}

/** Combined polar computation workspace.
 *
 * Merges the forward (known point + bearing/distance → new point) and inverse
 * (two known points → bearing/distance) polar workflows into one tool with a
 * single mode switch, cutting down the long COGO list without losing any math.
 */
export function PolarJoinTool({ projectId }: PolarJoinToolProps) {
  const [mode, setMode] = useState<Mode>("forward");

  return (
    <div className="svt-combined">
      <div className="svt-mode-bar" role="tablist" aria-label="Polar computation mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "forward"}
          className={`svt-mode-btn ${mode === "forward" ? "active" : ""}`}
          onClick={() => setMode("forward")}
        >
          Polar / Forward
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "inverse"}
          className={`svt-mode-btn ${mode === "inverse" ? "active" : ""}`}
          onClick={() => setMode("inverse")}
        >
          Join / Inverse
        </button>
      </div>

      {mode === "forward" && <PolarForwardTool projectId={projectId} />}
      {mode === "inverse" && <JoinInverseTool projectId={projectId} />}
    </div>
  );
}
