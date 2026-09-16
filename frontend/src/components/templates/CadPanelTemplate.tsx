import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CadPanelTemplateProps {
  /** Whether the panel is currently expanded. */
  open: boolean;
  /** Called when the panel should expand or collapse. */
  onOpenChange?: (open: boolean) => void;
  /** Eyebrow text shown above the title. */
  eyebrow?: React.ReactNode;
  /** Primary title shown in the panel header. */
  title?: React.ReactNode;
  /** Extra node rendered in the header next to the collapse button. */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  /** Position of the panel (affects collapse arrow orientation). */
  side?: "left" | "right";
  /** Additional classes for the expanded panel container. */
  className?: string;
  /** Additional classes for the collapsed strip. */
  collapsedClassName?: string;
  /** Accessible label for the expand/collapse button. */
  toggleLabel?: string;
}

export function CadPanelTemplate({
  open,
  onOpenChange,
  eyebrow,
  title,
  headerExtra,
  children,
  side = "right",
  className,
  collapsedClassName,
  toggleLabel,
}: CadPanelTemplateProps) {
  const expandLabel = toggleLabel ?? "Expand panel";
  const collapseLabel = toggleLabel ?? "Collapse panel";

  if (!open) {
    return (
      <div
        className={cn(
          side === "right" ? "cad-right-panel" : "cad-left-rail",
          "collapsed",
          collapsedClassName
        )}
      >
        <button
          type="button"
          className="cad-panel-collapse"
          onClick={() => onOpenChange?.(!open)}
          title={expandLabel}
          aria-label={expandLabel}
          style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
        >
          <ChevronRight
            size={12}
            style={side === "left" ? { transform: "rotate(180deg)" } : undefined}
          />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        side === "right" ? "cad-right-panel" : "cad-left-rail",
        className
      )}
    >
      <div className={cn("cad-panel-header", side === "right" && "cad-right-panel-header")}>
        <div>
          {eyebrow && <div className="cad-panel-eyebrow">{eyebrow}</div>}
          {title && <div className="cad-panel-title">{title}</div>}
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          <button
            type="button"
            className="cad-panel-collapse"
            onClick={() => onOpenChange?.(!open)}
            title={collapseLabel}
            aria-label={collapseLabel}
          >
            <ChevronRight
              size={14}
              style={{ transform: side === "right" ? "rotate(180deg)" : undefined }}
            />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

export default CadPanelTemplate;
