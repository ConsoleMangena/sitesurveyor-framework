import { useEffect, useRef, useState } from "react";
import type { CadSelection, CadModelState } from "./cadModel.ts";
import { CAD_COLORS } from "./cadModel.ts";
import type { UseCadModel } from "./useCadModel.ts";
import {
  fmtArea, fmtBearing, fmtCoord, fmtDistance,
  type BearingFormat,
} from "./survey/format.ts";
import { inverse, polygonArea } from "./survey/cogo.ts";
import { useCadDialog } from "./cadDialogContext.ts";
import { axisBadgeLabels, type AxisConvention } from "./cadSettings.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { CadPanelTemplate } from "@/components/templates/CadPanelTemplate.tsx";
import {
  Lock, LockOpen, Layers, ListTree, MapPinned,
  Plus, Trash2, Check, X, Pencil,
} from "lucide-react";

/** AutoCAD-style preset colours offered when recolouring a layer. */
const LAYER_COLOR_PRESETS = [
  "#ffffff", "#ff0000", "#ff7a00", "#ffff00", "#22c55e",
  "#22d3ee", "#3b82f6", "#a855f7", "#f43f5e", "#94a3b8",
];

type PanelTab = "layers" | "props" | "points";

interface CadRightPanelProps {
  cad: UseCadModel;
  model: CadModelState;
  selection: CadSelection;
  bearingFormat: BearingFormat;
  axisConvention: AxisConvention;
}

const TAB_LABELS: Record<PanelTab, string> = {
  layers: "Layers",
  props: "Properties",
  points: "Points",
};

const TAB_TOOLTIPS: Record<PanelTab, string> = {
  layers: "Manage layers and visibility",
  props: "View and edit entity properties",
  points: "Survey point table",
};

const TAB_ICONS = {
  layers: Layers,
  props: ListTree,
  points: MapPinned,
} satisfies Record<PanelTab, typeof Layers>;

