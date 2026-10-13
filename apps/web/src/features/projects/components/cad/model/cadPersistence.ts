import { cadStorageKey, emptyModel, type CadModelState } from "../cadModel";

export const SAVE_DEBOUNCE_MS = 1200;
export const CACHE_DEBOUNCE_MS = 600;

export function isCadOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

export function normalizeModel(parsed: Partial<CadModelState> | null | undefined): CadModelState {
  const base = emptyModel();
  if (!parsed || typeof parsed !== "object") return base;
  return {
    layers: Array.isArray(parsed.layers) && parsed.layers.length ? parsed.layers : base.layers,
    points: Array.isArray(parsed.points) ? parsed.points : [],
    linework: Array.isArray(parsed.linework) ? parsed.linework : [],
    texts: Array.isArray(parsed.texts) ? parsed.texts : [],
    surfaces: Array.isArray(parsed.surfaces) ? parsed.surfaces : [],
    arcs: Array.isArray(parsed.arcs) ? parsed.arcs : [],
    circles: Array.isArray(parsed.circles) ? parsed.circles : [],
    ellipses: Array.isArray(parsed.ellipses) ? parsed.ellipses : [],
    dimensions: Array.isArray(parsed.dimensions) ? parsed.dimensions : [],
    hatches: Array.isArray(parsed.hatches) ? parsed.hatches : [],
    activeLayerId: parsed.activeLayerId ?? base.activeLayerId,
  };
}

/** Synchronous load from the offline cache (localStorage). */
export function loadCachedModel(projectId: string): CadModelState {
  try {
    const raw = localStorage.getItem(cadStorageKey(projectId));
    if (!raw) return emptyModel();
    return normalizeModel(JSON.parse(raw) as Partial<CadModelState>);
  } catch {
    return emptyModel();
  }
}

export function cacheModel(projectId: string, model: CadModelState): void {
  try {
    localStorage.setItem(cadStorageKey(projectId), JSON.stringify(model));
  } catch {
    /* storage full or unavailable — non-fatal for a drafting session */
  }
}

/** Debounce scheduler mirroring the two-timer behaviour of useCadModel's persist effect. */
export interface PersistenceDeps {
  projectId: string;
  getCachedModel(): CadModelState;                       // () => modelRef.current
  hydrated(): boolean;
  online(): boolean;
  save(model: CadModelState): Promise<void>;             // already try/catch'd caller
}

export class CadPersistenceScheduler {
  private readonly deps: PersistenceDeps;
  private cacheTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: PersistenceDeps) {
    this.deps = deps;
  }

  /** Call from the model-change effect: restarts cache timer; schedules save only when hydrated+online. */
  onModelChange(): void {
    this.clearTimers();
    this.scheduleCache();
    if (!this.deps.hydrated() || !this.deps.online()) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.deps.save(this.deps.getCachedModel());
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Flush both timers immediately (pagehide/beforeunload/unmount): writes the
   * cache now and, when a save timer WAS pending, invokes save() right away.
   */
  flush(): Promise<void> {
    const hadPendingSave = this.saveTimer !== null;
    this.clearTimers();
    cacheModel(this.deps.projectId, this.deps.getCachedModel());
    if (hadPendingSave && this.deps.hydrated() && this.deps.online()) {
      void this.deps.save(this.deps.getCachedModel());
    }
    return Promise.resolve();
  }

  dispose(): void {
    this.clearTimers();
  }

  private scheduleCache(): void {
    this.cacheTimer = setTimeout(() => {
      this.cacheTimer = null;
      cacheModel(this.deps.projectId, this.deps.getCachedModel());
    }, CACHE_DEBOUNCE_MS);
  }

  private clearTimers(): void {
    if (this.cacheTimer !== null) {
      clearTimeout(this.cacheTimer);
      this.cacheTimer = null;
    }
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }
}

/** Generation counter for cross-project loads. */
export class LoadGeneration {
  private current = 0;

  next(): number {
    this.current += 1;
    return this.current;
  }

  isCurrent(g: number): boolean {
    return g === this.current;
  }
}
