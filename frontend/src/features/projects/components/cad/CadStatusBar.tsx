import { useEffect, useRef, useState } from "react";
import { fmtCoord } from "./survey/format.ts";
import { MODEL_TAB, type ActiveTab, type CadLayout } from "./cadLayouts.ts";
import { axisBadgeLabels, type AxisConvention } from "./cadSettings.ts";
import { Plus } from "lucide-react";

interface CadStatusBarProps {
  cursor: { n: number; e: number } | null;
  snap: boolean;
  ortho: boolean;
  showGrid: boolean;
  osnap: boolean;
  onToggle: (key: "snap" | "ortho" | "grid" | "osnap") => void;
  scaleLabel: string;
  datum: string;
  /** Decimal places for the cursor coordinate readout (from CAD settings). */
  coordDecimals?: number;
  /** Axis-label convention for the coordinate readout. */
  axisConvention?: AxisConvention;
  /** Plot scale denominator (e.g. 500 → 1:500), shown alongside the scale bar. */
  scaleDenominator?: number;

  // ── AutoCAD-style Model / Layout tabs ──────────────────────────────────────
  /** Layouts (paper-space sheets) shown as tabs after "Model". */
  layouts: CadLayout[];
  /** Active tab: MODEL_TAB or a layout id. */
  activeTab: ActiveTab;
  /** Switch the active Model/Layout tab. */
  onSelectTab: (tab: ActiveTab) => void;
  /** Create a new layout (the "+" tab). */
  onAddLayout: () => void;
  /** Rename a layout. */
  onRenameLayout: (id: string, name: string) => void;
  /** Duplicate a layout. */
  onDuplicateLayout: (id: string) => void;
  /** Delete a layout. */
  onDeleteLayout: (id: string) => void;
}

interface TabMenu {
  id: string;
  x: number;
  y: number;
}

export function CadStatusBar({
  cursor,
  snap,
  ortho,
  showGrid,
  osnap,
  onToggle,
  scaleLabel,
  datum,
  coordDecimals = 3,
  axisConvention = "yx",
  scaleDenominator,
  layouts,
  activeTab,
  onSelectTab,
  onAddLayout,
  onRenameLayout,
  onDuplicateLayout,
  onDeleteLayout,
}: CadStatusBarProps) {
  /** id of the layout currently being renamed inline, or null. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<TabMenu | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  // Dismiss the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  const commitRename = (id: string, value: string) => {
    const name = value.trim();
    if (name) onRenameLayout(id, name);
    setRenaming(null);
  };

  return (
    <div className="cad-status-bar">
      <div className="cad-status-coords" title="Cursor coordinates">
        <span className="cad-coord-badge">
          <label>{axisBadgeLabels(axisConvention).easting}</label>
          <strong>{cursor ? fmtCoord(cursor.e, coordDecimals) : "—"}</strong>
        </span>
        <span className="cad-coord-badge">
          <label>{axisBadgeLabels(axisConvention).northing}</label>
          <strong>{cursor ? fmtCoord(cursor.n, coordDecimals) : "—"}</strong>
        </span>
      </div>

      <div className="cad-status-toggles">
        <button type="button" className={`cad-status-toggle ${snap ? "on" : ""}`} onClick={() => onToggle("snap")}
          title="Snap to grid (F9)">SNAP</button>
        <button type="button" className={`cad-status-toggle ${osnap ? "on" : ""}`} onClick={() => onToggle("osnap")}
          title="Object snap (F3)">OSNAP</button>
        <button type="button" className={`cad-status-toggle ${ortho ? "on" : ""}`} onClick={() => onToggle("ortho")}
          title="Ortho mode (F8)">ORTHO</button>
        <button type="button" className={`cad-status-toggle ${showGrid ? "on" : ""}`} onClick={() => onToggle("grid")}
          title="Show grid (F7)">GRID</button>
      </div>

      <div className="cad-status-meta">
        {scaleDenominator ? (
          <span title="Plot scale">1:{scaleDenominator}</span>
        ) : null}
        <span title="Current scale">{scaleLabel}</span>
        <span className="hide-on-mobile" title="Project datum / CRS">{datum || "n/a"}</span>
      </div>

      <div className="cad-layout-tabs" role="tablist" aria-label="Model and layouts">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === MODEL_TAB}
          className={`cad-layout-tab ${activeTab === MODEL_TAB ? "active" : ""}`}
          onClick={() => onSelectTab(MODEL_TAB)}
          title="Model space — the drawing at full size"
        >
          Model
        </button>

        {layouts.map((layout) => {
          const active = activeTab === layout.id;
          if (renaming === layout.id) {
            return (
              <input
                key={layout.id}
                ref={renameRef}
                className="cad-layout-tab-rename"
                defaultValue={layout.name}
                onBlur={(e) => commitRename(layout.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(layout.id, (e.target as HTMLInputElement).value);
                  else if (e.key === "Escape") setRenaming(null);
                  e.stopPropagation();
                }}
              />
            );
          }
          return (
            <button
              key={layout.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`cad-layout-tab ${active ? "active" : ""}`}
              onClick={() => onSelectTab(layout.id)}
              onDoubleClick={() => setRenaming(layout.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelectTab(layout.id);
                setMenu({ id: layout.id, x: e.clientX, y: e.clientY });
              }}
              title={`${layout.name} — paper space (${layout.options.paper} ${layout.options.orientation})`}
            >
              {layout.name}
            </button>
          );
        })}

        <button
          type="button"
          className="cad-layout-tab cad-layout-tab-add"
          onClick={onAddLayout}
          title="New layout"
          aria-label="New layout"
        >
          <Plus size={11} />
        </button>
      </div>

      {menu && (
        <div
          className="cad-layout-menu"
          style={{ left: menu.x, bottom: window.innerHeight - menu.y + 6 }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => { setRenaming(menu.id); setMenu(null); }}>
            Rename
          </button>
          <button type="button" role="menuitem" onClick={() => { onDuplicateLayout(menu.id); setMenu(null); }}>
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            className="cad-layout-menu-danger"
            disabled={layouts.length <= 1}
            onClick={() => { onDeleteLayout(menu.id); setMenu(null); }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
