/**
 * AutoCAD-style layouts (paper space).
 *
 * AutoCAD separates the drawing into *model space* (the geometry, drawn at full
 * 1:1 ground size) and one or more *layouts* — named paper-space sheets that
 * present the model at a chosen plot scale on a specific paper size, with a
 * title block and furniture. Each layout is an independent, persistent sheet
 * configuration; switching layout tabs switches the presentation, not the
 * geometry.
 *
 * This module models that registry: a list of named layouts plus the active
 * tab ("Model" or a layout name). Each layout owns its own {@link PlotOptions}
 * (paper, orientation, plot scale, title block, furniture toggles) so the user
 * can keep, for example, an "A1 1:500 Site Plan" and an "A3 1:1000 Locality"
 * sheet side by side, exactly like AutoCAD.
 *
 * Layouts are a per-workstation presentation preference (like drafting
 * settings), so they persist to localStorage keyed by project, separate from
 * the team-shared geometry model.
 */

import type { PlotOptions, TitleBlock } from "./io/plot.ts";
import { DEFAULT_PLOT_OPTIONS } from "./io/plot.ts";

/** A single named paper-space sheet. */
export interface CadLayout {
  /** Stable id (used as React key and for rename-safe references). */
  id: string;
  /** Display name shown on the tab (e.g. "Layout1", "Site Plan A1"). */
  name: string;
  /** The plot/sheet configuration for this layout. */
  options: PlotOptions;
}

/** The "Model" tab is a sentinel — it is not a layout, it is the geometry. */
export const MODEL_TAB = "model" as const;
export type ActiveTab = typeof MODEL_TAB | string; // string = a layout id

export interface CadLayoutsState {
  /** Ordered list of layouts shown as tabs after "Model". */
  layouts: CadLayout[];
  /** Currently active tab: MODEL_TAB or a layout id. */
  active: ActiveTab;
}

export function layoutsStorageKey(projectId: string): string {
  return `sitesurveyorCadLayouts:${projectId}`;
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `lay_${Date.now().toString(36)}_${idCounter}`;
}

/**
 * Build the default two-layout set AutoCAD ships with ("Layout1", "Layout2"),
 * seeded from the supplied title block and drafting preferences.
 */
export function defaultLayouts(seed: TitleBlock): CadLayout[] {
  const base = DEFAULT_PLOT_OPTIONS(seed);
  return [
    { id: newId(), name: "Layout1", options: { ...base, titleBlock: { ...seed } } },
    {
      id: newId(),
      name: "Layout2",
      // A second sheet at a different paper size, mirroring AutoCAD's habit of
      // offering more than one ready-made layout.
      options: { ...base, paper: "A4", titleBlock: { ...seed, sheet: "2 of 2" } },
    },
  ];
}

export function defaultLayoutsState(seed: TitleBlock): CadLayoutsState {
  return { layouts: defaultLayouts(seed), active: MODEL_TAB };
}

/**
 * Coerce a parsed/stored object back into a valid state, dropping anything
 * malformed. Falls back to the defaults when nothing usable is present.
 */
export function normalizeLayoutsState(
  parsed: Partial<CadLayoutsState> | null | undefined,
  seed: TitleBlock,
): CadLayoutsState {
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.layouts)) {
    return defaultLayoutsState(seed);
  }
  const base = DEFAULT_PLOT_OPTIONS(seed);
  const layouts: CadLayout[] = parsed.layouts
    .filter((l): l is CadLayout => !!l && typeof l === "object" && typeof l.name === "string")
    .map((l) => ({
      id: typeof l.id === "string" && l.id ? l.id : newId(),
      name: l.name,
      // Merge stored options over fresh defaults so newly added option fields
      // (added in later versions) get sensible values for old saved layouts.
      options: mergeOptions(base, l.options),
    }));
  if (layouts.length === 0) return defaultLayoutsState(seed);

  const active =
    parsed.active === MODEL_TAB || layouts.some((l) => l.id === parsed.active)
      ? (parsed.active as ActiveTab)
      : MODEL_TAB;
  return { layouts, active };
}

function mergeOptions(base: PlotOptions, stored: Partial<PlotOptions> | undefined): PlotOptions {
  if (!stored || typeof stored !== "object") return { ...base };
  return {
    ...base,
    ...stored,
    titleBlock: { ...base.titleBlock, ...(stored.titleBlock ?? {}) },
  };
}

/** Append a new layout, auto-naming it "Layout N" to avoid collisions. */
export function addLayout(state: CadLayoutsState, seed: TitleBlock): CadLayoutsState {
  const base = DEFAULT_PLOT_OPTIONS(seed);
  const name = nextLayoutName(state.layouts);
  const layout: CadLayout = { id: newId(), name, options: { ...base, titleBlock: { ...seed } } };
  return { layouts: [...state.layouts, layout], active: layout.id };
}

/** Duplicate an existing layout (AutoCAD "Move or Copy ▸ Create a copy"). */
export function duplicateLayout(state: CadLayoutsState, id: string): CadLayoutsState {
  const src = state.layouts.find((l) => l.id === id);
  if (!src) return state;
  const copy: CadLayout = {
    id: newId(),
    name: `${src.name} (copy)`,
    options: { ...src.options, titleBlock: { ...src.options.titleBlock } },
  };
  const idx = state.layouts.findIndex((l) => l.id === id);
  const layouts = [...state.layouts];
  layouts.splice(idx + 1, 0, copy);
  return { layouts, active: copy.id };
}

export function renameLayout(state: CadLayoutsState, id: string, rawName: string): CadLayoutsState {
  const name = rawName.trim();
  if (!name) return state;
  return {
    ...state,
    layouts: state.layouts.map((l) => (l.id === id ? { ...l, name } : l)),
  };
}

/**
 * Delete a layout. AutoCAD forbids deleting the last layout and always keeps
 * Model selectable, so we fall back to the Model tab when needed.
 */
export function deleteLayout(state: CadLayoutsState, id: string): CadLayoutsState {
  const layouts = state.layouts.filter((l) => l.id !== id);
  if (layouts.length === 0) {
    // Keep at least one layout, like AutoCAD.
    return { layouts: state.layouts, active: state.active };
  }
  const active = state.active === id ? MODEL_TAB : state.active;
  return { layouts, active };
}

export function setLayoutOptions(state: CadLayoutsState, id: string, options: PlotOptions): CadLayoutsState {
  return {
    ...state,
    layouts: state.layouts.map((l) => (l.id === id ? { ...l, options } : l)),
  };
}

export function getLayout(state: CadLayoutsState, id: string): CadLayout | undefined {
  return state.layouts.find((l) => l.id === id);
}

function nextLayoutName(layouts: CadLayout[]): string {
  let n = layouts.length + 1;
  const names = new Set(layouts.map((l) => l.name.toLowerCase()));
  while (names.has(`layout${n}`.toLowerCase())) n += 1;
  return `Layout${n}`;
}
