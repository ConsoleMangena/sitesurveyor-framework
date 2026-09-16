import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAsyncAction } from "../../../../hooks/useAsyncAction.ts";
import {
  EMPTY_SELECTION,
  LAYER_PRESETS,
  type CadEntityType,
  type CadLayer,
  type CadModelState,
  type CadSelection,
  type LayerId,
  type SelectedItem,
  type SurveyArc,
  type SurveyCircle,
  type SurveyEllipse,
  type SurveyDimension,
  type SurveyHatch,
  type SurveyLinework,
  type SurveyPoint,
  type SurveySurface,
  type SurveyText,
} from "./cadModel.ts";
import { getCadDrawing, saveCadDrawing } from "../../../../lib/repositories/cadDrawings.ts";
import type { Json } from "../../../../lib/supabase/types.ts";
import {
  type CadHistoryState,
  applyRedo,
  applyUndo,
  beginTx,
  createCadHistoryState,
  discardTx,
  endTx,
  recordCommit,
  resetHistory as resetCadHistory,
} from "./model/cadUndo.ts";
import {
  CadPersistenceScheduler,
  LoadGeneration,
  cacheModel,
  isCadOnline,
  loadCachedModel,
  normalizeModel,
} from "./model/cadPersistence.ts";

export type CadSyncStatus = "idle" | "loading" | "saving" | "saved" | "error";

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/**
 * Attribute-side of ROTATE / SCALE / MIRROR for `mapSelection` (see
 * UseCadModel). Positions are handled by the point-mapping `fn`; these
 * operations carry the non-positional geometry (angles, radii, axes, text
 * size) so arcs, ellipses, text and dimensions aren't corrupted by transforms.
 */
export interface SelectionMapOps {
  /** Degrees added to arc start/end angles, ellipse rotations, text rotations, dimension angles and hatch pattern angles (CCW-from-E, the model convention). */
  rotateDeg?: number;
  /** Factor applied to circle/arc radii, ellipse axes and text heights. */
  scaleFactor?: number;
  /** Mirror-line direction in degrees (CCW-from-E). Flips attribute chirality; text stays readable (MIRRTEXT=0 behaviour). */
  mirrorAngleDeg?: number;
}

const normDeg = (d: number) => ((d % 360) + 360) % 360;

function mapArcAttrs(a: SurveyArc, ops?: SelectionMapOps): SurveyArc {
  if (!ops) return a;
  if (ops.mirrorAngleDeg !== undefined) {
    const phi = ops.mirrorAngleDeg;
    // Mirroring reverses sweep direction: swap the reflected ends so the
    // CCW-from-start sweep keeps tracing the same geometric arc.
    return {
      ...a,
      startAngle: normDeg(2 * phi - a.endAngle),
      endAngle: normDeg(2 * phi - a.startAngle),
    };
  }
  return {
    ...a,
    startAngle: normDeg(a.startAngle + (ops.rotateDeg ?? 0)),
    endAngle: normDeg(a.endAngle + (ops.rotateDeg ?? 0)),
    radius: ops.scaleFactor !== undefined ? a.radius * Math.abs(ops.scaleFactor) : a.radius,
  };
}

function mapCircleAttrs(c: SurveyCircle, ops?: SelectionMapOps): SurveyCircle {
  if (!ops || ops.scaleFactor === undefined) return c;
  return { ...c, radius: c.radius * Math.abs(ops.scaleFactor) };
}

function mapEllipseAttrs(el: SurveyEllipse, ops?: SelectionMapOps): SurveyEllipse {
  if (!ops) return el;
  const rotation =
    ops.mirrorAngleDeg !== undefined
      ? normDeg(2 * ops.mirrorAngleDeg - el.rotation)
      : normDeg(el.rotation + (ops.rotateDeg ?? 0));
  const k = ops.scaleFactor !== undefined ? Math.abs(ops.scaleFactor) : 1;
  return { ...el, rotation, semiMajor: el.semiMajor * k, semiMinor: el.semiMinor * k };
}

function mapTextAttrs(t: SurveyText, ops?: SelectionMapOps): SurveyText {
  if (!ops) return t;
  const out = { ...t };
  // Rotation is not mirrored — text stays readable (AutoCAD MIRRTEXT=0).
  if (ops.mirrorAngleDeg === undefined && ops.rotateDeg !== undefined && typeof out.rotation === "number") {
    out.rotation = normDeg(out.rotation + ops.rotateDeg);
  }
  if (ops.scaleFactor !== undefined && typeof out.height === "number") {
    out.height = out.height * Math.abs(ops.scaleFactor);
  }
  return out;
}

function mapDimensionAttrs(d: SurveyDimension, ops?: SelectionMapOps): SurveyDimension {
  if (!ops || typeof d.angle !== "number" || d.angle == null) return d;
  const angle =
    ops.mirrorAngleDeg !== undefined
      ? normDeg(2 * ops.mirrorAngleDeg - d.angle)
      : normDeg(d.angle + (ops.rotateDeg ?? 0));
  return { ...d, angle };
}

function mapHatchAttrs(h: SurveyHatch, ops?: SelectionMapOps): SurveyHatch {
  if (!ops || h.patternAngle == null) return h;
  const patternAngle =
    ops.mirrorAngleDeg !== undefined
      ? normDeg(2 * ops.mirrorAngleDeg - h.patternAngle)
      : normDeg(h.patternAngle + (ops.rotateDeg ?? 0));
  return { ...h, patternAngle };
}

