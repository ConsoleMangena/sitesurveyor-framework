export const DEFAULT_FULL_FILE_CHUNK_SIZE = 256 * 1024;
export const SOLANA_MEMO_MAX_BYTES = 566;

// Keeping chunks below 4 GiB also keeps their array buffers within the limits
// of current browser implementations. Larger inputs can still use more chunks.
const MAX_CHUNK_SIZE = 2 ** 32 - 1;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface FullFileChunkManifest {
  index: number;
  size: number;
  hash: string;
}

export interface FullFileManifest {
  version: "ssv2";
  attachmentId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  chunkSize: number;
  chunks: FullFileChunkManifest[];
}

export interface PrepareFullFileAnchorOptions {
  attachmentId: string;
  fileName?: string;
  chunkSize?: number;
}

export interface PreparedFullFileAnchor {
  manifest: FullFileManifest;
  manifestJson: string;
  manifestHash: string;
  fileHash: string;
  chunks: Blob[];
  memo: string;
}

function assertChunkSize(chunkSize: number): void {
  if (
    !Number.isSafeInteger(chunkSize) ||
    chunkSize <= 0 ||
    chunkSize > MAX_CHUNK_SIZE
  ) {
    throw new RangeError(
      `Chunk size must be a positive safe integer no greater than ${MAX_CHUNK_SIZE} bytes.`,
    );
  }
}

function normaliseHash(hash: string, label: string): string {
  const normalised = hash.trim().toLowerCase();
  if (!SHA256_HEX.test(normalised)) {
    throw new Error(`${label} must be a 64-character hexadecimal SHA-256 hash.`);
  }
  return normalised;
}

async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function hashBlob(blob: Blob): Promise<string> {
  return sha256Hex(await blob.arrayBuffer());
}

/**
 * Build the v2 on-chain memo. Digests are canonicalised to lower case so the
 * same manifest always produces exactly the same UTF-8 memo bytes.
 */
export function buildFullFileAnchorMemo(
  attachmentId: string,
  fileHash: string,
  manifestHash: string,
  chunkCount: number,
): string {
  if (!attachmentId.trim()) {
    throw new Error("Attachment id must not be empty.");
  }
  const canonicalFileHash = normaliseHash(fileHash, "File hash");
  const canonicalManifestHash = normaliseHash(manifestHash, "Manifest hash");
  if (!Number.isSafeInteger(chunkCount) || chunkCount <= 0) {
    throw new Error("Chunk count must be a positive safe integer.");
  }

  const memo = `ssv2:${attachmentId}:sha256:${canonicalFileHash}:${canonicalManifestHash}:${chunkCount}`;
  if (new TextEncoder().encode(memo).byteLength > SOLANA_MEMO_MAX_BYTES) {
    throw new Error(
      `Full-file anchor memo exceeds Solana's ${SOLANA_MEMO_MAX_BYTES}-byte UTF-8 limit.`,
    );
  }
  return memo;
}

function defaultFileName(blob: Blob): string {
  if ("name" in blob && typeof blob.name === "string") return blob.name;
  return "blob";
}

function assertManifest(manifest: FullFileManifest): void {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("A full-file manifest is required.");
  }
  if (manifest.version !== "ssv2") {
    throw new Error("Unsupported full-file manifest version.");
  }
  if (typeof manifest.attachmentId !== "string" || !manifest.attachmentId.trim()) {
    throw new Error("Manifest attachment id must not be empty.");
  }
  if (typeof manifest.fileName !== "string" || typeof manifest.mimeType !== "string") {
    throw new Error("Manifest file name and MIME type must be strings.");
  }
  if (!Number.isSafeInteger(manifest.fileSize) || manifest.fileSize <= 0) {
    throw new Error("Manifest file size must be a positive safe integer.");
  }
  if (!SHA256_HEX.test(manifest.fileHash)) {
    throw new Error("Manifest file hash must be lower-case SHA-256 hex.");
  }
  assertChunkSize(manifest.chunkSize);
  if (!Array.isArray(manifest.chunks)) {
    throw new Error("Manifest chunks must be an array.");
  }

  const expectedCount = Math.ceil(manifest.fileSize / manifest.chunkSize);
  if (manifest.chunks.length !== expectedCount) {
    throw new Error(
      `Manifest chunk count mismatch: expected ${expectedCount}, received ${manifest.chunks.length}.`,
    );
  }

  let offset = 0;
  for (let index = 0; index < manifest.chunks.length; index += 1) {
    const chunk = manifest.chunks[index];
    if (!chunk || chunk.index !== index) {
      throw new Error(`Manifest chunk order mismatch at index ${index}.`);
    }
    const expectedSize = Math.min(manifest.chunkSize, manifest.fileSize - offset);
    if (chunk.size !== expectedSize) {
      throw new Error(
        `Manifest chunk size mismatch at index ${index}: expected ${expectedSize}, received ${chunk.size}.`,
      );
    }
    if (!SHA256_HEX.test(chunk.hash)) {
      throw new Error(`Manifest chunk hash at index ${index} must be lower-case SHA-256 hex.`);
    }
    offset += chunk.size;
  }

  if (offset !== manifest.fileSize) {
    throw new Error("Manifest chunk sizes do not add up to the file size.");
  }
}

