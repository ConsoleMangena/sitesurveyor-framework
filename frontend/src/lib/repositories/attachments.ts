import { getCurrentUser } from "../auth/session.ts";
import { supabase } from "../supabase/client.ts";
import type { Json, Tables, TablesInsert } from "../supabase/types.ts";

export type AttachmentRow = Tables<"attachments">;
export type AttachmentInsert = TablesInsert<"attachments">;
export type StorageTier = AttachmentRow["storage_tier"];
export type ChainStatus = AttachmentRow["chain_status"];
export type FolderRow = Tables<"folders">;
export type FolderInsert = TablesInsert<"folders">;
export type TagRow = Tables<"tags">;
export type TagInsert = TablesInsert<"tags">;

/** Lowercase hex SHA-256 of a file's bytes, used as the on-chain anchor. */
export async function hashFile(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface ListAttachmentsOptions {
  folderId?: string | null;
  includeDeleted?: boolean;
  /** Filter to files linked to a specific table/record, e.g. entityTable="projects" and entityId=projectId. */
  entityTable?: string | null;
  entityId?: string | null;
}

export async function listAttachments(
  workspaceId: string,
  options: ListAttachmentsOptions = {},
): Promise<AttachmentRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  let query = supabase
    .from("attachments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (options.folderId === undefined || options.folderId === null) {
    query = query.is("folder_id", null);
  } else {
    query = query.eq("folder_id", options.folderId);
  }

  if (options.entityTable) {
    query = query.eq("entity_table", options.entityTable);
  }

  if (options.entityId) {
    query = query.eq("entity_id", options.entityId);
  }

  if (!options.includeDeleted) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createAttachment(
  workspaceId: string,
  input: Omit<AttachmentInsert, "workspace_id" | "uploaded_by">,
): Promise<AttachmentRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to upload a file.");

  const { data, error } = await supabase
    .from("attachments")
    .insert({ ...input, workspace_id: workspaceId, uploaded_by: user.id })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAttachment(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to delete a file.");

  const { error } = await supabase
    .from("attachments")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

/** Soft-delete an attachment so it can be restored from trash. */
export async function softDeleteAttachment(
  attachment: Pick<AttachmentRow, "id" | "workspace_id" | "storage_path">,
): Promise<AttachmentRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to delete a file.");

  const { data, error } = await supabase
    .from("attachments")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    })
    .eq("id", attachment.id)
    .eq("workspace_id", attachment.workspace_id)
    .select("*")
    .single();

  if (error) throw error;
  await logActivity(attachment.workspace_id, "attachments", attachment.id, "attachment_deleted", {
    name: attachment.storage_path.split("/").pop() ?? "",
  });
  return data;
}

/** Restore a soft-deleted attachment from trash. */
export async function restoreAttachment(
  attachment: Pick<AttachmentRow, "id" | "workspace_id" | "storage_path">,
): Promise<AttachmentRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to restore a file.");

  const { data, error } = await supabase
    .from("attachments")
    .update({
      deleted_at: null,
      deleted_by: null,
    })
    .eq("id", attachment.id)
    .eq("workspace_id", attachment.workspace_id)
    .select("*")
    .single();

  if (error) throw error;
  await logActivity(attachment.workspace_id, "attachments", attachment.id, "attachment_restored", {
    name: attachment.storage_path.split("/").pop() ?? "",
  });
  return data;
}

/** Permanently delete an attachment and its storage object. Use after soft-delete. */
export async function permanentDeleteAttachment(
  attachment: Pick<AttachmentRow, "id" | "workspace_id" | "bucket_name" | "storage_path">,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to delete a file.");

  const { error: objectError } = await supabase.storage
    .from(attachment.bucket_name)
    .remove([attachment.storage_path]);

  if (objectError) throw objectError;

  const { error } = await supabase
    .from("attachments")
    .delete()
    .eq("id", attachment.id)
    .eq("workspace_id", attachment.workspace_id);

  if (error) throw error;
  await logActivity(attachment.workspace_id, "attachments", attachment.id, "attachment_permanently_deleted", {
    name: attachment.storage_path.split("/").pop() ?? "",
  });
}

const sanitizeFileName = (name: string): string =>
  name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120) || "file";

