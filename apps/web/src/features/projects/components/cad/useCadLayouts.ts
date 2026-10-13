import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlotOptions, TitleBlock } from "./io/plot.ts";
import {
  MODEL_TAB,
  addLayout as addLayoutTo,
  defaultLayoutsState,
  deleteLayout as deleteLayoutFrom,
  duplicateLayout as duplicateLayoutIn,
  getLayout,
  layoutsStorageKey,
  normalizeLayoutsState,
  renameLayout as renameLayoutIn,
  setLayoutOptions as setLayoutOptionsIn,
  type ActiveTab,
  type CadLayout,
  type CadLayoutsState,
} from "./cadLayouts.ts";

function load(projectId: string, seed: TitleBlock): CadLayoutsState {
  try {
    const raw = localStorage.getItem(layoutsStorageKey(projectId));
    if (!raw) return defaultLayoutsState(seed);
    return normalizeLayoutsState(JSON.parse(raw) as Partial<CadLayoutsState>, seed);
  } catch {
    return defaultLayoutsState(seed);
  }
}

export interface UseCadLayouts {
  layouts: CadLayout[];
  /** Active tab: MODEL_TAB or a layout id. */
  active: ActiveTab;
  /** Whether the active tab is a paper-space layout (i.e. not Model). */
  inLayout: boolean;
  /** The active layout object, or undefined when on the Model tab. */
  activeLayout: CadLayout | undefined;
  /** Switch the active tab (MODEL_TAB or a layout id). */
  setActive: (tab: ActiveTab) => void;
  /** Create a new layout and make it active. */
  add: () => CadLayout | undefined;
  /** Duplicate a layout and make the copy active. */
  duplicate: (id: string) => void;
  /** Rename a layout. */
  rename: (id: string, name: string) => void;
  /** Delete a layout (falls back to Model if it was active). */
  remove: (id: string) => void;
  /** Persist edited plot options for a layout. */
  updateOptions: (id: string, options: PlotOptions) => void;
}

/**
 * Manages the project's AutoCAD-style layouts (paper-space sheets) and the
 * active Model/Layout tab, persisting to localStorage. The `seed` title block
 * supplies project metadata (name, client, datum) for freshly created layouts.
 */
export function useCadLayouts(projectId: string, seed: TitleBlock): UseCadLayouts {
  const [state, setState] = useState<CadLayoutsState>(() => load(projectId, seed));

  // Reload when the project changes (adjust-state-during-render pattern).
  const [loadedProject, setLoadedProject] = useState(projectId);
  if (loadedProject !== projectId) {
    setLoadedProject(projectId);
    setState(load(projectId, seed));
  }

  useEffect(() => {
    try {
      localStorage.setItem(layoutsStorageKey(projectId), JSON.stringify(state));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [projectId, state]);

  const setActive = useCallback((tab: ActiveTab) => {
    setState((s) => ({ ...s, active: tab }));
  }, []);

  const add = useCallback(() => {
    let created: CadLayout | undefined;
    setState((s) => {
      const next = addLayoutTo(s, seed);
      created = next.layouts[next.layouts.length - 1];
      return next;
    });
    return created;
    // seed is stable enough for our purposes (derived from project metadata).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed.projectName, seed.projectId, seed.client, seed.datum]);

  const duplicate = useCallback((id: string) => {
    setState((s) => duplicateLayoutIn(s, id));
  }, []);

  const rename = useCallback((id: string, name: string) => {
    setState((s) => renameLayoutIn(s, id, name));
  }, []);

  const remove = useCallback((id: string) => {
    setState((s) => deleteLayoutFrom(s, id));
  }, []);

  const updateOptions = useCallback((id: string, options: PlotOptions) => {
    setState((s) => setLayoutOptionsIn(s, id, options));
  }, []);

  const activeLayout = state.active === MODEL_TAB ? undefined : getLayout(state, state.active);
  const inLayout = state.active !== MODEL_TAB && !!activeLayout;

  return useMemo(
    () => ({
      layouts: state.layouts,
      active: state.active,
      inLayout,
      activeLayout,
      setActive,
      add,
      duplicate,
      rename,
      remove,
      updateOptions,
    }),
    [state.layouts, state.active, inLayout, activeLayout, setActive, add, duplicate, rename, remove, updateOptions],
  );
}
