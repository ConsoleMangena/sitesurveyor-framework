import { getCurrentUser } from "../auth/session.ts";
import { supabase } from "../supabase/client.ts";
import type { Json, Tables } from "../supabase/types.ts";

export type AnchorOperationRow = Tables<"file_anchor_operations">;
export type AnchorChunkRow = Tables<"file_anchor_chunks">;

export type AnchorMode = "hash" | "full_file";

export type AnchorOperationStatus =
  | "preparing"
  | "uploading"
  | "ready"
  | "submitting"
  | "submitted"
  | "confirming"
  | "anchored"
  | "failed"
  | "cancelled";

/** Chunk objects and the manifest live beside the file they describe. */
export function anchorStoragePrefix(workspaceId: string, operationId: string): string {
  return `${workspaceId}/anchors/${operationId}`;
}

export async function createAnchorOperation(input: {
  workspaceId: string;
  attachmentId: string;
  mode: AnchorMode;
  bucketName: string;
  network: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType?: string | null;
  chunkSize?: number | null;
  fileHash?: string | null;
}): Promise<AnchorOperationRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to anchor a file.");

  const { data, error } = await supabase
    .from("file_anchor_operations")
    .insert({
      workspace_id: input.workspaceId,
      attachment_id: input.attachmentId,
      created_by: user.id,
      mode: input.mode,
      bucket_name: input.bucketName,
      network: input.network,
      status: "preparing",
      file_name: input.fileName,
      file_size_bytes: input.fileSizeBytes,
      mime_type: input.mimeType ?? null,
      chunk_size: input.chunkSize ?? null,
      file_hash: input.fileHash ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateAnchorOperation(
  operationId: string,
  patch: Partial<Tables<"file_anchor_operations">>,
): Promise<AnchorOperationRow> {
  const { data, error } = await supabase
    .from("file_anchor_operations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", operationId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function recordAnchorChunk(input: {
  operationId: string;
  workspaceId: string;
  chunkIndex: number;
  bucketName: string;
  storagePath: string;
  sizeBytes: number;
  contentHash: string;
}): Promise<AnchorChunkRow> {
  const { data, error } = await supabase
    .from("file_anchor_chunks")
    .upsert(
      {
        operation_id: input.operationId,
        workspace_id: input.workspaceId,
        chunk_index: input.chunkIndex,
        bucket_name: input.bucketName,
        storage_path: input.storagePath,
        size_bytes: input.sizeBytes,
        content_hash: input.contentHash,
      },
      { onConflict: "operation_id,chunk_index" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function listAnchorChunks(operationId: string): Promise<AnchorChunkRow[]> {
  const { data, error } = await supabase
    .from("file_anchor_chunks")
    .select("*")
    .eq("operation_id", operationId)
    .order("chunk_index", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listAnchorOperations(
  workspaceId: string,
  options: { attachmentId?: string; limit?: number } = {},
): Promise<AnchorOperationRow[]> {
  let query = supabase
    .from("file_anchor_operations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (options.attachmentId) query = query.eq("attachment_id", options.attachmentId);
  const { data, error } = await query.limit(options.limit ?? 50);

  if (error) throw error;
  return data ?? [];
}

export async function getAnchorOperation(
  operationId: string,
): Promise<AnchorOperationRow | null> {
  const { data, error } = await supabase
    .from("file_anchor_operations")
    .select("*")
    .eq("id", operationId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Chain state for a set of files, newest attempt per attachment. */
export async function getLatestAnchorStates(
  workspaceId: string,
  attachmentIds: string[],
): Promise<Map<string, AnchorOperationRow>> {
  if (attachmentIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("file_anchor_operations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("attachment_id", attachmentIds)
    .in("status", ["submitted", "confirming", "anchored", "failed"])
    .order("created_at", { ascending: false });

  if (error) throw error;
  const latest = new Map<string, AnchorOperationRow>();
  for (const row of data ?? []) {
    if (!latest.has(row.attachment_id)) latest.set(row.attachment_id, row);
  }
  return latest;
}

/** Point the attachment row at the anchor record that now proves it. */
export async function linkAttachmentAnchor(
  attachmentId: string,
  workspaceId: string,
  link: { mode: AnchorMode; operationId: string; feeLamports: number | null },
): Promise<void> {
  const { error } = await supabase
    .from("attachments")
    .update({
      anchor_mode: link.mode,
      anchor_operation_id: link.operationId,
      anchor_fee_lamports: link.feeLamports,
    })
    .eq("id", attachmentId)
    .eq("workspace_id", workspaceId);

  if (error) throw error;
}

export async function deleteAnchorOperationDraft(operationId: string): Promise<void> {
  const { error } = await supabase
    .from("file_anchor_operations")
    .delete()
    .eq("id", operationId)
    .eq("status", "preparing");

  if (error) throw error;
}

export async function storeAnchorManifest(input: {
  operationId: string;
  workspaceId: string;
  bucketName: string;
  manifest: Json;
}): Promise<string> {
  const storagePath = `${anchorStoragePrefix(input.workspaceId, input.operationId)}/manifest.json`;
  const { error } = await supabase.storage
    .from(input.bucketName)
    .upload(storagePath, JSON.stringify(input.manifest), {
      upsert: true,
      contentType: "application/json",
    });

  if (error) throw error;
  return storagePath;
}
