/**
 * Hybrid full-file anchoring (ssv2).
 *
 * The bytes never go on-chain. They are split into fixed-size chunks, each chunk
 * is encrypted, hashed and stored privately, and one Memo transaction commits the
 * file digest plus the digest of the chunk manifest. Re-downloading the chunks,
 * decrypting them and rebuilding against that manifest proves the file is still
 * the one the chain committed to.
 *
 * Chunk digests describe the *plaintext* bytes, so the on-chain proof is about the
 * original file; encryption only protects the private copies in storage.
 */

import type { AttachmentRow } from "../../../lib/repositories/attachments.ts";
import {
  markAttachmentAnchorPending,
  saveAttachmentAnchor,
} from "../../../lib/repositories/attachments.ts";
import {
  anchorStoragePrefix,
  createAnchorOperation,
  linkAttachmentAnchor,
  recordAnchorChunk,
  updateAnchorOperation,
  type AnchorOperationRow,
  type AnchorOperationStatus,
} from "../../../lib/repositories/fileAnchors.ts";
import { supabase } from "../../../lib/supabase/client.ts";
import { SOLANA_CLUSTER } from "../lib/config.ts";
import { isUserRejection } from "../lib/provider.ts";
import { getConnection } from "../payments/phantomPay.ts";
import {
  createAnchorKey,
  decryptChunk,
  encryptChunk,
  unlockAnchorKey,
  type WrappedAnchorKey,
} from "./chunkCrypto.ts";
import {
  AnchorCancelledError,
  assertAnchorFeeAffordable,
  buildAnchorTransaction,
  readConfirmedTransaction,
  waitForAnchorConfirmation,
  type AnchorSigner,
  type AnchorTransactionOptions,
} from "./fileAnchor.ts";
import {
  DEFAULT_FULL_FILE_CHUNK_SIZE,
  prepareFullFileAnchor,
  reconstructVerifiedFile,
  type FullFileManifest,
} from "./fullFileAnchor.ts";
import type { Json } from "../../../lib/supabase/types.ts";

type AnchorableFile = Pick<
  AttachmentRow,
  | "id"
  | "workspace_id"
  | "bucket_name"
  | "storage_path"
  | "visibility"
  | "content_hash"
  | "size_bytes"
  | "mime_type"
>;

export interface FullFileAnchorProgress {
  status: AnchorOperationStatus;
  uploadedChunks: number;
  chunkCount: number;
  signature?: string;
}

export interface FullFileAnchorOutcome {
  operationId: string;
  signature: string;
  memo: string;
  fileHash: string;
  manifestHash: string;
  chunkCount: number;
  feeLamports: number;
  network: string;
  anchoredAt: string;
}

export interface RunFullFileAnchorInput {
  attachment: AnchorableFile;
  /** The exact bytes described by the attachment. */
  source: Blob;
  signer: AnchorSigner;
  /**
   * Protects the stored chunk copies. A fresh AES-256 key encrypts every chunk
   * before upload and is itself stored only wrapped under this passphrase, so
   * storage never holds readable file bytes. Losing it costs chunk recovery,
   * not the file itself — the original stays in the workspace.
   */
  anchoringPassphrase: string;
  chunkSize?: number;
  onProgress?: (progress: FullFileAnchorProgress) => void;
  options?: AnchorTransactionOptions;
}

function fileNameOf(attachment: AnchorableFile, source: Blob): string {
  if ("name" in source && typeof source.name === "string" && source.name) return source.name;
  const segments = attachment.storage_path.split("/");
  return segments[segments.length - 1] ?? attachment.id;
}

async function signedObjectUrl(bucketName: string, storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(storagePath, 60 * 60);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? `Could not sign an access URL for ${storagePath}.`);
  }
  return data.signedUrl;
}

/** Download the stored bytes an anchor will commit to, so hashing matches storage. */
export async function downloadAttachmentBlob(attachment: AnchorableFile): Promise<Blob> {
  const url = await signedObjectUrl(attachment.bucket_name, attachment.storage_path);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not download the stored file to anchor it.");
  return response.blob();
}

async function uploadChunk(
  bucketName: string,
  storagePath: string,
  body: Blob,
): Promise<void> {
  const { error } = await supabase.storage
    .from(bucketName)
    .upload(storagePath, body, {
      upsert: true,
      contentType: "application/octet-stream",
    });
  if (error) throw new Error(`Chunk upload failed: ${error.message}`);
}

/**
 * Anchor one file with the v2 hybrid flow. Any failure after the operation row
 * exists is recorded against it, so the UI can show exactly which stage stopped
 * and offer a safe retry.
 */
