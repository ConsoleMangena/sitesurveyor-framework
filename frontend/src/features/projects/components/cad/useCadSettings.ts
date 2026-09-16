import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  settingsStorageKey,
  type CadSettings,
} from "./cadSettings.ts";

function loadSettings(projectId: string): CadSettings {
  try {
    const raw = localStorage.getItem(settingsStorageKey(projectId));
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw) as Partial<CadSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export interface UseCadSettings {
  settings: CadSettings;
  /** Patch one or more settings fields. */
  update: (patch: Partial<CadSettings>) => void;
  /** Toggle one of the boolean drafting aids (snap/osnap/ortho/grid/3D). */
  toggle: (key: "snap" | "osnap" | "ortho" | "showGrid" | "view3d") => void;
  /** Restore all settings to their defaults. */
  reset: () => void;
}

/**
 * Per-project drafting settings, persisted to localStorage. Settings are a
 * workstation preference (display precision, direction convention, snap), kept
 * separate from the team-shared drawing model.
 */
export function useCadSettings(projectId: string): UseCadSettings {
  const [settings, setSettings] = useState<CadSettings>(() => loadSettings(projectId));

  // Reload when the project changes (adjust-state-during-render pattern).
  const [loadedProject, setLoadedProject] = useState(projectId);
  if (loadedProject !== projectId) {
    setLoadedProject(projectId);
    setSettings(loadSettings(projectId));
  }

  // Persist on change.
  useEffect(() => {
    try {
      localStorage.setItem(settingsStorageKey(projectId), JSON.stringify(settings));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [projectId, settings]);

  const update = useCallback((patch: Partial<CadSettings>) => {
    setSettings((s) => normalizeSettings({ ...s, ...patch }));
  }, []);

  const toggle = useCallback((key: "snap" | "osnap" | "ortho" | "showGrid" | "view3d") => {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  }, []);

  const reset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  return useMemo(() => ({ settings, update, toggle, reset }), [settings, update, toggle, reset]);
}