export interface UseCadModel {
  model: CadModelState;
  selection: CadSelection;
  setSelection: (sel: CadSelection) => void;
  setActiveLayer: (id: LayerId) => void;
  addPoint: (p: Omit<SurveyPoint, "id" | "layerId"> & { layerId?: LayerId }) => SurveyPoint;
  updatePoint: (id: string, patch: Partial<SurveyPoint>) => void;
  deletePoint: (id: string) => void;
  addLinework: (l: Omit<SurveyLinework, "id" | "layerId"> & { layerId?: LayerId }) => SurveyLinework;
  updateLinework: (id: string, patch: Partial<SurveyLinework>) => void;
  deleteLinework: (id: string) => void;
  addText: (t: Omit<SurveyText, "id" | "layerId"> & { layerId?: LayerId }) => SurveyText;
  updateText: (id: string, patch: Partial<SurveyText>) => void;
  deleteText: (id: string) => void;
  addSurface: (s: Omit<SurveySurface, "id" | "layerId" | "visible"> & { layerId?: LayerId; visible?: boolean }) => SurveySurface;
  updateSurface: (id: string, patch: Partial<SurveySurface>) => void;
  deleteSurface: (id: string) => void;
  toggleSurfaceVisible: (id: string) => void;
  addArc: (a: Omit<SurveyArc, "id" | "layerId"> & { layerId?: LayerId }) => SurveyArc;
  updateArc: (id: string, patch: Partial<SurveyArc>) => void;
  deleteArc: (id: string) => void;
  addCircle: (c: Omit<SurveyCircle, "id" | "layerId"> & { layerId?: LayerId }) => SurveyCircle;
  updateCircle: (id: string, patch: Partial<SurveyCircle>) => void;
  deleteCircle: (id: string) => void;
  addEllipse: (el: Omit<SurveyEllipse, "id" | "layerId"> & { layerId?: LayerId }) => SurveyEllipse;
  updateEllipse: (id: string, patch: Partial<SurveyEllipse>) => void;
  deleteEllipse: (id: string) => void;
  addDimension: (d: Omit<SurveyDimension, "id" | "layerId"> & { layerId?: LayerId }) => SurveyDimension;
  updateDimension: (id: string, patch: Partial<SurveyDimension>) => void;
  deleteDimension: (id: string) => void;
  addHatch: (h: Omit<SurveyHatch, "id" | "layerId"> & { layerId?: LayerId }) => SurveyHatch;
  updateHatch: (id: string, patch: Partial<SurveyHatch>) => void;
  deleteHatch: (id: string) => void;
  toggleLayerVisible: (id: LayerId) => void;
  toggleLayerLocked: (id: LayerId) => void;
  /**
   * Create a new layer with a unique id derived from `name`. The new layer
   * becomes the active layer. Returns the created layer (or the existing one if
   * a layer with the same id already exists).
   */
  addLayer: (name: string, color?: string) => CadLayer;
  /**
   * Ensure a layer with the given id exists, creating it from the preset if it
   * does not. Returns the existing or newly-created layer.
   */
  ensureLayerById: (id: LayerId) => CadLayer;
  /** Rename and/or recolour a layer. */
  updateLayer: (id: LayerId, patch: Partial<Pick<CadLayer, "name" | "color">>) => boolean;
  /**
   * Delete a layer. Entities on it are reassigned to `reassignTo` (defaults to
   * the first remaining layer). The last remaining layer cannot be deleted.
   * Returns true when the layer was removed.
   */
  deleteLayer: (id: LayerId, reassignTo?: LayerId) => boolean;
  /** Count entities (points + linework + texts + surfaces) on a layer. */
  layerEntityCount: (id: LayerId) => number;
  importPoints: (rows: Omit<SurveyPoint, "id" | "layerId">[], layerId?: LayerId) => number;
  /** Apply a colour (null = ByLayer) to every entity in the current selection. */
  setColorOfSelection: (color: string | null) => number;
  /**
   * Move or copy the current selection by a (dn, de) survey-coordinate delta.
   * When `asCopy` is true the originals are kept and duplicates are created and
   * selected (AutoCAD COPY); otherwise the originals are translated in place
   * (AutoCAD MOVE). Returns the number of objects affected.
   */
  transformSelection: (dn: number, de: number, asCopy: boolean) => number;
  /**
   * Apply an arbitrary 2D transform to every point in the selection. When
   * `asCopy` is true the originals are kept and transformed copies are created
   * and selected. `ops` carries the attribute-side of ROTATE/SCALE/MIRROR so
   * arc angles, radii, ellipse axes, text and dimension rotations transform
   * with the geometry instead of being corrupted. Returns the count affected.
   */
  mapSelection: (
    fn: (p: { n: number; e: number }) => { n: number; e: number },
    asCopy: boolean,
    ops?: SelectionMapOps,
  ) => number;
  /** Create a parallel offset copy of a polyline/boundary. Positive distance is to the left. */
  offsetLinework: (id: string, distance: number) => SurveyLinework | null;
  clearAll: () => void;
  /** Delete the last drawing change. Returns true if anything was undone. */
  undo: () => boolean;
  /** Redo the last undone change. Returns true if anything was redone. */
  redo: () => boolean;
  /** Whether an undo / redo is currently available (for toolbar enabling). */
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Group the following commits into ONE undo step (for multi-entity
   * operations: selection delete, explode, import, contour generation).
   * No nesting — a second begin while open is a no-op.
   */
  beginTransaction: () => void;
  /** Close the group; everything since `beginTransaction` undoes as one step. */
  endTransaction: () => void;
  /** Close the group AND restore the model from before it (Esc-cancel). */
  discardTransaction: () => void;
  nextPointNo: () => string;
  layerById: (id: LayerId) => CadLayer | undefined;
  /** Backend synchronisation state for the drawing. */
  syncStatus: CadSyncStatus;
  /** Last sync error message, if any. */
  syncError: string | null;
}