export async function runFullFileAnchor(
  input: RunFullFileAnchorInput,
): Promise<FullFileAnchorOutcome> {
  const wallet = input.signer.publicKey;
  if (!wallet) throw new Error("Connect a Solana wallet before anchoring a file.");
  if (!input.anchoringPassphrase) {
    throw new Error("Choose an anchoring passphrase so the stored chunks are encrypted.");
  }

  const connection = input.options?.connection ?? getConnection();
  const bucketName = input.attachment.bucket_name;
  const fileName = fileNameOf(input.attachment, input.source);
  const fileSizeBytes = input.source.size;

  // Derived before the operation row exists: a browser without WebCrypto, or a
  // passphrase too short to accept, must not leave a doomed record behind.
  const anchorKey = await createAnchorKey(input.anchoringPassphrase);

  const operation = await createAnchorOperation({
    workspaceId: input.attachment.workspace_id,
    attachmentId: input.attachment.id,
    mode: "full_file",
    bucketName,
    network: SOLANA_CLUSTER,
    fileName,
    fileSizeBytes,
    mimeType: input.attachment.mime_type || input.source.type || null,
    chunkSize: input.chunkSize ?? DEFAULT_FULL_FILE_CHUNK_SIZE,
    fileHash: input.attachment.content_hash,
  });

  const report = (progress: FullFileAnchorProgress) => input.onProgress?.(progress);
  const prefix = anchorStoragePrefix(input.attachment.workspace_id, operation.id);

  try {
    const prepared = await prepareFullFileAnchor(input.source, {
      attachmentId: input.attachment.id,
      fileName,
      chunkSize: input.chunkSize ?? DEFAULT_FULL_FILE_CHUNK_SIZE,
    });

    await updateAnchorOperation(operation.id, {
      status: "uploading",
      chunk_count: prepared.chunks.length,
      chunk_size: prepared.manifest.chunkSize,
      file_hash: prepared.fileHash,
      manifest_hash: prepared.manifestHash,
      manifest: prepared.manifest as unknown as Json,
      memo: prepared.memo,
      encryption: anchorKey.wrapped as unknown as Json,
    });
    report({ status: "uploading", uploadedChunks: 0, chunkCount: prepared.chunks.length });

    for (let index = 0; index < prepared.chunks.length; index += 1) {
      const chunk = prepared.chunks[index];
      const manifestEntry = prepared.manifest.chunks[index];
      const storagePath = `${prefix}/chunk-${String(index).padStart(6, "0")}`;
      await uploadChunk(bucketName, storagePath, await encryptChunk(anchorKey.key, chunk));
      await recordAnchorChunk({
        operationId: operation.id,
        workspaceId: input.attachment.workspace_id,
        chunkIndex: index,
        bucketName,
        storagePath,
        sizeBytes: manifestEntry.size,
        contentHash: manifestEntry.hash,
      });
      await updateAnchorOperation(operation.id, { uploaded_chunks: index + 1 });
      report({ status: "uploading", uploadedChunks: index + 1, chunkCount: prepared.chunks.length });
    }

    const manifestPath = `${prefix}/manifest.json`;
    const encryptedManifest = await encryptChunk(
      anchorKey.key,
      new Blob([prepared.manifestJson], { type: "application/json" }),
    );
    const { error: manifestError } = await supabase.storage
      .from(bucketName)
      .upload(manifestPath, encryptedManifest, {
        upsert: true,
        contentType: "application/octet-stream",
      });
    if (manifestError) throw new Error(`Manifest upload failed: ${manifestError.message}`);

    await updateAnchorOperation(operation.id, {
      status: "ready",
      manifest_storage_path: manifestPath,
      uploaded_chunks: prepared.chunks.length,
    });
    report({ status: "ready", uploadedChunks: prepared.chunks.length, chunkCount: prepared.chunks.length });

    // The connected wallet pays the network fee; internal credit balances are
    // never touched by anchoring.
    const feeLamports = await assertAnchorFeeAffordable(prepared.memo, wallet, connection);

    await updateAnchorOperation(operation.id, {
      status: "submitting",
      wallet_address: wallet.toBase58(),
      fee_lamports: feeLamports,
    });

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    let signature: string;
    try {
      signature = await input.signer.sendTransaction(
        buildAnchorTransaction(prepared.memo, wallet, blockhash),
        connection,
      );
    } catch (err) {
      if (isUserRejection(err)) throw new AnchorCancelledError("Anchor cancelled in wallet.");
      throw err instanceof Error ? err : new Error(String(err));
    }

    await updateAnchorOperation(operation.id, { status: "submitted", tx_signature: signature });
    await markAttachmentAnchorPending(input.attachment, {
      signature,
      network: SOLANA_CLUSTER,
    });
    report({ status: "submitted", uploadedChunks: prepared.chunks.length, chunkCount: prepared.chunks.length, signature });

    await updateAnchorOperation(operation.id, { status: "confirming" });
    try {
      await waitForAnchorConfirmation(signature, { ...input.options, connection });
    } catch (err) {
      await saveAttachmentAnchor(input.attachment, {
        signature,
        network: SOLANA_CLUSTER,
        status: "failed",
      });
      throw err instanceof Error ? err : new Error(String(err));
    }

    const anchoredAt = new Date().toISOString();
    const confirmed = await readConfirmedTransaction(connection, signature);

    await updateAnchorOperation(operation.id, {
      status: "anchored",
      completed_at: anchoredAt,
      tx_slot: confirmed?.slot ?? null,
      fee_lamports: confirmed?.fee ?? feeLamports,
      error_message: null,
    });
    await saveAttachmentAnchor(input.attachment, {
      signature,
      network: SOLANA_CLUSTER,
      status: "anchored",
      anchoredAt,
    });
    await linkAttachmentAnchor(input.attachment.id, input.attachment.workspace_id, {
      mode: "full_file",
      operationId: operation.id,
      feeLamports: confirmed?.fee ?? feeLamports,
    });

    report({ status: "anchored", uploadedChunks: prepared.chunks.length, chunkCount: prepared.chunks.length, signature });

    return {
      operationId: operation.id,
      signature,
      memo: prepared.memo,
      fileHash: prepared.fileHash,
      manifestHash: prepared.manifestHash,
      chunkCount: prepared.chunks.length,
      feeLamports: confirmed?.fee ?? feeLamports,
      network: SOLANA_CLUSTER,
      anchoredAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateAnchorOperation(operation.id, {
      status: error instanceof AnchorCancelledError ? "cancelled" : "failed",
      error_message: message.slice(0, 500),
      wallet_address: wallet.toBase58(),
    }).catch(() => undefined);
    throw error;
  }
}

export interface FullFileVerification {
  ok: boolean;
  chunkCount: number;
  fileHash: string | null;
  /** False for records anchored before chunk encryption existed. */
  encrypted: boolean;
  errors: string[];
}

/**
 * Rebuild the file from its stored chunks and check every digest against the
 * manifest the chain committed to. Encrypted records need the anchoring
 * passphrase; it is checked against the wrapped key before anything downloads,
 * so a wrong passphrase reads as a key problem rather than corruption.
 */
export async function verifyFullFileAnchor(
  operation: AnchorOperationRow,
  anchoringPassphrase?: string,
): Promise<{ verified: FullFileVerification; blob: Blob | null }> {
  if (operation.mode !== "full_file" || !operation.manifest) {
    throw new Error("This anchor has no stored manifest to verify against.");
  }
  const manifest = operation.manifest as unknown as FullFileManifest;
  const wrapped = operation.encryption as WrappedAnchorKey | null;
  const key = wrapped ? await unlockAnchorKey(anchoringPassphrase ?? "", wrapped) : null;
  const chunks: Blob[] = [];
  const errors: string[] = [];

  for (const entry of manifest.chunks) {
    const storagePath = `${anchorStoragePrefix(operation.workspace_id, operation.id)}/chunk-${String(entry.index).padStart(6, "0")}`;
    try {
      const url = await signedObjectUrl(operation.bucket_name, storagePath);
      const response = await fetch(url);
      if (!response.ok) {
        errors.push(`Chunk ${entry.index} could not be downloaded.`);
        continue;
      }
      const stored = await response.blob();
      chunks.push(key ? await decryptChunk(key, stored) : stored);
    } catch (err) {
      errors.push(`Chunk ${entry.index}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    const blob = await reconstructVerifiedFile(chunks, manifest, operation.file_name);
    await updateAnchorOperation(operation.id, {
      verification_status: "verified",
      verified_at: new Date().toISOString(),
    });
    return {
      verified: {
        ok: true,
        chunkCount: manifest.chunks.length,
        fileHash: manifest.fileHash,
        encrypted: Boolean(key),
        errors,
      },
      blob,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateAnchorOperation(operation.id, {
      verification_status: "mismatch",
      verified_at: new Date().toISOString(),
      error_message: message.slice(0, 500),
    });
    return {
      verified: {
        ok: false,
        chunkCount: manifest.chunks.length,
        fileHash: operation.file_hash,
        encrypted: Boolean(key),
        errors: [...errors, message],
      },
      blob: null,
    };
  }
}