export async function uploadWorkspaceAttachment(
  workspaceId: string,
  file: File,
  options: {
    bucketName?: "workspace-private" | "workspace-public";
    /**
     * "on_chain" computes the file hash now and marks the anchor as `pending`,
     * so the caller can submit the Solana anchor transaction afterwards.
     * "off_chain" (default) keeps the file in Supabase Storage only.
     */
    storageTier?: StorageTier;
    folderId?: string | null;
    tagIds?: string[];
    /** Link the attachment to a specific record, e.g. entityTable="projects" and entityId=projectId. */
    entityTable?: string | null;
    entityId?: string | null;
  } = {},
): Promise<AttachmentRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to upload a file.");

  const bucketName = options.bucketName ?? "workspace-private";
  const storageTier: StorageTier = options.storageTier ?? "off_chain";

  const fileName = sanitizeFileName(file.name);
  const storagePath = `${workspaceId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${fileName}`;

  // Always compute the content hash so any file can be verified or anchored
  // later, even if it was first stored off-chain.
  const contentHash = await hashFile(file);

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) throw uploadError;

  try {
    const attachment = await createAttachment(workspaceId, {
      entity_table: options.entityTable ?? "workspaces",
      entity_id: options.entityId ?? workspaceId,
      bucket_name: bucketName,
      storage_path: storagePath,
      visibility: bucketName === "workspace-public" ? "public" : "private",
      mime_type: file.type || null,
      size_bytes: file.size,
      content_hash: contentHash,
      storage_tier: storageTier,
      chain_status: storageTier === "on_chain" ? "pending" : "none",
      folder_id: options.folderId ?? null,
    });

    if (options.tagIds && options.tagIds.length > 0) {
      await setAttachmentTags(attachment.id, options.tagIds);
    }

    await logActivity(workspaceId, "attachments", attachment.id, "attachment_uploaded", {
      name: fileName,
      size_bytes: file.size,
      storage_tier: storageTier,
    });

    return attachment;
  } catch (error) {
    await supabase.storage.from(bucketName).remove([storagePath]);
    throw error;
  }
}

/**
 * Record the result of anchoring a file's content hash on Solana. The actual
 * transaction is signed and submitted by the user's wallet (which also pays the
 * network gas fee); this persists the confirmed signature against the file.
 */
