import { useSyncExternalStore } from "react";

import {
  isMissingExtensionTable,
  listWorkspaceExtensions,
  saveWorkspaceExtension,
  type ExtensionConfig,
  type WorkspaceExtensionRow,
} from "../../lib/repositories/extensions.ts";
import { AVAILABLE_EXTENSIONS, toExtensionEntry } from "./registry.ts";
import type {
  ExtensionEntry,
  ExtensionState,
  ExtensionStorage,
} from "./types.ts";

/**
 * Which extensions this workspace has switched on.
 *
 * One store shared by every surface that asks (sidebar, dashboards, the
 * Extensions page) so a workspace makes one read and every panel agrees. Only
 * deliberate choices are persisted; an extension with no row falls back to the
 * defaults its manifest declares.
 *
 * State normally lives in `workspace_extensions`, scoped to the workspace so a
 * team sees one navigation. When that table is not in the project yet, the same
 * shape is kept in this browser and the UI says so rather than implying the
 * choice was synced.
 */
export interface ExtensionsSnapshot {
  workspaceId: string;
  status: "idle" | "loading" | "ready" | "error";
  storage: ExtensionStorage;
  overrides: Record<string, Partial<ExtensionState>>;
  /** Shown when the workspace choice could not be read or written. */
  notice: string | null;
  /** Extension whose write is in flight, so its control can hold still. */
  saving: string | null;
}

const STORAGE_PREFIX = "sitesurveyor-extensions";

let snapshot: ExtensionsSnapshot = {
  workspaceId: "",
  status: "idle",
  storage: "browser",
  overrides: {},
  notice: null,
  saving: null,
};

const listeners = new Set<() => void>();

