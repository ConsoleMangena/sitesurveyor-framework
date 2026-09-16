import { useCallback, useMemo, useState } from "react";

export interface ProjectOutput {
  id: string;
  /** Short human-readable label, e.g. "Project Points CSV". */
  label: string;
  /** Optional longer description of what this output contains. */
  description?: string;
  /** MIME type of the saved content. */
  mimeType: string;
  /** Suggested file name when downloading or uploading. */
  fileName: string;
  /** Output payload stored as a UTF-8 string. */
  content: string;
  /** Size in bytes (character count for text content). */
  size: number;
  createdAt: number;
}

export type OutputOrigin =
  | "points-csv"
  | "points-geojson"
  | "points-dxf"
  | "cad-csv"
  | "cad-geojson"
  | "cad-dxf"
  | "calc-result"
  | "report"
  | string;

function storageKey(projectId: string) {
  return `sse:project-outputs:${projectId}`;
}

/**
 * One-time key migration (see projectPoints.migrateProjectPointsKey): move
 * outputs stored under a legacy display id to the stable database id.
 */
export function migrateProjectOutputsKey(
  projectId: string,
  legacyId?: string | null,
): void {
  if (!legacyId || legacyId === projectId) return;
  try {
    const oldKey = storageKey(legacyId);
    const newKey = storageKey(projectId);
    const legacy = localStorage.getItem(oldKey);
    if (legacy != null) {
      if (localStorage.getItem(newKey) == null) {
        localStorage.setItem(newKey, legacy);
      }
      localStorage.removeItem(oldKey);
    }
  } catch {
    // Storage unavailable (private mode) — migration is best-effort.
  }
}

function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "output";
}

export function loadProjectOutputs(projectId: string): ProjectOutput[] {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((o): o is ProjectOutput => (
      o &&
      typeof o.id === "string" &&
      typeof o.label === "string" &&
      typeof o.content === "string" &&
      typeof o.fileName === "string" &&
      typeof o.mimeType === "string" &&
      typeof o.createdAt === "number" &&
      typeof o.size === "number"
    ));
  } catch {
    return [];
  }
}

export function saveProjectOutputs(projectId: string, outputs: ProjectOutput[]) {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(outputs));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function toOutputBlob(output: ProjectOutput): Blob {
  return new Blob([output.content], { type: output.mimeType || "text/plain" });
}

export function outputFile(
  output: Omit<ProjectOutput, "id" | "createdAt" | "size">
): ProjectOutput {
  const content = output.content ?? "";
  return {
    ...output,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    size: new Blob([content]).size,
  };
}

export function addProjectOutput(
  projectId: string,
  draft: Omit<ProjectOutput, "id" | "createdAt" | "size">,
): ProjectOutput {
  const outputs = loadProjectOutputs(projectId);
  const output = outputFile({
    ...draft,
    fileName: sanitizeFileName(draft.fileName),
  });
  saveProjectOutputs(projectId, [output, ...outputs]);
  return output;
}

export function deleteProjectOutput(projectId: string, id: string): boolean {
  const outputs = loadProjectOutputs(projectId);
  const next = outputs.filter((o) => o.id !== id);
  if (next.length === outputs.length) return false;
  saveProjectOutputs(projectId, next);
  return true;
}

export function downloadOutput(output: ProjectOutput) {
  const blob = toOutputBlob(output);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = output.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useProjectOutputs(projectId: string | undefined) {
  const [tick, setTick] = useState(0);

  const outputs = useMemo(
    () => (projectId ? loadProjectOutputs(projectId) : []),
    // tick is a manual refresh pulse; it intentionally does not appear in the compute body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, tick],
  );

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  const add = useCallback(
    (draft: Omit<ProjectOutput, "id" | "createdAt" | "size">) => {
      if (!projectId) return undefined;
      const output = addProjectOutput(projectId, draft);
      refresh();
      return output;
    },
    [projectId, refresh],
  );

  const remove = useCallback(
    (id: string) => {
      if (!projectId) return false;
      const ok = deleteProjectOutput(projectId, id);
      if (ok) refresh();
      return ok;
    },
    [projectId, refresh],
  );

  const sorted = useMemo(
    () => [...outputs].sort((a, b) => b.createdAt - a.createdAt),
    [outputs],
  );

  return { outputs, sorted, refresh, add, remove };
}