export async function recordAttachmentAnchor(
  id: string,
  input: { txSignature: string; network: string; programAddress?: string },
): Promise<AttachmentRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to anchor a file.");

  const { data, error } = await supabase
    .from("attachments")
    .update({
      storage_tier: "on_chain",
      chain_status: "anchored",
      chain_tx_signature: input.txSignature,
      chain_network: input.network,
      chain_program_address: input.programAddress ?? null,
      anchored_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Verify that an off-chain object still matches the hash recorded for it. A
 * mismatch means the stored file was altered since it was last hashed/anchored.
 */
export async function verifyAttachmentIntegrity(
  attachment: Pick<
    AttachmentRow,
    "bucket_name" | "storage_path" | "visibility" | "content_hash"
  >,
): Promise<{ ok: boolean; expected: string | null; actual: string }> {
  const url = await getAttachmentAccessUrl(attachment);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not download the file to verify it.");
  const blob = await res.blob();
  const actual = await hashFile(blob);
  return { ok: actual === attachment.content_hash, expected: attachment.content_hash, actual };
}

export async function getAttachmentAccessUrl(
  attachment: Pick<AttachmentRow, "bucket_name" | "storage_path" | "visibility">,
  expiresInSeconds = 60 * 60,
): Promise<string> {
  if (attachment.visibility === "public") {
    const { data } = supabase.storage
      .from(attachment.bucket_name)
      .getPublicUrl(attachment.storage_path);
    return data.publicUrl;
  }

  const { data, error } = await supabase.storage
    .from(attachment.bucket_name)
    .createSignedUrl(attachment.storage_path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to generate file access URL.");
  }

  return data.signedUrl;
}

export async function deleteAttachmentWithObject(
  attachment: Pick<AttachmentRow, "id" | "bucket_name" | "storage_path">,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to delete a file.");

  const { error: objectError } = await supabase.storage
    .from(attachment.bucket_name)
    .remove([attachment.storage_path]);

  if (objectError) throw objectError;

  await deleteAttachment(attachment.id);
}

/** Move attachments into a different folder. Pass null to move to root. */
export async function moveAttachmentsToFolder(
  workspaceId: string,
  attachmentIds: string[],
  folderId: string | null,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to move files.");

  const { error } = await supabase
    .from("attachments")
    .update({ folder_id: folderId })
    .eq("workspace_id", workspaceId)
    .in("id", attachmentIds);

  if (error) throw error;
  await logActivity(workspaceId, "attachments", attachmentIds[0] ?? null, "attachment_moved", {
    count: attachmentIds.length,
    folder_id: folderId,
  });
}

/** Rename a file by moving its storage object to a new path and updating the record. */
export async function renameAttachment(
  attachment: Pick<
    AttachmentRow,
    "id" | "workspace_id" | "bucket_name" | "storage_path"
  >,
  newFileName: string,
): Promise<AttachmentRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to rename a file.");

  const cleanName = newFileName.trim().replace(/[\\/]/g, "");
  if (!cleanName) throw new Error("File name cannot be empty.");

  const lastSlash = attachment.storage_path.lastIndexOf("/");
  const prefix = lastSlash >= 0 ? attachment.storage_path.slice(0, lastSlash + 1) : "";
  const oldPath = attachment.storage_path;
  const newPath = `${prefix}${cleanName}`;
  if (newPath === oldPath) {
    throw new Error("New name must be different from the current name.");
  }

  const { error: moveError } = await supabase.storage
    .from(attachment.bucket_name)
    .move(oldPath, newPath);
  if (moveError) throw moveError;

  const { data, error } = await supabase
    .from("attachments")
    .update({ storage_path: newPath })
    .eq("id", attachment.id)
    .eq("workspace_id", attachment.workspace_id)
    .select("*")
    .single();

  if (error) throw error;

  await logActivity(attachment.workspace_id, "attachments", attachment.id, "attachment_renamed", {
    old_name: oldPath.split("/").pop() ?? "",
    new_name: cleanName,
  });

  return data;
}

export type AttachmentVersionRow = Tables<"attachment_versions">;

export async function listAttachmentVersions(
  attachmentId: string,
): Promise<AttachmentVersionRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("attachment_versions")
    .select("*")
    .eq("attachment_id", attachmentId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createAttachmentVersion(
  attachment: Pick<
    AttachmentRow,
    | "id"
    | "workspace_id"
    | "bucket_name"
    | "storage_path"
    | "content_hash"
    | "size_bytes"
    | "mime_type"
  >,
  file: File,
): Promise<AttachmentRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to upload a file version.");
  if (!file.size) throw new Error("File is empty.");

  const fileName = sanitizeFileName(file.name);
  const versionPath = `${attachment.workspace_id}/versions/${attachment.id}/${Date.now()}-${fileName}`;
  const contentHash = await hashFile(file);

  const { error: copyError } = await supabase.storage
    .from(attachment.bucket_name)
    .copy(attachment.storage_path, versionPath);
  if (copyError) throw copyError;

  const { error: uploadError } = await supabase.storage
    .from(attachment.bucket_name)
    .upload(attachment.storage_path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
  if (uploadError) throw uploadError;

  const { error: versionInsertError } = await supabase.from("attachment_versions").insert({
    workspace_id: attachment.workspace_id,
    attachment_id: attachment.id,
    storage_path: versionPath,
    content_hash: attachment.content_hash,
    size_bytes: attachment.size_bytes,
    created_by: user.id,
  });
  if (versionInsertError) throw versionInsertError;

  const { data, error } = await supabase
    .from("attachments")
    .update({
      content_hash: contentHash,
      size_bytes: file.size,
      mime_type: file.type || attachment.mime_type,
      chain_status: "none",
      chain_tx_signature: null,
      chain_program_address: null,
      anchored_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attachment.id)
    .eq("workspace_id", attachment.workspace_id)
    .select("*")
    .single();

  if (error) throw error;

  await logActivity(attachment.workspace_id, "attachments", attachment.id, "attachment_version_created", {
    version_path: versionPath,
    new_size: file.size,
  });

  return data;
}

export async function getAttachmentVersionAccessUrl(
  version: Pick<AttachmentVersionRow, "storage_path">,
  attachment: Pick<AttachmentRow, "bucket_name" | "visibility">,
  expiresInSeconds = 60 * 60,
): Promise<string> {
  if (attachment.visibility === "public") {
    const { data } = supabase.storage
      .from(attachment.bucket_name)
      .getPublicUrl(version.storage_path);
    return data.publicUrl;
  }

  const { data, error } = await supabase.storage
    .from(attachment.bucket_name)
    .createSignedUrl(version.storage_path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to generate version access URL.");
  }

  return data.signedUrl;
}

// ════════════════════════════════════════════
// Folders
// ════════════════════════════════════════════

export async function listFolders(workspaceId: string, parentId?: string | null): Promise<FolderRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  let query = supabase
    .from("folders")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (parentId === undefined || parentId === null) {
    query = query.is("parent_id", null);
  } else {
    query = query.eq("parent_id", parentId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createFolder(
  workspaceId: string,
  name: string,
  parentId?: string | null,
): Promise<FolderRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to create a folder.");

  const { data, error } = await supabase
    .from("folders")
    .insert({
      workspace_id: workspaceId,
      parent_id: parentId ?? null,
      name,
      path: "",
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) throw error;
  await logActivity(workspaceId, "folders", data.id, "folder_created", { name, parent_id: parentId ?? null });
  return data;
}

export async function updateFolder(
  folderId: string,
  updates: Pick<FolderInsert, "name" | "parent_id">,
): Promise<FolderRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to update a folder.");

  const { data, error } = await supabase
    .from("folders")
    .update(updates)
    .eq("id", folderId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFolder(folderId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to delete a folder.");

  const { error } = await supabase.from("folders").delete().eq("id", folderId);
  if (error) throw error;
}

// ════════════════════════════════════════════
// Tags
// ════════════════════════════════════════════

export async function listTags(workspaceId: string): Promise<TagRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createTag(workspaceId: string, name: string, color?: string): Promise<TagRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to create a tag.");

  const { data, error } = await supabase
    .from("tags")
    .insert({ workspace_id: workspaceId, name, color: color ?? null })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTag(tagId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to delete a tag.");

  const { error } = await supabase.from("tags").delete().eq("id", tagId);
  if (error) throw error;
}

export async function getAttachmentTags(attachmentId: string): Promise<TagRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("attachment_tags")
    .select("tag_id, tags(*)")
    .eq("attachment_id", attachmentId);

  if (error) throw error;
  // Supabase typed return is loose here; coerce safely.
  return (data ?? []).map((row: unknown) => {
    const typed = row as { tag_id: string; tags: TagRow };
    return typed.tags;
  });
}

export async function setAttachmentTags(attachmentId: string, tagIds: string[]): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to tag files.");

  const unique = Array.from(new Set(tagIds));

  const { error: deleteError } = await supabase
    .from("attachment_tags")
    .delete()
    .eq("attachment_id", attachmentId);

  if (deleteError) throw deleteError;

  if (unique.length === 0) return;

  const { error: insertError } = await supabase
    .from("attachment_tags")
    .insert(unique.map((tagId) => ({ attachment_id: attachmentId, tag_id: tagId })));

  if (insertError) throw insertError;
}

// ════════════════════════════════════════════
// Activity log
// ════════════════════════════════════════════

export interface ActivityLogEntry {
  id: number;
  workspace_id: string;
  actor_user_id: string;
  entity_table: string;
  entity_id: string;
  action: string;
  details: Record<string, Json>;
  created_at: string;
}

export async function logActivity(
  workspaceId: string,
  entityTable: string,
  entityId: string | null,
  action: string,
  details: Record<string, Json> = {},
): Promise<void> {
  const { error } = await supabase.rpc("log_activity", {
    p_workspace_id: workspaceId,
    p_entity_table: entityTable,
    // Explicit NULL (the uuid column is nullable); cast because generated
    // RPC arg types don't model optional/null args without SQL defaults.
    p_entity_id: (entityId ?? null) as string,
    p_action: action,
    p_details: details,
  });

  if (error) throw error;
}

export async function listActivityLog(
  workspaceId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<ActivityLogEntry[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc("list_workspace_activity_log", {
    p_workspace_id: workspaceId,
    p_limit: options.limit ?? 50,
    p_offset: options.offset ?? 0,
  });

  if (error) throw error;
  return (data ?? []) as ActivityLogEntry[];
}

export interface StorageUsage {
  used_bytes: number;
  file_count: number;
  limit_mb: number;
  used_mb: number;
  percent: number;
}

export async function getWorkspaceStorageUsage(
  workspaceId: string,
): Promise<StorageUsage | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("get_workspace_storage_usage", {
    p_workspace_id: workspaceId,
  });

  if (error) throw error;
  const row = data?.[0] as StorageUsage | undefined;
  return row ?? null;
}
