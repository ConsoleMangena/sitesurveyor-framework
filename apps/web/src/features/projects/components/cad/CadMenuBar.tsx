import { useCallback, useEffect, useRef, useState } from "react";

export type CadMenuAction =
  | "file:project-points"
  | "file:import-dxf"
  | "file:import-geojson"
  | "file:export-dxf"
  | "file:export-csv"
  | "file:export-geojson"
  | "edit:undo"
  | "edit:redo"
  | "edit:delete"
  | "view:zoom-extents"
  | "view:grid"
  | "view:snap"
  | "view:osnap"
  | "view:ortho"
  | "view:3d"
  | "plot:layout";

interface CadMenuBarProps {
  onAction: (action: CadMenuAction) => void;
}

type MenuId = "file" | "edit" | "view" | "insert" | "format" | "tools" | "help";

interface MenuItem {
  label: string;
  action?: CadMenuAction;
  shortcut?: string;
  divider?: boolean;
}

interface MenuDef {
  id: MenuId;
  label: string;
  items: MenuItem[];
}

const MENUS: MenuDef[] = [
  {
    id: "file",
    label: "File",
    items: [
      { label: "Project Coordinates", action: "file:project-points" },
      { label: "Import DXF from Files", action: "file:import-dxf" },
      { label: "Import GeoJSON…", action: "file:import-geojson" },
      { divider: true, label: "" },
      { label: "Export DXF", action: "file:export-dxf" },
      { label: "Export CSV", action: "file:export-csv" },
      { label: "Export GeoJSON", action: "file:export-geojson" },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    items: [
      { label: "Undo", action: "edit:undo", shortcut: "Ctrl+Z" },
      { label: "Redo", action: "edit:redo", shortcut: "Ctrl+Y" },
      { divider: true, label: "" },
      { label: "Delete", action: "edit:delete", shortcut: "Del" },
    ],
  },
  {
    id: "view",
    label: "View",
    items: [
      { label: "Zoom Extents", action: "view:zoom-extents" },
      { divider: true, label: "" },
      { label: "Grid", action: "view:grid", shortcut: "F7" },
      { label: "Snap", action: "view:snap", shortcut: "F9" },
      { label: "Object Snap", action: "view:osnap", shortcut: "F3" },
      { label: "Ortho", action: "view:ortho", shortcut: "F8" },
      { label: "3D View", action: "view:3d" },
    ],
  },
  {
    id: "format",
    label: "Format",
    items: [{ label: "Plot / Layout", action: "plot:layout" }],
  },
  {
    id: "help",
    label: "Help",
    items: [
      { label: "Command Help", action: undefined },
      { label: "About Engineering Surveyor CAD", action: undefined },
    ],
  },
];

export function CadMenuBar({ onAction }: CadMenuBarProps) {
  const [open, setOpen] = useState<MenuId | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      setOpen(null);
    };
    const closeOnClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    };
    window.addEventListener("keydown", close);
    window.addEventListener("mousedown", closeOnClickOutside);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("mousedown", closeOnClickOutside);
    };
  }, [open]);

  const run = useCallback((action?: CadMenuAction) => {
    if (action) onAction(action);
    setOpen(null);
  }, [onAction]);

  return (
    <div className="cad-menu-bar" ref={barRef}>
      <button
        type="button"
        className="cad-app-button"
        title="Application menu"
        onClick={() => setOpen((v) => (v ? null : "file"))}
      >
        A
      </button>
      {MENUS.map((menu) => (
        <div key={menu.id} style={{ position: "relative" }}>
          <button
            type="button"
            className={`cad-menu-item ${open === menu.id ? "active" : ""}`}
            onClick={() => setOpen((v) => (v === menu.id ? null : menu.id))}
            onMouseEnter={() => open && setOpen(menu.id)}
          >
            {menu.label}
          </button>
          {open === menu.id && (
            <div className="cad-menu-dropdown" role="menu">
              {menu.items.map((item, idx) =>
                item.divider ? (
                  <div key={`div-${idx}`} className="cad-menu-divider-h" />
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    className={`cad-menu-dropdown-item ${item.action ? "" : "cad-menu-dropdown-item-disabled"}`}
                    role="menuitem"
                    onClick={() => run(item.action)}
                    disabled={!item.action}
                    aria-disabled={!item.action}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="cad-menu-shortcut">{item.shortcut}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