export function CadRightPanel({
  cad,
  model,
  selection,
  bearingFormat,
  axisConvention,
}: CadRightPanelProps) {
  const [tab, setTab] = useState<PanelTab>("layers");
  const [collapsed, setCollapsed] = useState(false);

  return (
    <CadPanelTemplate
      open={!collapsed}
      onOpenChange={(open) => setCollapsed(!open)}
      side="right"
      eyebrow="Inspector"
      title={TAB_LABELS[tab]}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as PanelTab)} className="flex flex-col flex-1 min-h-0">
        <TabsList className="grid w-full grid-cols-3 h-9 bg-transparent p-1">
          {(["layers", "props", "points"] as PanelTab[]).map((t) => {
            const Icon = TAB_ICONS[t];
            return (
              <TabsTrigger
                key={t}
                value={t}
                title={TAB_TOOLTIPS[t]}
                className="flex items-center justify-center gap-1.5 text-[11px] px-1 data-[state=active]:bg-white/10"
              >
                <Icon size={13} />
                <span className="cad-panel-tab-label">{TAB_LABELS[t]}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="layers" className="flex-1 min-h-0 m-0 overflow-hidden flex flex-col data-[state=inactive]:hidden">
          <LayersTab cad={cad} model={model} />
        </TabsContent>
        <TabsContent value="props" className="flex-1 min-h-0 m-0 overflow-hidden flex flex-col data-[state=inactive]:hidden">
          <PropsTab cad={cad} model={model} selection={selection} bearingFormat={bearingFormat} axisConvention={axisConvention} />
        </TabsContent>
        <TabsContent value="points" className="flex-1 min-h-0 m-0 overflow-hidden flex flex-col data-[state=inactive]:hidden">
          <PointsTab cad={cad} model={model} />
        </TabsContent>
      </Tabs>
    </CadPanelTemplate>
  );
}

function setRefMap<T extends HTMLElement>(map: React.MutableRefObject<Record<string, T | null>>, id: string) {
  return (el: T | null) => { map.current[id] = el; };
}

function LayersTab({ cad, model }: { cad: UseCadModel; model: CadModelState }) {
  const dialog = useCadDialog();
  const activeLayer = model.layers.find((l) => l.id === model.activeLayerId);
  const visibleCount = model.layers.filter((l) => l.visible).length;

  // Inline rename: which layer is being edited and its draft name.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  // Which layer's colour palette is open.
  const [colorMenuId, setColorMenuId] = useState<string | null>(null);
  const [colorMenuPos, setColorMenuPos] = useState<{ top: number; left: number } | null>(null);
  const swatchRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!colorMenuId) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setColorMenuId(null);
      }
    };
    const handleClick = (e: MouseEvent) => {
      const wrap = swatchRefs.current[colorMenuId];
      if (wrap && !wrap.contains(e.target as Node)) {
        setColorMenuId(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [colorMenuId]);

  const beginRename = (id: string, current: string) => {
    setEditingId(id);
    setDraftName(current);
    setColorMenuId(null);
  };

  const commitRename = () => {
    if (editingId && draftName.trim()) cad.updateLayer(editingId, { name: draftName.trim() });
    setEditingId(null);
  };

  const handleDelete = async (id: string, name: string) => {
    const count = cad.layerEntityCount(id);
    const msg = count > 0
      ? `Delete layer "${name}"? Its ${count} object${count === 1 ? "" : "s"} will move to another layer.`
      : `Delete layer "${name}"?`;
    if (await dialog.confirm(msg)) {
      if (!cad.deleteLayer(id)) {
        await dialog.alert("Cannot delete the last remaining layer.");
      }
    }
  };

  return (
    <div className="cad-panel-block">
      <div className="cad-panel-summary-grid">
        <div className="cad-summary-card">
          <span>Active</span>
          <strong>{activeLayer?.name ?? "None"}</strong>
        </div>
        <div className="cad-summary-card">
          <span>Visible</span>
          <strong>{visibleCount}/{model.layers.length}</strong>
        </div>
      </div>

      <div className="cad-layer-toolbar">
        <button
          type="button"
          className="cad-chip-btn"
          onClick={() => {
            const layer = cad.addLayer("");
            beginRename(layer.id, layer.name);
          }}
          title="Create a new layer and rename it"
        >
          <Plus size={12} /> New
        </button>
      </div>

      <div className="cad-layer-list">
        {model.layers.map((l) => {
          const isActive = model.activeLayerId === l.id;
          const isEditing = editingId === l.id;
          const count = cad.layerEntityCount(l.id);
          return (
            <div key={l.id} className={`cad-layer-row ${isActive ? "active-layer" : ""}`}>
              <input
                type="checkbox"
                checked={l.visible}
                onChange={() => cad.toggleLayerVisible(l.id)}
                title={l.visible ? "Hide layer" : "Show layer"}
              />

              <div
                className="cad-layer-swatch-wrap"
                ref={setRefMap(swatchRefs, l.id)}
              >
                <button
                  type="button"
                  className="cad-layer-swatch"
                  style={{ background: l.color }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (colorMenuId === l.id) {
                      setColorMenuId(null);
                      return;
                    }
                    const rect = swatchRefs.current[l.id]?.getBoundingClientRect();
                    if (rect) setColorMenuPos({ top: rect.bottom + 4, left: rect.left });
                    setColorMenuId(l.id);
                  }}
                  title="Change layer colour"
                  aria-label={`Change colour of layer ${l.name}`}
                />
                {colorMenuId === l.id && colorMenuPos && (
                  <div
                    className="cad-layer-color-menu"
                    role="menu"
                    style={{
                      position: "fixed",
                      top: colorMenuPos.top,
                      left: colorMenuPos.left,
                      zIndex: 50,
                    }}
                  >
                    {LAYER_COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="cad-layer-color-chip"
                        style={{ background: c }}
                        onClick={() => { cad.updateLayer(l.id, { color: c }); setColorMenuId(null); }}
                        title={c}
                        aria-label={`Set colour ${c}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {isEditing ? (
                <input
                  className="input-field cad-layer-name-input"
                  value={draftName}
                  autoFocus
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                    else if (e.key === "Escape") { setEditingId(null); }
                  }}
                />
              ) : (
                <button
                  className="cad-layer-name"
                  type="button"
                  onClick={() => cad.setActiveLayer(l.id)}
                  onDoubleClick={() => beginRename(l.id, l.name)}
                  title="Click to make active · double-click to rename"
                >
                  {l.name}
                  <span className="cad-layer-count">{count}</span>
                </button>
              )}

              {isEditing ? (
                <button className="cad-layer-icon-btn" type="button" onMouseDown={(e) => e.preventDefault()}
                  onClick={commitRename} title="Save name">
                  <Check size={12} />
                </button>
              ) : (
                <button className="cad-layer-icon-btn" type="button" onClick={() => beginRename(l.id, l.name)}
                  title="Rename layer">
                  <Pencil size={12} />
                </button>
              )}

              <button className="cad-layer-icon-btn" type="button" onClick={() => cad.toggleLayerLocked(l.id)}
                title={l.locked ? "Unlock layer" : "Lock layer"}>
                {l.locked ? <Lock size={12} /> : <LockOpen size={12} />}
              </button>

              <button
                className="cad-layer-icon-btn cad-layer-delete"
                type="button"
                onClick={() => handleDelete(l.id, l.name)}
                disabled={model.layers.length <= 1}
                title={model.layers.length <= 1 ? "At least one layer is required" : "Delete layer"}
              >
                {model.layers.length <= 1 ? <X size={12} /> : <Trash2 size={12} />}
              </button>
            </div>
          );
        })}
      </div>
      <p className="cad-panel-hint">
        Click a name to set the active layer; double-click (or the pencil) to rename. Use the swatch to recolour,
        the lock to freeze edits, and the checkbox to hide. Locked layers stay visible but can't be selected or edited.
      </p>
    </div>
  );
}

function PropsTab({
  cad,
  model,
  selection,
  bearingFormat,
  axisConvention,
}: {
  cad: UseCadModel;
  model: CadModelState;
  selection: CadSelection;
  bearingFormat: BearingFormat;
  axisConvention: AxisConvention;
}) {
  const axLabels = axisBadgeLabels(axisConvention);
  const selCount = selection.items?.length ?? (selection.id ? 1 : 0);

  // Multiple objects selected → show a bulk editor (colour + delete), AutoCAD-style.
  if (selCount > 1) {
    return (
      <div className="cad-panel-block">
        <div className="cad-panel-title" style={{ padding: 0 }}>{selCount} objects selected</div>
        <ColorRow
          value={null}
          onChange={(c) => cad.setColorOfSelection(c)}
        />
        <button
          className="cad-chip-btn"
          type="button"
          onClick={() => {
            for (const it of selection.items ?? []) {
              if (it.type === "point") cad.deletePoint(it.id);
              else if (it.type === "linework") cad.deleteLinework(it.id);
              else if (it.type === "text") cad.deleteText(it.id);
              else if (it.type === "surface") cad.deleteSurface(it.id);
              else if (it.type === "arc") cad.deleteArc(it.id);
              else if (it.type === "circle") cad.deleteCircle(it.id);
              else if (it.type === "ellipse") cad.deleteEllipse(it.id);
              else if (it.type === "dimension") cad.deleteDimension(it.id);
              else if (it.type === "hatch") cad.deleteHatch(it.id);
            }
          }}
        >
          Delete {selCount} objects
        </button>
        <p className="cad-panel-hint">Bulk-edit colour, or delete the whole selection. Pick a single object to edit its geometry.</p>
      </div>
    );
  }

  if (selection.type === "point" && selection.id) {
    const p = model.points.find((x) => x.id === selection.id);
    if (!p) return <EmptyProps />;
    return (
      <div className="cad-panel-block">
        <div className="cad-panel-title" style={{ padding: 0 }}>Point {p.pointNo}</div>
        <EditableRow key={`${p.id}-ptno`} label="Pt #" value={p.pointNo} onChange={(v) => cad.updatePoint(p.id, { pointNo: v })} />
        <EditableRow key={`${p.id}-e`} label={axLabels.first} value={String(p.e)} numeric onChange={(v) => cad.updatePoint(p.id, { e: parseFloat(v) || 0 })} />
        <EditableRow key={`${p.id}-n`} label={axLabels.second} value={String(p.n)} numeric onChange={(v) => cad.updatePoint(p.id, { n: parseFloat(v) || 0 })} />
        <EditableRow key={`${p.id}-z`} label="H (Height/RL)" value={p.z == null ? "" : String(p.z)} numeric
          onChange={(v) => cad.updatePoint(p.id, { z: v === "" ? null : parseFloat(v) })} />
        <EditableRow key={`${p.id}-code`} label="Code" value={p.code} onChange={(v) => cad.updatePoint(p.id, { code: v })} />
        <ColorRow value={p.color ?? null} onChange={(c) => cad.updatePoint(p.id, { color: c })} />
        <button className="cad-chip-btn" type="button" onClick={() => cad.deletePoint(p.id)}>Delete point</button>
      </div>
    );
  }

  if (selection.type === "linework" && selection.id) {
    const lw = model.linework.find((x) => x.id === selection.id);
    if (!lw) return <EmptyProps />;
    let length = 0;
    for (let i = 1; i < lw.vertices.length; i++) {
      length += inverse(lw.vertices[i - 1], lw.vertices[i]).distance;
    }
    const area = lw.closed ? polygonArea(lw.vertices) : 0;
    return (
      <div className="cad-panel-block">
        <div className="cad-panel-title" style={{ padding: 0 }}>{lw.kind} ({lw.vertices.length} pts)</div>
        <div className="cad-prop-list">
          <div><span>Length</span><strong>{fmtDistance(length)} m</strong></div>
          {lw.closed && <div><span>Area</span><strong>{fmtArea(area)}</strong></div>}
          {lw.vertices.length >= 2 && (
            <div><span>Start bearing</span><strong>{fmtBearing(inverse(lw.vertices[0], lw.vertices[1]).azimuth, bearingFormat)}</strong></div>
          )}
        </div>
        <ColorRow value={lw.color ?? null} onChange={(c) => cad.updateLinework(lw.id, { color: c })} />
        <button className="cad-chip-btn" type="button" onClick={() => cad.deleteLinework(lw.id)}>Delete linework</button>
      </div>
    );
  }

  if (selection.type === "text" && selection.id) {
    const t = model.texts.find((x) => x.id === selection.id);
    if (!t) return <EmptyProps />;
    return (
      <div className="cad-panel-block">
        <div className="cad-panel-title" style={{ padding: 0 }}>Text</div>
        <EditableRow key={`${t.id}-text`} label="Content" value={t.text} onChange={(v) => cad.updateText(t.id, { text: v })} />
        <ColorRow value={t.color ?? null} onChange={(c) => cad.updateText(t.id, { color: c })} />
        <button className="cad-chip-btn" type="button" onClick={() => cad.deleteText(t.id)}>Delete text</button>
      </div>
    );
  }

  if (selection.type === "surface" && selection.id) {
    const srf = model.surfaces.find((x) => x.id === selection.id);
    if (!srf) return <EmptyProps />;
    const srfPoints = Array.isArray(srf.points) ? srf.points : [];
    const srfTriangles = Array.isArray(srf.triangles) ? srf.triangles : [];
    let planArea = 0;
    for (const tri of srfTriangles) {
      const a = srfPoints[tri.a];
      const b = srfPoints[tri.b];
      const c = srfPoints[tri.c];
      if (a && b && c) planArea += polygonArea([a, b, c]);
    }
    return (
      <div className="cad-panel-block">
        <div className="cad-panel-title" style={{ padding: 0 }}>{srf.name}</div>
        <EditableRow key={`${srf.id}-name`} label="Name" value={srf.name}
          onChange={(v) => cad.updateSurface(srf.id, { name: v })} />
        <div className="cad-prop-list">
          <div><span>Triangles</span><strong>{srfTriangles.length}</strong></div>
          <div><span>Points</span><strong>{srfPoints.length}</strong></div>
          <div><span>Plan area</span><strong>{fmtArea(planArea)}</strong></div>
        </div>
        <label className="cad-edit-row">
          <span>Visible</span>
          <input type="checkbox" checked={srf.visible} onChange={() => cad.toggleSurfaceVisible(srf.id)} />
        </label>
        <button className="cad-chip-btn" type="button" onClick={() => cad.deleteSurface(srf.id)}>Delete surface</button>
      </div>
    );
  }

  if (selection.type === "circle" && selection.id) {
    const c = model.circles.find((x) => x.id === selection.id);
    if (!c) return <EmptyProps />;
    return (
      <div className="cad-panel-block">
        <div className="cad-panel-title" style={{ padding: 0 }}>Circle</div>
        <div className="cad-prop-list">
          <div><span>Radius</span><strong>{fmtDistance(c.radius)}</strong></div>
          <div><span>Center {axLabels.first}</span><strong>{c.center.e.toFixed(3)}</strong></div>
          <div><span>Center {axLabels.second}</span><strong>{c.center.n.toFixed(3)}</strong></div>
        </div>
        <ColorRow value={c.color ?? null} onChange={(color) => cad.updateCircle(c.id, { color })} />
        <button className="cad-chip-btn" type="button" onClick={() => cad.deleteCircle(c.id)}>Delete circle</button>
      </div>
    );
  }

  if (selection.type === "ellipse" && selection.id) {
    const el = model.ellipses.find((x) => x.id === selection.id);
    if (!el) return <EmptyProps />;
    return (
      <div className="cad-panel-block">
        <div className="cad-panel-title" style={{ padding: 0 }}>Ellipse</div>
        <div className="cad-prop-list">
          <div><span>Semi-major</span><strong>{fmtDistance(el.semiMajor)}</strong></div>
          <div><span>Semi-minor</span><strong>{fmtDistance(el.semiMinor)}</strong></div>
          <div><span>Rotation</span><strong>{el.rotation.toFixed(2)}°</strong></div>
        </div>
        <ColorRow value={el.color ?? null} onChange={(color) => cad.updateEllipse(el.id, { color })} />
        <button className="cad-chip-btn" type="button" onClick={() => cad.deleteEllipse(el.id)}>Delete ellipse</button>
      </div>
    );
  }

  if (selection.type === "arc" && selection.id) {
    const a = model.arcs.find((x) => x.id === selection.id);
    if (!a) return <EmptyProps />;
    return (
      <div className="cad-panel-block">
        <div className="cad-panel-title" style={{ padding: 0 }}>Arc</div>
        <div className="cad-prop-list">
          <div><span>Radius</span><strong>{fmtDistance(a.radius)}</strong></div>
          <div><span>Start angle</span><strong>{a.startAngle.toFixed(2)}°</strong></div>
          <div><span>End angle</span><strong>{a.endAngle.toFixed(2)}°</strong></div>
        </div>
        <ColorRow value={a.color ?? null} onChange={(color) => cad.updateArc(a.id, { color })} />
        <button className="cad-chip-btn" type="button" onClick={() => cad.deleteArc(a.id)}>Delete arc</button>
      </div>
    );
  }

  if (selection.type === "dimension" && selection.id) {
    const d = model.dimensions.find((x) => x.id === selection.id);
    if (!d) return <EmptyProps />;
    return (
      <div className="cad-panel-block">
        <div className="cad-panel-title" style={{ padding: 0 }}>Dimension</div>
        <EditableRow key={`${d.id}-text`} label="Text" value={d.text}
          onChange={(v) => cad.updateDimension(d.id, { text: v })} />
        <div className="cad-prop-list">
          <div><span>Type</span><strong>{d.kind}</strong></div>
          <div><span>Def points</span><strong>{d.defPoints.length}</strong></div>
        </div>
        <ColorRow value={d.color ?? null} onChange={(color) => cad.updateDimension(d.id, { color })} />
        <button className="cad-chip-btn" type="button" onClick={() => cad.deleteDimension(d.id)}>Delete dimension</button>
      </div>
    );
  }

  if (selection.type === "hatch" && selection.id) {
    const h = model.hatches.find((x) => x.id === selection.id);
    if (!h) return <EmptyProps />;
    const area = polygonArea(h.vertices);
    return (
      <div className="cad-panel-block">
        <div className="cad-panel-title" style={{ padding: 0 }}>Hatch</div>
        <div className="cad-prop-list">
          <div><span>Vertices</span><strong>{h.vertices.length}</strong></div>
          <div><span>Holes</span><strong>{h.holes?.length ?? 0}</strong></div>
          <div><span>Pattern</span><strong>{h.pattern ?? "SOLID"}</strong></div>
          {area > 0 && <div><span>Area</span><strong>{fmtArea(area)}</strong></div>}
        </div>
        <ColorRow value={h.color ?? null} onChange={(color) => cad.updateHatch(h.id, { color })} />
        <button className="cad-chip-btn" type="button" onClick={() => cad.deleteHatch(h.id)}>Delete hatch</button>
      </div>
    );
  }

  return <EmptyProps />;
}

/** Colour selector row used in the Properties panel (ByLayer + explicit). */
function ColorRow({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  return (
    <label className="cad-edit-row">
      <span>Colour</span>
      <select
        className="input-field"
        value={value ?? "bylayer"}
        onChange={(e) => onChange(e.target.value === "bylayer" ? null : e.target.value)}
      >
        {CAD_COLORS.map((c) => (
          <option key={c.label} value={c.value ?? "bylayer"}>{c.label}</option>
        ))}
      </select>
    </label>
  );
}

function EmptyProps() {
  return (
    <div className="cad-panel-block" style={{ alignItems: "center", justifyContent: "center" }}>
      <p className="cad-panel-hint" style={{ textAlign: "center" }}>
        No entity selected<br />
        <span style={{ fontSize: 10 }}>Select a point, linework, or text annotation to view its properties.</span>
      </p>
    </div>
  );
}

function PointsTab({ cad, model }: { cad: UseCadModel; model: CadModelState }) {
  return (
    <div className="cad-panel-block">
      <div className="cad-panel-title" style={{ padding: 0 }}>Point Table ({model.points.length})</div>
      <div className="cad-point-table-wrap">
        <table className="cad-point-table">
          <thead>
            <tr><th>Pt</th><th>Y</th><th>X</th><th>H</th><th>Code</th></tr>
          </thead>
          <tbody>
            {model.points.map((p) => (
              <tr key={p.id} className={cad.selection.id === p.id ? "selected" : ""}
                onClick={() => cad.setSelection({ type: "point", id: p.id })}>
                <td>{p.pointNo}</td>
                <td>{fmtCoord(p.e, 2)}</td>
                <td>{fmtCoord(p.n, 2)}</td>
                <td>{p.z == null ? "—" : fmtCoord(p.z, 2)}</td>
                <td>{p.code}</td>
              </tr>
            ))}
            {model.points.length === 0 && (
              <tr><td colSpan={5} className="cad-point-table-empty">No points yet. Use the Point tool or import from Project Points.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditableRow({
  label,
  value,
  onChange,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  const [local, setLocal] = useState(value);

  const commit = () => {
    if (numeric && local.trim() !== "" && !Number.isFinite(parseFloat(local))) {
      setLocal(value);
      return;
    }
    onChange(local);
  };

  return (
    <label className="cad-edit-row">
      <span>{label}</span>
      <input
        className="input-field"
        inputMode={numeric ? "decimal" : "text"}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
      />
    </label>
  );
}
