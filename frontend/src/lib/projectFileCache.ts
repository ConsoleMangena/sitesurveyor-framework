import type { AttachmentRow } from "./repositories/attachments.ts";

const CACHE_KEY = (projectId: string) => `ss:projectFiles:v1:${projectId}`;

export type ProjectFileSource = "remote" | "local";

export type ProjectFile = AttachmentRow & { source?: ProjectFileSource };

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readProjectFiles(projectId: string | undefined): ProjectFile[] {
  if (!projectId) return [];
  return safeParse(localStorage.getItem(CACHE_KEY(projectId)), []);
}

export function writeProjectFiles(
  projectId: string | undefined,
  files: ProjectFile[],
): void {
  if (!projectId) return;
  try {
    localStorage.setItem(CACHE_KEY(projectId), JSON.stringify(files));
  } catch {
    // Storage full — cache is best-effort.
  }
}

export function isLocalProjectFile(file: ProjectFile): boolean {
  return file.id.startsWith("local-");
}

export function addLocalProjectFile(
  projectId: string | undefined,
  file: File,
): ProjectFile | null {
  if (!projectId) return null;
  const now = new Date().toISOString();
  const localFile: ProjectFile = {
    id: `local-${window.crypto.randomUUID()}`,
    workspace_id: "",
    bucket_name: "workspace-private",
    storage_path: file.name,
    mime_type: file.type || null,
    size_bytes: file.size || null,
    visibility: "private",
    storage_tier: "off_chain",
    chain_status: "none",
    entity_table: "projects",
    entity_id: projectId,
    content_hash: null,
    uploaded_by: null,
    folder_id: null,
    anchored_at: null,
    chain_network: null,
    chain_program_address: null,
    chain_tx_signature: null,
    deleted_at: null,
    deleted_by: null,
    created_at: now,
    updated_at: now,
    source: "local",
  } as ProjectFile;

  const current = readProjectFiles(projectId);
  writeProjectFiles(projectId, [localFile, ...current]);
  return localFile;
}

export function removeLocalProjectFile(
  projectId: string | undefined,
  fileId: string,
): void {
  if (!projectId) return;
  const current = readProjectFiles(projectId);
  writeProjectFiles(
    projectId,
    current.filter((f) => f.id !== fileId),
  );
}

export function mergeProjectFiles(
  cached: ProjectFile[],
  remote: AttachmentRow[],
): ProjectFile[] {
  const locals = cached.filter(isLocalProjectFile);
  return [...locals, ...remote.map((r) => ({ ...r, source: "remote" as const }))];
}
