import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import type { CadToolId } from "./cadModel.ts";
import {
  MousePointer2, Hand, MapPin, Crosshair, PenLine, Pentagon, Type, Ruler,
  ChevronDown,
} from "lucide-react";

interface CadToolDropdownProps {
  tool: CadToolId;
  onToolChange: (tool: CadToolId) => void;
}

interface ToolDef {
  id: CadToolId;
  label: string;
  icon: ComponentType<{ size?: number | string }>;
  shortcut?: string;
}

interface ToolGroup {
  label: string;
  tools: ToolDef[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: "Navigate",
    tools: [
      { id: "select", label: "Select", icon: MousePointer2, shortcut: "S" },
      { id: "pan", label: "Pan", icon: Hand, shortcut: "P" },
    ],
  },
  {
    label: "Draw",
    tools: [
      { id: "point", label: "Point", icon: MapPin, shortcut: "O" },
      { id: "control-point", label: "Control Point", icon: Crosshair, shortcut: "CP" },
      { id: "line", label: "Line", icon: PenLine, shortcut: "L" },
      { id: "boundary", label: "Boundary", icon: Pentagon, shortcut: "B" },
    ],
  },
  {
    label: "Label",
    tools: [
      { id: "text", label: "Text", icon: Type, shortcut: "T" },
      { id: "measure", label: "Measure", icon: Ruler, shortcut: "M" },
    ],
  },
];

const ICON_SIZE = 14;

const toolLabel: Record<CadToolId, string> = {
  select: "Select",
  pan: "Pan",
  point: "Point",
  "control-point": "Control Point",
  line: "Line",
  boundary: "Boundary",
  text: "Text",
  "spot-height": "Spot Height",
  measure: "Measure",
  move: "Move",
  copy: "Copy",
  rotate: "Rotate",
  scale: "Scale",
  mirror: "Mirror",
  offset: "Offset",
  "dim-linear": "Dimension",
  circle: "Circle",
  arc: "Arc",
  "zoom-window": "Zoom Window",
};

export function CadToolDropdown({ tool, onToolChange }: CadToolDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const select = useCallback((id: CadToolId) => {
    onToolChange(id);
    setOpen(false);
  }, [onToolChange]);

  const CurrentIcon = TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.id === tool)?.icon;

  return (
    <div className="cad-tool-dropdown-wrap" ref={wrapRef}>
      <button
        className="cad-tool-trigger"
        onClick={() => setOpen((v) => !v)}
        type="button"
        title="Switch active tool"
      >
        {CurrentIcon && <CurrentIcon size={ICON_SIZE} />}
        <span className="cad-tool-trigger-label">{toolLabel[tool]}</span>
        <ChevronDown size={10} className={`cad-tool-trigger-chevron ${open ? "open" : ""}`} />
      </button>

      {open && (
        <div className="cad-tool-dropdown">
          {TOOL_GROUPS.map((group) => (
            <div className="cad-tool-dropdown-group" key={group.label}>
              <span className="cad-tool-dropdown-group-label">{group.label}</span>
              {group.tools.map((t) => {
                const Icon = t.icon;
                const active = tool === t.id;
                return (
                  <button
                    key={t.id}
                    className={`cad-tool-dropdown-btn ${active ? "active" : ""}`}
                    onClick={() => select(t.id)}
                    type="button"
                  >
                    <Icon size={ICON_SIZE} />
                    <span className="cad-tool-dropdown-btn-label">{t.label}</span>
                    <span className="cad-tool-dropdown-btn-key">{t.shortcut}</span>
                    {active && <span className="cad-tool-dropdown-check" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
