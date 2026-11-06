import { SATELLITE_INTELLIGENCE } from "./engine/manifest.ts";
import type { WorkspaceView } from "../workspace/types.ts";
import type { ExtensionEntry, ExtensionManifest, ExtensionState } from "./types.ts";
import { defaultStateFor, resolveEndpoint } from "./types.ts";

/**
 * Extensions the app ships with.
 *
 * Each entry here is backed by a component that is already compiled into this
 * bundle, so enabling one always produces a working surface. There is no
 * download-and-execute path: an extension that is not in this list cannot
 * appear in the dashboard, which keeps "available" and "usable" the same thing.
 */
export const AVAILABLE_EXTENSIONS: ExtensionManifest[] = [SATELLITE_INTELLIGENCE];

const BY_ID = new Map(AVAILABLE_EXTENSIONS.map((manifest) => [manifest.id, manifest]));

export function getExtension(id: string): ExtensionManifest | undefined {
  return BY_ID.get(id);
}

export function toExtensionEntry(
  manifest: ExtensionManifest,
  state?: Partial<ExtensionState>,
): ExtensionEntry {
  const merged: ExtensionState = { ...defaultStateFor(manifest), ...state };
  return {
    manifest,
    state: merged,
    endpoint: resolveEndpoint(manifest, merged),
    usesDefaultEndpoint: !merged.endpoint.trim(),
  };
}

/** Views an enabled extension contributes to the workspace navigation. */
export function contributedViews(entries: ExtensionEntry[]): WorkspaceView[] {
  return entries
    .filter((entry) => entry.state.installed && entry.state.enabled)
    .flatMap((entry) =>
      entry.manifest.contributes ? [entry.manifest.contributes.view] : [],
    );
}

/** The extension that owns a contributed view, if any. */
export function extensionForView(view: string): ExtensionManifest | undefined {
  return AVAILABLE_EXTENSIONS.find(
    (manifest) => manifest.contributes?.view === view,
  );
}