/**
 * Reassemble chunks in their manifest order, rejecting missing, reordered,
 * truncated or modified content before returning the verified Blob.
 */
export async function reconstructVerifiedFile(
  chunks: Blob[],
  manifest: FullFileManifest,
  fileName?: string,
): Promise<Blob> {
  assertManifest(manifest);
  const label = fileName ?? manifest.fileName;
  if (chunks.length !== manifest.chunks.length) {
    throw new Error(
      `Cannot reconstruct ${label}: expected ${manifest.chunks.length} chunks, received ${chunks.length}.`,
    );
  }

  // Hash one chunk at a time; do not concatenate chunk array buffers merely to
  // verify them. Blob performs the final ordered join without another explicit
  // large Uint8Array copy here.
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const expected = manifest.chunks[index];
    if (chunk.size !== expected.size) {
      throw new Error(
        `Chunk size mismatch at index ${index}: expected ${expected.size}, received ${chunk.size}.`,
      );
    }
    const hash = await hashBlob(chunk);
    if (hash !== expected.hash) {
      throw new Error(`Chunk hash mismatch at index ${index}.`);
    }
  }

  const reconstructed = new Blob(chunks, { type: manifest.mimeType });
  if (reconstructed.size !== manifest.fileSize) {
    throw new Error(
      `Reconstructed file size mismatch: expected ${manifest.fileSize}, received ${reconstructed.size}.`,
    );
  }
  const fileHash = await hashBlob(reconstructed);
  if (fileHash !== manifest.fileHash) {
    throw new Error("Reconstructed file hash does not match the manifest.");
  }
  return reconstructed;
}

/** Hash and chunk a complete Blob, returning its reproducible v2 manifest. */
export async function prepareFullFileAnchor(
  blob: Blob,
  options: PrepareFullFileAnchorOptions,
): Promise<PreparedFullFileAnchor> {
  if (blob.size === 0) {
    throw new Error("Cannot anchor an empty file.");
  }
  if (!options.attachmentId.trim()) {
    throw new Error("Attachment id must not be empty.");
  }
  const chunkSize = options.chunkSize ?? DEFAULT_FULL_FILE_CHUNK_SIZE;
  assertChunkSize(chunkSize);

  const fileHash = await hashBlob(blob);
  const chunks: Blob[] = [];
  const chunkManifest: FullFileChunkManifest[] = [];
  for (let offset = 0, index = 0; offset < blob.size; index += 1) {
    const end = Math.min(offset + chunkSize, blob.size);
    const chunk = blob.slice(offset, end);
    chunks.push(chunk);
    chunkManifest.push({
      index,
      size: chunk.size,
      hash: await hashBlob(chunk),
    });
    offset = end;
  }

  // Property insertion order is deliberate: JSON.stringify is the canonical,
  // compact representation hashed below. No storage location or timestamps are
  // included, so identical inputs are repeatable across sessions and devices.
  const manifest: FullFileManifest = {
    version: "ssv2",
    attachmentId: options.attachmentId,
    fileName: options.fileName ?? defaultFileName(blob),
    mimeType: blob.type,
    fileSize: blob.size,
    fileHash,
    chunkSize,
    chunks: chunkManifest,
  };
  const manifestJson = JSON.stringify(manifest);
  const manifestHash = await sha256Hex(new TextEncoder().encode(manifestJson));
  const memo = buildFullFileAnchorMemo(
    options.attachmentId,
    fileHash,
    manifestHash,
    chunks.length,
  );

  return { manifest, manifestJson, manifestHash, fileHash, chunks, memo };
}