function emit(next: ExtensionsSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ExtensionsSnapshot {
  return snapshot;
}

function localKey(workspaceId: string): string {
  return `${STORAGE_PREFIX}:${workspaceId}`;
}

function readLocal(workspaceId: string): Record<string, Partial<ExtensionState>> {
  try {
    const raw = localStorage.getItem(localKey(workspaceId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, Partial<ExtensionState>> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const state = value as Partial<ExtensionState>;
      if (!state || typeof state !== "object") continue;
      out[id] = {
        ...(typeof state.installed === "boolean" ? { installed: state.installed } : {}),
        ...(typeof state.enabled === "boolean" ? { enabled: state.enabled } : {}),
        ...(typeof state.endpoint === "string" ? { endpoint: state.endpoint } : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeLocal(
  workspaceId: string,
  overrides: Record<string, Partial<ExtensionState>>,
): void {
  try {
    localStorage.setItem(localKey(workspaceId), JSON.stringify(overrides));
  } catch {
    /* a blocked store keeps the workspace usable; changes simply do not survive reload */
  }
}

function fromRows(rows: WorkspaceExtensionRow[]): Record<string, Partial<ExtensionState>> {
  const overrides: Record<string, Partial<ExtensionState>> = {};
  for (const row of rows) {
    const config = (row.config ?? {}) as ExtensionConfig;
    overrides[row.extension_id] = {
      installed: row.installed,
      enabled: row.enabled,
      endpoint: typeof config.endpoint === "string" ? config.endpoint : "",
    };
  }
  return overrides;
}

/**
 * Read the workspace's extension state.
 *
 * Idempotent and safe to call from several panels on the same mount: a repeat
 * for the workspace that is already loaded or loading is ignored, so the
 * dashboard, sidebar and Extensions page cost one request between them.
 */
export async function loadExtensions(workspaceId: string): Promise<void> {
  if (!workspaceId) return;
  if (
    snapshot.workspaceId === workspaceId &&
    (snapshot.status === "loading" || snapshot.status === "ready")
  ) {
    return;
  }

  emit({ ...snapshot, workspaceId, status: "loading", notice: null });

  try {
    const rows = await listWorkspaceExtensions(workspaceId);
    emit({
      ...snapshot,
      workspaceId,
      status: "ready",
      storage: "database",
      overrides: fromRows(rows),
      notice: null,
    });
  } catch (error) {
    const missingTable = isMissingExtensionTable(error);
    emit({
      ...snapshot,
      workspaceId,
      status: "ready",
      storage: "browser",
      overrides: readLocal(workspaceId),
      notice: missingTable
        ? "Extension state is saved in this browser. Push the workspace_extensions migration (npm run db:push) to sync it across the team."
        : `Extension state is saved in this browser: ${(error as Error).message}`,
    });
  }
}

export function retryLoadExtensions(): void {
  const workspaceId = snapshot.workspaceId;
  if (!workspaceId) return;
  emit({ ...snapshot, status: "idle" });
  void loadExtensions(workspaceId);
}

export function useExtensions(): ExtensionsSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Read the store outside React, for the same snapshot a hook would render. */
export function getExtensionsSnapshot(): ExtensionsSnapshot {
  return snapshot;
}

export function entriesFor(state: ExtensionsSnapshot): ExtensionEntry[] {
  return AVAILABLE_EXTENSIONS.map((manifest) =>
    toExtensionEntry(manifest, state.overrides[manifest.id]),
  );
}

export function activeEntries(state: ExtensionsSnapshot): ExtensionEntry[] {
  return entriesFor(state).filter(
    (entry) => entry.state.installed && entry.state.enabled,
  );
}

/**
 * Apply a change, then persist it.
 *
 * The store waits for the write instead of painting it first: an extension that
 * looks enabled but is not recorded would leave a reader staring at a nav entry
 * that disappears on the next reload.
 */
async function persist(
  extensionId: string,
  next: Partial<ExtensionState>,
): Promise<boolean> {
  const { workspaceId, storage, overrides } = snapshot;
  const merged = { ...overrides, [extensionId]: { ...overrides[extensionId], ...next } };
  const state = merged[extensionId];
  emit({ ...snapshot, saving: extensionId, notice: null });

  try {
    if (storage === "database" && workspaceId) {
      const config: ExtensionConfig = state.endpoint ? { endpoint: state.endpoint } : {};
      await saveWorkspaceExtension(workspaceId, extensionId, {
        installed: state.installed ?? true,
        enabled: state.enabled ?? false,
        config,
      });
    } else if (workspaceId) {
      writeLocal(workspaceId, merged);
    }
    emit({ ...snapshot, overrides: merged, saving: null, notice: null });
    return true;
  } catch (error) {
    if (isMissingExtensionTable(error)) {
      // The table vanished mid-session (or the first write proved it is not
      // there): keep the change, keep it locally, and say where it went.
      writeLocal(workspaceId, merged);
      emit({
        ...snapshot,
        storage: "browser",
        overrides: merged,
        saving: null,
        notice: "Extension state is saved in this browser: the workspace_extensions table is not available.",
      });
      return true;
    }
    emit({
      ...snapshot,
      saving: null,
      notice: (error as Error).message ?? "Could not save the extension state.",
    });
    return false;
  }
}

export function setExtensionInstalled(extensionId: string, installed: boolean): Promise<boolean> {
  // Uninstalling switches the extension off as well, so a removed extension can
  // never leave its page in the sidebar.
  return persist(extensionId, installed ? { installed } : { installed: false, enabled: false });
}

export function setExtensionEnabled(extensionId: string, enabled: boolean): Promise<boolean> {
  return persist(extensionId, { enabled });
}

export function setExtensionEndpoint(extensionId: string, endpoint: string): Promise<boolean> {
  return persist(extensionId, { endpoint: endpoint.trim().replace(/\/+$/, "") });
}

export function extensionEntry(
  state: ExtensionsSnapshot,
  extensionId: string,
): ExtensionEntry | undefined {
  return entriesFor(state).find((entry) => entry.manifest.id === extensionId);
}

/** Test seam: lets a suite start from a known store without touching storage. */
export function __resetExtensionsForTests(): void {
  emit({ workspaceId: "", status: "idle", storage: "browser", overrides: {}, notice: null, saving: null });
}
