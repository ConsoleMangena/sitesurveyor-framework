import type { WorkspaceView } from "../workspace/types.ts";

export type ExtensionCategory = "intelligence" | "operations" | "market";

export interface ExtensionCapability {
  label: string;
  detail: string;
}

/**
 * What the platform knows about an extension before it is installed.
 *
 * Manifests live in code (see `registry.ts`) because an extension's UI is
 * compiled into this bundle: a manifest describes a contribution that already
 * exists, so the dashboard can never advertise an extension that cannot run.
 */
export interface ExtensionManifest {
  id: string;
  name: string;
  tagline: string;
  description: string;
  version: string;
  publisher: string;
  category: ExtensionCategory;
  /** Key resolved by `getNavIcon`, so the sidebar and palette match. */
  icon: string;
  capabilities: ExtensionCapability[];
  /** Nav entry and page the extension contributes while it is enabled. */
  contributes?: {
    view: WorkspaceView;
    label: string;
    icon: string;
    group: string;
    description: string;
  };
  /**
   * Runtime the extension calls. Absent means the extension is self-contained
   * and needs no operator configuration.
   */
  endpoint?: {
    label: string;
    placeholder: string;
    hint: string;
    /** Build-time default from `import.meta.env`, used until an override is saved. */
    defaultUrl?: string;
  };
  /** Present on every extension so a reader can go inspect what it actually does. */
  sourceUrl?: string;
  installedByDefault: boolean;
  enabledByDefault: boolean;
}

/** Per-workspace choice about one extension. */
export interface ExtensionState {
  installed: boolean;
  enabled: boolean;
  /** Runtime URL override; empty means fall back to the manifest default. */
  endpoint: string;
}

/**
 * Where install state lives. The database scopes an extension to a workspace so
 * a whole team sees one answer; a browser fallback keeps the feature usable on
 * a project that has not had the migration pushed yet.
 */
export type ExtensionStorage = "database" | "browser";

export interface ExtensionEntry {
  manifest: ExtensionManifest;
  state: ExtensionState;
  /** Effective runtime URL: saved override, then build default, then nothing. */
  endpoint: string;
  usesDefaultEndpoint: boolean;
}

export function resolveEndpoint(
  manifest: ExtensionManifest,
  state: ExtensionState,
): string {
  const saved = state.endpoint.trim();
  if (saved) return saved.replace(/\/+$/, "");
  return (manifest.endpoint?.defaultUrl ?? "").trim().replace(/\/+$/, "");
}

export function defaultStateFor(manifest: ExtensionManifest): ExtensionState {
  return {
    installed: manifest.installedByDefault,
    enabled: manifest.enabledByDefault,
    endpoint: "",
  };
}