export function useCadModel(projectId: string, workspaceId?: string): UseCadModel {
  // Seed from the offline cache so the canvas paints instantly; the backend
  // copy (authoritative, team-shared) is loaded right after and replaces it.
  const [model, setModel] = useState<CadModelState>(() => loadCachedModel(projectId));
  const [selection, setSelection] = useState<CadSelection>(EMPTY_SELECTION);
  const [syncStatus, setSyncStatus] = useState<CadSyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  // ── Undo / redo history ───────────────────────────────────────────────────
  // `past`/`future` hold model snapshots. A content mutation pushes the current
  // model onto `past` and clears `future`; undo/redo move snapshots between the
  // two stacks. The pure machine (model/cadUndo.ts) owns the stacks, the
  // transaction collapse and the 100-entry cap; this hook only mirrors the
  // flags into React state.
  const histRef = useRef<CadHistoryState>(createCadHistoryState());
  // Always-current mirror of `model` so undo/redo/commit can read and rewrite
  // history synchronously without depending on a stale closure.
  const modelRef = useRef<CadModelState>(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);
  // `canUndo`/`canRedo` are mirrored into state so the UI re-renders and the
  // values are read from state (never refs) during render.
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(histRef.current.past.length > 0);
    setCanRedo(histRef.current.future.length > 0);
  }, []);

  const resetHistory = useCallback(() => {
    resetCadHistory(histRef.current);
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  /**
   * Apply a content mutation while recording history. `updater` receives the
   * current model and returns the next one. The pre-mutation model is pushed
   * onto the undo stack and the redo stack is cleared (standard editor model).
   */
  const commit = useCallback((updater: (m: CadModelState) => CadModelState) => {
    const prev = modelRef.current;
    const next = updater(prev);
    if (!recordCommit(histRef.current, prev, next)) return; // no-op guard
    modelRef.current = next;
    setModel(next);
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  /** Group the following commits into a single undo step (no nesting). */
  const beginTransaction = useCallback(() => {
    beginTx(histRef.current, modelRef.current);
  }, []);

  /** Close the current transaction; everything since `beginTransaction` undoes as one step. */
  const endTransaction = useCallback(() => {
    endTx(histRef.current);
  }, []);

  /** Close the current transaction AND restore the model from before it (cancel). */
  const discardTransaction = useCallback(() => {
    const base = discardTx(histRef.current);
    if (!base) return;
    modelRef.current = base;
    setModel(base);
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  // Track the project the current state belongs to. Adjusting state during
  // render (the React-recommended alternative to setState-in-effect) when the
  // project changes, so switching projects reloads the cached model.
  const [loadedProject, setLoadedProject] = useState(projectId);
  if (loadedProject !== projectId) {
    setLoadedProject(projectId);
    setModel(loadCachedModel(projectId));
    setSelection(EMPTY_SELECTION);
    setCanUndo(false);
    setCanRedo(false);
  }

  // Clear the undo stacks on project switch — in a layout effect because refs
  // may not be mutated during render. Layout effects complete synchronously
  // before paint and before any keyboard event can fire, so Ctrl+Z can never
  // pop the previous project's model into the new one.
  useLayoutEffect(() => {
    resetCadHistory(histRef.current);
  }, [projectId]);

  // Generation guard: a backend load for project A that resolves after the
  // user has already switched to project B must never overwrite B's model.
  const loadGenerationRef = useRef<LoadGeneration>(new LoadGeneration());

  // Guards so we never persist before the backend copy has loaded (which would
  // clobber team work with a fresh empty model). The debounce timers themselves
  // live in the persistence scheduler (model/cadPersistence.ts).
  const hydratedRef = useRef(false);

  // Push the current model to the backend. Non-fatal when offline.
  const saveToBackend = useCallback(
    async (modelToSave: CadModelState) => {
      if (!workspaceId) return;
      setSyncStatus("saving");
      try {
        await saveCadDrawing(projectId, workspaceId, modelToSave as unknown as Json);
        setSyncStatus("saved");
        setSyncError(null);
      } catch (err) {
        const online = isCadOnline();
        if (!online) {
          // Queue silently while offline; sync will resume when the browser comes online.
          setSyncStatus("idle");
          setSyncError(null);
        } else {
          setSyncStatus("error");
          setSyncError(err instanceof Error ? err.message : "Failed to save CAD work.");
        }
      }
    },
    [projectId, workspaceId],
  );

  // Debounced cache/backend writes: one scheduler per hook instance; its
  // closures read the live refs/state. `workspaceId` folds into `online()`
  // because a save without a workspace target is meaningless.
  const currentModel = useCallback(() => modelRef.current, []);
  const isHydrated = useCallback(() => hydratedRef.current, []);
  const hasWorkspaceAndOnline = useCallback(() => Boolean(workspaceId) && isCadOnline(), [workspaceId]);
  const persistence = useMemo(
    () =>
      // The deps below are invoked exclusively from timer/event contexts inside
      // CadPersistenceScheduler — never during render — so the ref reads are safe.
      // eslint-disable-next-line react-hooks/refs
      new CadPersistenceScheduler({
        projectId,
        getCachedModel: currentModel,
        hydrated: isHydrated,
        online: hasWorkspaceAndOnline,
        save: saveToBackend,
      }),
    [projectId, currentModel, isHydrated, hasWorkspaceAndOnline, saveToBackend],
  );

  // Load the authoritative model from the backend whenever the project changes.
  // If the browser reports it is offline, stay hydrated from the local cache
  // so drafting never stalls waiting for a network request.
  const loadFromBackend = useCallback(async () => {
    const generation = loadGenerationRef.current.next();
    hydratedRef.current = false;
    // Start each project with a clean undo history.
    resetHistory();
    setSyncStatus("loading");
    setSyncError(null);

    if (!isCadOnline()) {
      hydratedRef.current = true;
      setSyncStatus("idle");
      return;
    }

    try {
      const record = await getCadDrawing(projectId);
      // Superseded by a newer project load while this request was in flight —
      // drop the stale response instead of writing A's model into B.
      if (!loadGenerationRef.current.isCurrent(generation)) return;
      if (record?.model) {
        const remote = normalizeModel(record.model as Partial<CadModelState>);
        setModel(remote);
        cacheModel(projectId, remote);
        // The freshly loaded server copy is the new baseline; discard any
        // history accumulated against the local cache.
        resetHistory();
      }
      hydratedRef.current = true;
      setSyncStatus("idle");
    } catch (err) {
      if (!loadGenerationRef.current.isCurrent(generation)) return;
      hydratedRef.current = true;
      if (!isCadOnline()) {
        // Network is down — the local cache is already loaded and usable.
        setSyncStatus("idle");
        setSyncError(null);
      } else {
        setSyncStatus("error");
        setSyncError(err instanceof Error ? err.message : "Failed to load saved CAD work.");
      }
    }
  }, [projectId, resetHistory]);

  useAsyncAction(loadFromBackend, [loadFromBackend]);

  // Flush any pending debounced writes when leaving — edits made in the last
  // CACHE_DEBOUNCE_MS/SAVE_DEBOUNCE_MS would otherwise be silently dropped
  // when the workspace unmounts or the tab closes.
  useEffect(() => {
    const flush = () => {
      void persistence.flush();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [persistence]);

  // Persist on change: the scheduler restarts the cache timer on every model
  // change (always, even before hydration/offline) and schedules the backend
  // upsert only once hydrated + online. Rapid edits (imports, drag ops,
  // contour generation) therefore do not block the main thread with repeated
  // JSON.stringify or network calls.
  useEffect(() => {
    persistence.onModelChange();
  }, [persistence, model]);

  // When connectivity changes, keep the sync status honest and push/pause
  // accordingly. Using event listeners avoids synchronous setState in effects.
  useEffect(() => {
    const handleOnline = () => {
      if (!hydratedRef.current || !workspaceId) return;
      void saveToBackend(modelRef.current);
    };
    const handleOffline = () => {
      setSyncStatus("idle");
      setSyncError(null);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [workspaceId, saveToBackend]);

  const layerById = useCallback(
    (id: LayerId) => model.layers.find((l) => l.id === id),
    [model.layers],
  );

  /** True when the entity's layer is locked (edits/deletes are blocked). */
  const isEntityLocked = useCallback((layerId: LayerId | undefined): boolean => {
    if (!layerId) return false;
    return modelRef.current.layers.find((l) => l.id === layerId)?.locked === true;
  }, []);

  const setActiveLayer = useCallback((id: LayerId) => {
    setModel((m) => ({ ...m, activeLayerId: id }));
  }, []);

  const nextPointNo = useCallback(() => {
    // Running max — a spread-over-array overflows the call stack on large
    // point sets.
    let max = 1000;
    for (const p of model.points) {
      const n = parseInt(p.pointNo, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return String(max + 1);
  }, [model.points]);

  const addPoint = useCallback<UseCadModel["addPoint"]>((p) => {
    const point: SurveyPoint = {
      id: nextId("pt"),
      pointNo: p.pointNo,
      n: p.n,
      e: p.e,
      z: p.z ?? null,
      code: p.code ?? "",
      layerId: p.layerId ?? modelRef.current.activeLayerId,
      color: p.color ?? null,
    };
    commit((m) => ({ ...m, points: [...m.points, point] }));
    return point;
  }, [commit]);

  const updatePoint = useCallback((id: string, patch: Partial<SurveyPoint>) => {
    commit((m) => {
      const p = m.points.find((x) => x.id === id);
      if (!p || isEntityLocked(p.layerId)) return m;
      return { ...m, points: m.points.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
    });
  }, [commit, isEntityLocked]);

  const dropFromSelection = useCallback((id: string) => {
    setSelection((s) => {
      const items = (s.items ?? []).filter((it) => it.id !== id);
      if (items.length === 0) return EMPTY_SELECTION;
      const primary = items[items.length - 1];
      return { type: primary.type, id: primary.id, items };
    });
  }, []);

  const deletePoint = useCallback((id: string) => {
    commit((m) => {
      const p = m.points.find((x) => x.id === id);
      if (!p || isEntityLocked(p.layerId)) return m;
      return { ...m, points: m.points.filter((x) => x.id !== id) };
    });
    dropFromSelection(id);
  }, [dropFromSelection, commit, isEntityLocked]);

  const addLinework = useCallback<UseCadModel["addLinework"]>((l) => {
    const work: SurveyLinework = {
      id: nextId("lw"),
      kind: l.kind,
      vertices: l.vertices,
      closed: l.closed,
      layerId: l.layerId ?? modelRef.current.activeLayerId,
      color: l.color ?? null,
      label: l.label,
    };
    commit((m) => ({ ...m, linework: [...m.linework, work] }));
    return work;
  }, [commit]);

  const updateLinework = useCallback((id: string, patch: Partial<SurveyLinework>) => {
    commit((m) => {
      const lw = m.linework.find((x) => x.id === id);
      if (!lw || isEntityLocked(lw.layerId)) return m;
      return { ...m, linework: m.linework.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
    });
  }, [commit, isEntityLocked]);

  const deleteLinework = useCallback((id: string) => {
    commit((m) => {
      const lw = m.linework.find((x) => x.id === id);
      if (!lw || isEntityLocked(lw.layerId)) return m;
      return { ...m, linework: m.linework.filter((x) => x.id !== id) };
    });
    dropFromSelection(id);
  }, [dropFromSelection, commit, isEntityLocked]);

  const addText = useCallback<UseCadModel["addText"]>((t) => {
    const txt: SurveyText = {
      id: nextId("tx"),
      n: t.n,
      e: t.e,
      text: t.text,
      layerId: t.layerId ?? modelRef.current.activeLayerId,
      color: t.color ?? null,
      height: t.height,
      rotation: t.rotation,
    };
    commit((m) => ({ ...m, texts: [...m.texts, txt] }));
    return txt;
  }, [commit]);

  const updateText = useCallback((id: string, patch: Partial<SurveyText>) => {
    commit((m) => {
      const t = m.texts.find((x) => x.id === id);
      if (!t || isEntityLocked(t.layerId)) return m;
      return { ...m, texts: m.texts.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
    });
  }, [commit, isEntityLocked]);

  const deleteText = useCallback((id: string) => {
    commit((m) => {
      const t = m.texts.find((x) => x.id === id);
      if (!t || isEntityLocked(t.layerId)) return m;
      return { ...m, texts: m.texts.filter((x) => x.id !== id) };
    });
    dropFromSelection(id);
  }, [dropFromSelection, commit, isEntityLocked]);

  const addSurface = useCallback<UseCadModel["addSurface"]>((s) => {
    const surface: SurveySurface = {
      id: nextId("srf"),
      name: s.name,
      points: s.points,
      triangles: s.triangles,
      layerId: s.layerId ?? modelRef.current.activeLayerId,
      visible: s.visible ?? true,
      cutFill: s.cutFill,
      slopeShade: s.slopeShade,
    };
    commit((m) => ({ ...m, surfaces: [...m.surfaces, surface] }));
    return surface;
  }, [commit]);

  const updateSurface = useCallback<UseCadModel["updateSurface"]>((id, patch) => {
    commit((m) => {
      const s = m.surfaces.find((x) => x.id === id);
      if (!s) return m;
      return { ...m, surfaces: m.surfaces.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
    });
  }, [commit]);

  const deleteSurface = useCallback((id: string) => {
    commit((m) => ({ ...m, surfaces: m.surfaces.filter((s) => s.id !== id) }));
    dropFromSelection(id);
  }, [dropFromSelection, commit]);

  const addArc = useCallback<UseCadModel["addArc"]>((a) => {
    const arc: SurveyArc = {
      id: nextId("arc"),
      center: a.center,
      radius: a.radius,
      startAngle: a.startAngle,
      endAngle: a.endAngle,
      layerId: a.layerId ?? modelRef.current.activeLayerId,
      color: a.color ?? null,
    };
    commit((m) => ({ ...m, arcs: [...m.arcs, arc] }));
    return arc;
  }, [commit]);

  const updateArc = useCallback((id: string, patch: Partial<SurveyArc>) => {
    commit((m) => {
      const a = m.arcs.find((x) => x.id === id);
      if (!a || isEntityLocked(a.layerId)) return m;
      return { ...m, arcs: m.arcs.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
    });
  }, [commit, isEntityLocked]);

  const deleteArc = useCallback((id: string) => {
    commit((m) => {
      const a = m.arcs.find((x) => x.id === id);
      if (!a || isEntityLocked(a.layerId)) return m;
      return { ...m, arcs: m.arcs.filter((x) => x.id !== id) };
    });
    dropFromSelection(id);
  }, [dropFromSelection, commit, isEntityLocked]);

  const addCircle = useCallback<UseCadModel["addCircle"]>((c) => {
    const circle: SurveyCircle = {
      id: nextId("cir"),
      center: c.center,
      radius: c.radius,
      layerId: c.layerId ?? modelRef.current.activeLayerId,
      color: c.color ?? null,
    };
    commit((m) => ({ ...m, circles: [...m.circles, circle] }));
    return circle;
  }, [commit]);

  const updateCircle = useCallback((id: string, patch: Partial<SurveyCircle>) => {
    commit((m) => {
      const c = m.circles.find((x) => x.id === id);
      if (!c || isEntityLocked(c.layerId)) return m;
      return { ...m, circles: m.circles.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
    });
  }, [commit, isEntityLocked]);

  const deleteCircle = useCallback((id: string) => {
    commit((m) => {
      const c = m.circles.find((x) => x.id === id);
      if (!c || isEntityLocked(c.layerId)) return m;
      return { ...m, circles: m.circles.filter((x) => x.id !== id) };
    });
    dropFromSelection(id);
  }, [dropFromSelection, commit, isEntityLocked]);

  const addEllipse = useCallback<UseCadModel["addEllipse"]>((el) => {
    const ellipse: SurveyEllipse = {
      id: nextId("ell"),
      center: el.center,
      semiMajor: el.semiMajor,
      semiMinor: el.semiMinor,
      rotation: el.rotation,
      layerId: el.layerId ?? modelRef.current.activeLayerId,
      color: el.color ?? null,
    };
    commit((m) => ({ ...m, ellipses: [...m.ellipses, ellipse] }));
    return ellipse;
  }, [commit]);

  const updateEllipse = useCallback((id: string, patch: Partial<SurveyEllipse>) => {
    commit((m) => {
      const el = m.ellipses.find((x) => x.id === id);
      if (!el || isEntityLocked(el.layerId)) return m;
      return { ...m, ellipses: m.ellipses.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
    });
  }, [commit, isEntityLocked]);

  const deleteEllipse = useCallback((id: string) => {
    commit((m) => {
      const el = m.ellipses.find((x) => x.id === id);
      if (!el || isEntityLocked(el.layerId)) return m;
      return { ...m, ellipses: m.ellipses.filter((x) => x.id !== id) };
    });
    dropFromSelection(id);
  }, [dropFromSelection, commit, isEntityLocked]);

  const addDimension = useCallback<UseCadModel["addDimension"]>((d) => {
    const dim: SurveyDimension = {
      id: nextId("dim"),
      kind: d.kind,
      text: d.text,
      textPosition: d.textPosition,
      defPoints: d.defPoints,
      angle: d.angle,
      layerId: d.layerId ?? modelRef.current.activeLayerId,
      color: d.color ?? null,
    };
    commit((m) => ({ ...m, dimensions: [...m.dimensions, dim] }));
    return dim;
  }, [commit]);

  const updateDimension = useCallback((id: string, patch: Partial<SurveyDimension>) => {
    commit((m) => {
      const d = m.dimensions.find((x) => x.id === id);
      if (!d || isEntityLocked(d.layerId)) return m;
      return { ...m, dimensions: m.dimensions.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
    });
  }, [commit, isEntityLocked]);

  const deleteDimension = useCallback((id: string) => {
    commit((m) => {
      const d = m.dimensions.find((x) => x.id === id);
      if (!d || isEntityLocked(d.layerId)) return m;
      return { ...m, dimensions: m.dimensions.filter((x) => x.id !== id) };
    });
    dropFromSelection(id);
  }, [dropFromSelection, commit, isEntityLocked]);

  const addHatch = useCallback<UseCadModel["addHatch"]>((h) => {
    const hatch: SurveyHatch = {
      id: nextId("hatch"),
      vertices: h.vertices,
      holes: h.holes,
      pattern: h.pattern,
      patternScale: h.patternScale,
      patternAngle: h.patternAngle,
      layerId: h.layerId ?? modelRef.current.activeLayerId,
      color: h.color ?? null,
    };
    commit((m) => ({ ...m, hatches: [...m.hatches, hatch] }));
    return hatch;
  }, [commit]);

  const updateHatch = useCallback((id: string, patch: Partial<SurveyHatch>) => {
    commit((m) => {
      const h = m.hatches.find((x) => x.id === id);
      if (!h || isEntityLocked(h.layerId)) return m;
      return { ...m, hatches: m.hatches.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
    });
  }, [commit, isEntityLocked]);

  const deleteHatch = useCallback((id: string) => {
    commit((m) => {
      const h = m.hatches.find((x) => x.id === id);
      if (!h || isEntityLocked(h.layerId)) return m;
      return { ...m, hatches: m.hatches.filter((x) => x.id !== id) };
    });
    dropFromSelection(id);
  }, [dropFromSelection, commit, isEntityLocked]);

  // Surface visibility is a view toggle, not a content edit, so it stays out
  // of the undo history.
  const toggleSurfaceVisible = useCallback((id: string) => {
    setModel((m) => ({
      ...m,
      surfaces: m.surfaces.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)),
    }));
  }, []);

  const toggleLayerVisible = useCallback((id: LayerId) => {
    setModel((m) => ({
      ...m,
      layers: m.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    }));
  }, []);

  const toggleLayerLocked = useCallback((id: LayerId) => {
    setModel((m) => ({
      ...m,
      layers: m.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)),
    }));
  }, []);

  /** Build a unique, AutoCAD-style layer id from a display name. */
  const uniqueLayerId = useCallback((name: string, existing: CadLayer[]): LayerId => {
    const base = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "LAYER";
    let id = base;
    let i = 1;
    while (existing.some((l) => l.id === id)) {
      id = `${base}_${i}`;
      i += 1;
    }
    return id;
  }, []);

  // A short, readable default-colour cycle for new layers.
  const LAYER_PALETTE = [
    "#38bdf8", "#f97316", "#a78bfa", "#f43f5e", "#22c55e",
    "#eab308", "#e2e8f0", "#14b8a6", "#ec4899", "#f59e0b",
  ];

  /** Make a display name unique among existing layers (AutoCAD names must be unique). */
  const uniqueLayerName = useCallback((name: string, existing: CadLayer[], selfId?: LayerId): string => {
    const base = name.trim() || "Layer";
    if (!existing.some((l) => l.name === base && l.id !== selfId)) return base;
    let i = 2;
    while (existing.some((l) => l.name === `${base} ${i}` && l.id !== selfId)) i += 1;
    return `${base} ${i}`;
  }, []);

  // Creating/renaming/deleting layers is a content edit (it can reassign
  // entities), so it goes through `commit` and participates in undo/redo.
  const addLayer = useCallback<UseCadModel["addLayer"]>((name, color) => {
    const current = modelRef.current;
    const trimmed = (name ?? "").trim();
    const baseName = trimmed || "Layer";
    const layerName = uniqueLayerName(baseName, current.layers);
    const id = uniqueLayerId(layerName, current.layers);
    const layer: CadLayer = {
      id,
      name: layerName,
      color: color ?? LAYER_PALETTE[current.layers.length % LAYER_PALETTE.length],
      visible: true,
      locked: false,
    };
    commit((m) => ({ ...m, layers: [...m.layers, layer], activeLayerId: id }));
    return layer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, uniqueLayerId, uniqueLayerName]);

  const ensureLayerById = useCallback<UseCadModel["ensureLayerById"]>((id) => {
    const current = modelRef.current;
    const existing = current.layers.find((l) => l.id === id);
    if (existing) return existing;
    const preset = LAYER_PRESETS[id];
    const layerName = preset ? uniqueLayerName(preset.name, current.layers) : uniqueLayerName(id, current.layers);
    const layer: CadLayer = {
      id,
      name: layerName,
      color: preset?.color ?? LAYER_PALETTE[current.layers.length % LAYER_PALETTE.length],
      visible: true,
      locked: false,
    };
    commit((m) => ({ ...m, layers: [...m.layers, layer] }));
    return layer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, uniqueLayerName]);

  const updateLayer = useCallback<UseCadModel["updateLayer"]>((id, patch) => {
    let ok = false;
    commit((m) => {
      const target = m.layers.find((l) => l.id === id);
      if (!target) return m;
      const clean: Partial<Pick<CadLayer, "name" | "color">> = {};
      if (typeof patch.name === "string" && patch.name.trim()) {
        clean.name = uniqueLayerName(patch.name.trim(), m.layers, id);
      }
      if (typeof patch.color === "string" && patch.color) clean.color = patch.color;
      if (Object.keys(clean).length === 0) return m;
      ok = true;
      return {
        ...m,
        layers: m.layers.map((l) => (l.id === id ? { ...l, ...clean } : l)),
      };
    });
    return ok;
  }, [commit, uniqueLayerName]);

  const deleteLayer = useCallback<UseCadModel["deleteLayer"]>((id, reassignTo) => {
    const current = modelRef.current;
    if (current.layers.length <= 1) return false; // keep at least one layer
    if (!current.layers.some((l) => l.id === id)) return false;
    const target = reassignTo && current.layers.some((l) => l.id === reassignTo && l.id !== id)
      ? reassignTo
      : current.layers.find((l) => l.id !== id)!.id;

    commit((m) => ({
      ...m,
      layers: m.layers.filter((l) => l.id !== id),
      points: m.points.map((p) => (p.layerId === id ? { ...p, layerId: target } : p)),
      linework: m.linework.map((l) => (l.layerId === id ? { ...l, layerId: target } : l)),
      texts: m.texts.map((t) => (t.layerId === id ? { ...t, layerId: target } : t)),
      surfaces: m.surfaces.map((s) => (s.layerId === id ? { ...s, layerId: target } : s)),
      arcs: m.arcs.map((a) => (a.layerId === id ? { ...a, layerId: target } : a)),
      circles: m.circles.map((c) => (c.layerId === id ? { ...c, layerId: target } : c)),
      ellipses: m.ellipses.map((el) => (el.layerId === id ? { ...el, layerId: target } : el)),
      dimensions: m.dimensions.map((d) => (d.layerId === id ? { ...d, layerId: target } : d)),
      hatches: m.hatches.map((h) => (h.layerId === id ? { ...h, layerId: target } : h)),
      activeLayerId: m.activeLayerId === id ? target : m.activeLayerId,
    }));
    return true;
  }, [commit]);

  const layerEntityCount = useCallback<UseCadModel["layerEntityCount"]>((id) => {
    return (
      model.points.filter((p) => p.layerId === id).length +
      model.linework.filter((l) => l.layerId === id).length +
      model.texts.filter((t) => t.layerId === id).length +
      model.surfaces.filter((s) => s.layerId === id).length +
      model.arcs.filter((a) => a.layerId === id).length +
      model.circles.filter((c) => c.layerId === id).length +
      model.ellipses.filter((el) => el.layerId === id).length +
      model.dimensions.filter((d) => d.layerId === id).length +
      model.hatches.filter((h) => h.layerId === id).length
    );
  }, [model.points, model.linework, model.texts, model.surfaces, model.arcs, model.circles, model.ellipses, model.dimensions, model.hatches]);

  const importPoints = useCallback<UseCadModel["importPoints"]>((rows, layerId) => {
    const active = modelRef.current.activeLayerId;
    const created: SurveyPoint[] = rows.map((r) => ({
      id: nextId("pt"),
      pointNo: r.pointNo,
      n: r.n,
      e: r.e,
      z: r.z ?? null,
      code: r.code ?? "",
      layerId: layerId ?? active,
      color: null,
    }));
    commit((m) => ({ ...m, points: [...m.points, ...created] }));
    return created.length;
  }, [commit]);

  const setColorOfSelection = useCallback<UseCadModel["setColorOfSelection"]>((color) => {
    const sel = selection;
    const items = sel.items && sel.items.length
      ? sel.items
      : sel.type && sel.id
        ? [{ type: sel.type, id: sel.id }]
        : [];
    if (items.length === 0) return 0;
    const groupIds = (type: CadEntityType) => new Set(items.filter((i) => i.type === type).map((i) => i.id));
    const ptIds = groupIds("point");
    const lwIds = groupIds("linework");
    const txIds = groupIds("text");
    const arcIds = groupIds("arc");
    const cirIds = groupIds("circle");
    const ellIds = groupIds("ellipse");
    const dimIds = groupIds("dimension");
    const hatchIds = groupIds("hatch");
    commit((m) => ({
      ...m,
      points: m.points.map((p) => (ptIds.has(p.id) ? { ...p, color } : p)),
      linework: m.linework.map((l) => (lwIds.has(l.id) ? { ...l, color } : l)),
      texts: m.texts.map((t) => (txIds.has(t.id) ? { ...t, color } : t)),
      arcs: m.arcs.map((a) => (arcIds.has(a.id) ? { ...a, color } : a)),
      circles: m.circles.map((c) => (cirIds.has(c.id) ? { ...c, color } : c)),
      ellipses: m.ellipses.map((el) => (ellIds.has(el.id) ? { ...el, color } : el)),
      dimensions: m.dimensions.map((d) => (dimIds.has(d.id) ? { ...d, color } : d)),
      hatches: m.hatches.map((h) => (hatchIds.has(h.id) ? { ...h, color } : h)),
    }));
    return items.length;
  }, [selection, commit]);

  const transformSelection = useCallback<UseCadModel["transformSelection"]>((dn, de, asCopy) => {
    const sel = selection;
    const items = sel.items && sel.items.length
      ? sel.items
      : sel.type && sel.id
        ? [{ type: sel.type, id: sel.id }]
        : [];
    if (items.length === 0) return 0;
    if (dn === 0 && de === 0 && !asCopy) return 0;

    const ptIds = new Set(items.filter((i) => i.type === "point").map((i) => i.id));
    const lwIds = new Set(items.filter((i) => i.type === "linework").map((i) => i.id));
    const txIds = new Set(items.filter((i) => i.type === "text").map((i) => i.id));
    const arcIds = new Set(items.filter((i) => i.type === "arc").map((i) => i.id));
    const cirIds = new Set(items.filter((i) => i.type === "circle").map((i) => i.id));
    const ellIds = new Set(items.filter((i) => i.type === "ellipse").map((i) => i.id));
    const dimIds = new Set(items.filter((i) => i.type === "dimension").map((i) => i.id));
    const hatchIds = new Set(items.filter((i) => i.type === "hatch").map((i) => i.id));

    const offsetVert = (v: { n: number; e: number }) => ({ n: v.n + dn, e: v.e + de });
    const offsetPos = (p: { n: number; e: number }) => ({ n: p.n + dn, e: p.e + de });

    if (!asCopy) {
      // MOVE — translate the originals in place.
      commit((m) => ({
        ...m,
        points: m.points.map((p) => (ptIds.has(p.id) ? { ...p, ...offsetPos(p) } : p)),
        linework: m.linework.map((l) =>
          lwIds.has(l.id) ? { ...l, vertices: l.vertices.map(offsetVert) } : l,
        ),
        texts: m.texts.map((t) => (txIds.has(t.id) ? { ...t, ...offsetPos(t) } : t)),
        arcs: m.arcs.map((a) => (arcIds.has(a.id) ? { ...a, center: offsetVert(a.center) } : a)),
        circles: m.circles.map((c) => (cirIds.has(c.id) ? { ...c, center: offsetVert(c.center) } : c)),
        ellipses: m.ellipses.map((el) => (ellIds.has(el.id) ? { ...el, center: offsetVert(el.center) } : el)),
        dimensions: m.dimensions.map((d) =>
          dimIds.has(d.id)
            ? { ...d, textPosition: offsetVert(d.textPosition), defPoints: d.defPoints.map(offsetVert) }
            : d,
        ),
        hatches: m.hatches.map((h) =>
          hatchIds.has(h.id)
            ? { ...h, vertices: h.vertices.map(offsetVert), holes: h.holes?.map((hole) => hole.map(offsetVert)) }
            : h,
        ),
      }));
      return items.length;
    }

    // COPY — duplicate the selected objects, offset, and select the copies.
    const newItems: SelectedItem[] = [];
    commit((m) => {
      const newPoints: SurveyPoint[] = [];
      for (const p of m.points) {
        if (!ptIds.has(p.id)) continue;
        const copy: SurveyPoint = { ...p, id: nextId("pt"), ...offsetPos(p) };
        newPoints.push(copy);
        newItems.push({ type: "point", id: copy.id });
      }
      const newLinework: SurveyLinework[] = [];
      for (const l of m.linework) {
        if (!lwIds.has(l.id)) continue;
        const copy: SurveyLinework = { ...l, id: nextId("lw"), vertices: l.vertices.map(offsetVert) };
        newLinework.push(copy);
        newItems.push({ type: "linework", id: copy.id });
      }
      const newTexts: SurveyText[] = [];
      for (const t of m.texts) {
        if (!txIds.has(t.id)) continue;
        const copy: SurveyText = { ...t, id: nextId("tx"), ...offsetPos(t) };
        newTexts.push(copy);
        newItems.push({ type: "text", id: copy.id });
      }
      const newArcs: SurveyArc[] = [];
      for (const a of m.arcs) {
        if (!arcIds.has(a.id)) continue;
        const copy: SurveyArc = { ...a, id: nextId("arc"), center: offsetVert(a.center) };
        newArcs.push(copy);
        newItems.push({ type: "arc", id: copy.id });
      }
      const newCircles: SurveyCircle[] = [];
      for (const c of m.circles) {
        if (!cirIds.has(c.id)) continue;
        const copy: SurveyCircle = { ...c, id: nextId("cir"), center: offsetVert(c.center) };
        newCircles.push(copy);
        newItems.push({ type: "circle", id: copy.id });
      }
      const newEllipses: SurveyEllipse[] = [];
      for (const el of m.ellipses) {
        if (!ellIds.has(el.id)) continue;
        const copy: SurveyEllipse = { ...el, id: nextId("ell"), center: offsetVert(el.center) };
        newEllipses.push(copy);
        newItems.push({ type: "ellipse", id: copy.id });
      }
      const newDimensions: SurveyDimension[] = [];
      for (const d of m.dimensions) {
        if (!dimIds.has(d.id)) continue;
        const copy: SurveyDimension = {
          ...d,
          id: nextId("dim"),
          textPosition: offsetVert(d.textPosition),
          defPoints: d.defPoints.map(offsetVert),
        };
        newDimensions.push(copy);
        newItems.push({ type: "dimension", id: copy.id });
      }
      const newHatches: SurveyHatch[] = [];
      for (const h of m.hatches) {
        if (!hatchIds.has(h.id)) continue;
        const copy: SurveyHatch = {
          ...h,
          id: nextId("hatch"),
          vertices: h.vertices.map(offsetVert),
          holes: h.holes?.map((hole) => hole.map(offsetVert)),
        };
        newHatches.push(copy);
        newItems.push({ type: "hatch", id: copy.id });
      }
      return {
        ...m,
        points: [...m.points, ...newPoints],
        linework: [...m.linework, ...newLinework],
        texts: [...m.texts, ...newTexts],
        arcs: [...m.arcs, ...newArcs],
        circles: [...m.circles, ...newCircles],
        ellipses: [...m.ellipses, ...newEllipses],
        dimensions: [...m.dimensions, ...newDimensions],
        hatches: [...m.hatches, ...newHatches],
      };
    });
    if (newItems.length) {
      const primary = newItems[newItems.length - 1];
      setSelection({ type: primary.type, id: primary.id, items: newItems });
    }
    return newItems.length;
  }, [selection, commit]);

  const mapSelection = useCallback<UseCadModel["mapSelection"]>((fn, asCopy, ops) => {
    const sel = selection;
    const items = sel.items && sel.items.length
      ? sel.items
      : sel.type && sel.id
        ? [{ type: sel.type, id: sel.id }]
        : [];
    if (items.length === 0) return 0;

    const ptIds = new Set(items.filter((i) => i.type === "point").map((i) => i.id));
    const lwIds = new Set(items.filter((i) => i.type === "linework").map((i) => i.id));
    const txIds = new Set(items.filter((i) => i.type === "text").map((i) => i.id));
    const arcIds = new Set(items.filter((i) => i.type === "arc").map((i) => i.id));
    const cirIds = new Set(items.filter((i) => i.type === "circle").map((i) => i.id));
    const ellIds = new Set(items.filter((i) => i.type === "ellipse").map((i) => i.id));
    const dimIds = new Set(items.filter((i) => i.type === "dimension").map((i) => i.id));
    const hatchIds = new Set(items.filter((i) => i.type === "hatch").map((i) => i.id));

    if (!asCopy) {
      commit((m) => ({
        ...m,
        points: m.points.map((p) => (ptIds.has(p.id) ? { ...p, ...fn({ n: p.n, e: p.e }) } : p)),
        linework: m.linework.map((l) =>
          lwIds.has(l.id)
            ? { ...l, vertices: l.vertices.map((v) => fn({ n: v.n, e: v.e })) }
            : l,
        ),
        texts: m.texts.map((t) => (txIds.has(t.id) ? mapTextAttrs({ ...t, ...fn({ n: t.n, e: t.e }) }, ops) : t)),
        arcs: m.arcs.map((a) => (arcIds.has(a.id) ? mapArcAttrs({ ...a, center: fn(a.center) }, ops) : a)),
        circles: m.circles.map((c) => (cirIds.has(c.id) ? mapCircleAttrs({ ...c, center: fn(c.center) }, ops) : c)),
        ellipses: m.ellipses.map((el) => (ellIds.has(el.id) ? mapEllipseAttrs({ ...el, center: fn(el.center) }, ops) : el)),
        dimensions: m.dimensions.map((d) =>
          dimIds.has(d.id)
            ? mapDimensionAttrs({ ...d, textPosition: fn(d.textPosition), defPoints: d.defPoints.map(fn) }, ops)
            : d,
        ),
        hatches: m.hatches.map((h) =>
          hatchIds.has(h.id)
            ? mapHatchAttrs({ ...h, vertices: h.vertices.map(fn), holes: h.holes?.map((hole) => hole.map(fn)) }, ops)
            : h,
        ),
      }));
      return items.length;
    }

    const newItems: SelectedItem[] = [];
    commit((m) => {
      const newPoints: SurveyPoint[] = [];
      for (const p of m.points) {
        if (!ptIds.has(p.id)) continue;
        const pos = fn({ n: p.n, e: p.e });
        const copy: SurveyPoint = { ...p, id: nextId("pt"), n: pos.n, e: pos.e };
        newPoints.push(copy);
        newItems.push({ type: "point", id: copy.id });
      }
      const newLinework: SurveyLinework[] = [];
      for (const l of m.linework) {
        if (!lwIds.has(l.id)) continue;
        newLinework.push({
          ...l,
          id: nextId("lw"),
          vertices: l.vertices.map((v) => fn({ n: v.n, e: v.e })),
        });
        newItems.push({ type: "linework", id: newLinework[newLinework.length - 1].id });
      }
      const newTexts: SurveyText[] = [];
      for (const t of m.texts) {
        if (!txIds.has(t.id)) continue;
        const pos = fn({ n: t.n, e: t.e });
        const copy: SurveyText = mapTextAttrs({ ...t, id: nextId("tx"), n: pos.n, e: pos.e }, ops);
        newTexts.push(copy);
        newItems.push({ type: "text", id: newTexts[newTexts.length - 1].id });
      }
      const newArcs: SurveyArc[] = [];
      for (const a of m.arcs) {
        if (!arcIds.has(a.id)) continue;
        const copy: SurveyArc = mapArcAttrs({ ...a, id: nextId("arc"), center: fn(a.center) }, ops);
        newArcs.push(copy);
        newItems.push({ type: "arc", id: copy.id });
      }
      const newCircles: SurveyCircle[] = [];
      for (const c of m.circles) {
        if (!cirIds.has(c.id)) continue;
        const copy: SurveyCircle = mapCircleAttrs({ ...c, id: nextId("cir"), center: fn(c.center) }, ops);
        newCircles.push(copy);
        newItems.push({ type: "circle", id: copy.id });
      }
      const newEllipses: SurveyEllipse[] = [];
      for (const el of m.ellipses) {
        if (!ellIds.has(el.id)) continue;
        const copy: SurveyEllipse = mapEllipseAttrs({ ...el, id: nextId("ell"), center: fn(el.center) }, ops);
        newEllipses.push(copy);
        newItems.push({ type: "ellipse", id: copy.id });
      }
      const newDimensions: SurveyDimension[] = [];
      for (const d of m.dimensions) {
        if (!dimIds.has(d.id)) continue;
        const copy: SurveyDimension = mapDimensionAttrs({
          ...d,
          id: nextId("dim"),
          textPosition: fn(d.textPosition),
          defPoints: d.defPoints.map(fn),
        }, ops);
        newDimensions.push(copy);
        newItems.push({ type: "dimension", id: copy.id });
      }
      const newHatches: SurveyHatch[] = [];
      for (const h of m.hatches) {
        if (!hatchIds.has(h.id)) continue;
        const copy: SurveyHatch = mapHatchAttrs({
          ...h,
          id: nextId("hatch"),
          vertices: h.vertices.map(fn),
          holes: h.holes?.map((hole) => hole.map(fn)),
        }, ops);
        newHatches.push(copy);
        newItems.push({ type: "hatch", id: copy.id });
      }
      return {
        ...m,
        points: [...m.points, ...newPoints],
        linework: [...m.linework, ...newLinework],
        texts: [...m.texts, ...newTexts],
        arcs: [...m.arcs, ...newArcs],
        circles: [...m.circles, ...newCircles],
        ellipses: [...m.ellipses, ...newEllipses],
        dimensions: [...m.dimensions, ...newDimensions],
        hatches: [...m.hatches, ...newHatches],
      };
    });
    if (newItems.length) {
      const primary = newItems[newItems.length - 1];
      setSelection({ type: primary.type, id: primary.id, items: newItems });
    }
    return newItems.length;
  }, [selection, commit, setSelection]);

  const offsetLinework = useCallback<UseCadModel["offsetLinework"]>((id, distance) => {
    const lw = model.linework.find((l) => l.id === id);
    if (!lw || lw.vertices.length < 2) return null;
    const verts = [...lw.vertices];
    const closed = lw.closed;
    const offsetVerts: { n: number; e: number }[] = [];
    const count = verts.length;

    for (let i = 0; i < count; i++) {
      const prev = verts[(i - 1 + count) % count];
      const curr = verts[i];
      const next = verts[(i + 1) % count];
      const inE = curr.e - prev.e;
      const inN = curr.n - prev.n;
      const outE = next.e - curr.e;
      const outN = next.n - curr.n;
      const inLen = Math.hypot(inE, inN);
      const outLen = Math.hypot(outE, outN);
      if (inLen === 0 || outLen === 0) {
        offsetVerts.push(curr);
        continue;
      }
      const inUE = inE / inLen, inUN = inN / inLen;
      const outUE = outE / outLen, outUN = outN / outLen;
      const inLeftE = -inUN, inLeftN = inUE;
      const outLeftE = -outUN, outLeftN = outUE;
      const a = { e: prev.e + inLeftE * distance, n: prev.n + inLeftN * distance };
      const b1 = { e: curr.e + inLeftE * distance, n: curr.n + inLeftN * distance };
      const b2 = { e: curr.e + outLeftE * distance, n: curr.n + outLeftN * distance };
      const c = { e: next.e + outLeftE * distance, n: next.n + outLeftN * distance };
      const dx1 = b1.e - a.e, dy1 = b1.n - a.n;
      const dx2 = c.e - b2.e, dy2 = c.n - b2.n;
      const denom = dx1 * dy2 - dy1 * dx2;
      if (Math.abs(denom) < 1e-12) {
        offsetVerts.push({ e: b1.e, n: b1.n });
        continue;
      }
      const t = ((b2.e - a.e) * dy2 - (b2.n - a.n) * dx2) / denom;
      offsetVerts.push({ e: a.e + dx1 * t, n: a.n + dy1 * t });
    }

    if (!closed) {
      const start = verts[0];
      const second = verts[1];
      const se = second.e - start.e, sn = second.n - start.n;
      const sLen = Math.hypot(se, sn);
      if (sLen > 0) {
        offsetVerts[0] = {
          e: start.e - (sn / sLen) * distance,
          n: start.n + (se / sLen) * distance,
        };
      }
      const last = verts[count - 1];
      const prev = verts[count - 2];
      const le = last.e - prev.e, ln = last.n - prev.n;
      const lLen = Math.hypot(le, ln);
      if (lLen > 0) {
        offsetVerts[count - 1] = {
          e: last.e - (ln / lLen) * distance,
          n: last.n + (le / lLen) * distance,
        };
      }
    }

    const copy: SurveyLinework = { ...lw, id: nextId("lw"), vertices: offsetVerts };
    // NOTE: there is no `selection` field on CadModelState — adding one here
    // would persist junk into the model JSON. The caller selects the copy.
    commit((m) => ({
      ...m,
      linework: [...m.linework, copy],
    }));
    return copy;
  }, [model.linework, commit]);

  const clearAll = useCallback(() => {
    commit((m) => ({
      ...m,
      points: [],
      linework: [],
      texts: [],
      surfaces: [],
      arcs: [],
      circles: [],
      ellipses: [],
      dimensions: [],
      hatches: [],
    }));
    setSelection(EMPTY_SELECTION);
  }, [commit]);

  // ── Undo / redo ─────────────────────────────────────────────────────────
  const undo = useCallback<UseCadModel["undo"]>(() => {
    const prevModel = applyUndo(histRef.current, modelRef.current);
    if (prevModel === null) return false;
    modelRef.current = prevModel;
    setModel(prevModel);
    setSelection(EMPTY_SELECTION);
    syncHistoryFlags();
    return true;
  }, [syncHistoryFlags]);

  const redo = useCallback<UseCadModel["redo"]>(() => {
    const nextModel = applyRedo(histRef.current, modelRef.current);
    if (nextModel === null) return false;
    modelRef.current = nextModel;
    setModel(nextModel);
    setSelection(EMPTY_SELECTION);
    syncHistoryFlags();
    return true;
  }, [syncHistoryFlags]);

  return useMemo(
    () => ({
      model,
      selection,
      setSelection,
      setActiveLayer,
      addPoint,
      updatePoint,
      deletePoint,
      addLinework,
      updateLinework,
      deleteLinework,
      addText,
      updateText,
      deleteText,
      addSurface,
      updateSurface,
      deleteSurface,
      toggleSurfaceVisible,
      addArc,
      updateArc,
      deleteArc,
      addCircle,
      updateCircle,
      deleteCircle,
      addEllipse,
      updateEllipse,
      deleteEllipse,
      addDimension,
      updateDimension,
      deleteDimension,
      addHatch,
      updateHatch,
      deleteHatch,
      toggleLayerVisible,
      toggleLayerLocked,
      addLayer,
      ensureLayerById,
      updateLayer,
      deleteLayer,
      layerEntityCount,
      importPoints,
      setColorOfSelection,
      transformSelection,
      mapSelection,
      offsetLinework,
      clearAll,
      undo,
      redo,
      canUndo,
      canRedo,
      beginTransaction,
      endTransaction,
      discardTransaction,
      nextPointNo,
      layerById,
      syncStatus,
      syncError,
    }),
    [
      model,
      selection,
      syncStatus,
      syncError,
      canUndo,
      canRedo,
      beginTransaction,
      endTransaction,
      discardTransaction,
      setActiveLayer,
      addPoint,
      updatePoint,
      deletePoint,
      addLinework,
      updateLinework,
      deleteLinework,
      addText,
      updateText,
      deleteText,
      addSurface,
      updateSurface,
      deleteSurface,
      toggleSurfaceVisible,
      addArc,
      updateArc,
      deleteArc,
      addCircle,
      updateCircle,
      deleteCircle,
      addEllipse,
      updateEllipse,
      deleteEllipse,
      addDimension,
      updateDimension,
      deleteDimension,
      addHatch,
      updateHatch,
      deleteHatch,
      toggleLayerVisible,
      toggleLayerLocked,
      addLayer,
      ensureLayerById,
      updateLayer,
      deleteLayer,
      layerEntityCount,
      importPoints,
      setColorOfSelection,
      transformSelection,
      mapSelection,
      offsetLinework,
      clearAll,
      undo,
      redo,
      nextPointNo,
      layerById,
    ],
  );
}
