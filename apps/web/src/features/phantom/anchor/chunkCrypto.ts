/**
 * Envelope encryption for full-file anchor chunks.
 *
 * A random AES-256 data key is generated per anchor operation. Each chunk is
 * encrypted with AES-GCM under that key, and the key itself is stored only in
 * a wrapped form derived from the user's anchoring passphrase (PBKDF2-SHA256,
 * 250,000 iterations — the same shape as the custom-wallet key in
 * `phantom/lib/customWalletAdapter.ts`). Supabase therefore holds ciphertext
 * plus a wrapped key that is useless without the passphrase.
 *
 * The manifest still describes the *plaintext* chunk sizes and digests, so the
 * digest written on chain keeps proving the original file, not the ciphertext.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const PBKDF2_ITERATIONS = 250_000;

export const ANCHOR_ENCRYPTION_ALGORITHM = "AES-256-GCM";
export const ANCHOR_KEY_DERIVATION = "PBKDF2-SHA256";

/** Serialized form persisted on `file_anchor_operations.encryption`. */
export interface WrappedAnchorKey {
  version: "ssv2e1";
  algorithm: typeof ANCHOR_ENCRYPTION_ALGORITHM;
  kdf: typeof ANCHOR_KEY_DERIVATION;
  iterations: number;
  /** base64 KDF salt. */
  salt: string;
  /** base64 AES-GCM IV for the wrapped key. */
  iv: string;
  /** base64 AES-GCM ciphertext of the raw data key. */
  wrapped_key: string;
}

export interface PreparedAnchorKey {
  key: CryptoKey;
  wrapped: WrappedAnchorKey;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto is unavailable in this browser, so chunks cannot be encrypted.");
  }
  return globalThis.crypto.subtle;
}

async function deriveKek(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  if (!passphrase) throw new Error("An anchoring passphrase is required.");
  const material = await subtle().importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as unknown as BufferSource,
      iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function importDataKey(bytes: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey("raw", bytes as unknown as BufferSource, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Create the per-operation data key and its passphrase-wrapped copy. */
export async function createAnchorKey(passphrase: string): Promise<PreparedAnchorKey> {
  const keyBytes = globalThis.crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const kek = await deriveKek(passphrase, salt, PBKDF2_ITERATIONS);
  const wrappedRaw = await subtle().encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    kek,
    keyBytes as unknown as BufferSource,
  );
  const wrapped: WrappedAnchorKey = {
    version: "ssv2e1",
    algorithm: ANCHOR_ENCRYPTION_ALGORITHM,
    kdf: ANCHOR_KEY_DERIVATION,
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    wrapped_key: toBase64(new Uint8Array(wrappedRaw)),
  };
  return { key: await importDataKey(keyBytes), wrapped };
}

/** Recover the data key. Throws if the passphrase is wrong. */
export async function unlockAnchorKey(
  passphrase: string,
  wrapped: WrappedAnchorKey,
): Promise<CryptoKey> {
  if (wrapped.algorithm !== ANCHOR_ENCRYPTION_ALGORITHM || wrapped.kdf !== ANCHOR_KEY_DERIVATION) {
    throw new Error(`This anchor used an unsupported scheme (${String(wrapped.algorithm)}).`);
  }
  if (!Number.isSafeInteger(wrapped.iterations) || wrapped.iterations < PBKDF2_ITERATIONS) {
    throw new Error("This anchor's key derivation settings are no longer accepted.");
  }
  const kek = await deriveKek(passphrase, fromBase64(wrapped.salt), wrapped.iterations);
  let raw: ArrayBuffer;
  try {
    raw = await subtle().decrypt(
      { name: "AES-GCM", iv: fromBase64(wrapped.iv) as unknown as BufferSource },
      kek,
      fromBase64(wrapped.wrapped_key) as unknown as BufferSource,
    );
  } catch {
    throw new Error("Wrong anchoring passphrase — the stored key could not be unlocked.");
  }
  return importDataKey(new Uint8Array(raw));
}

/** Stored form: `12-byte IV || AES-GCM ciphertext + tag`. */
export async function encryptChunk(key: CryptoKey, chunk: Blob): Promise<Blob> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await subtle().encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    await chunk.arrayBuffer(),
  );
  const bytes = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  bytes.set(iv, 0);
  bytes.set(new Uint8Array(ciphertext), IV_BYTES);
  return new Blob([bytes], { type: "application/octet-stream" });
}

export async function decryptChunk(key: CryptoKey, stored: Blob): Promise<Blob> {
  const buffer = await stored.arrayBuffer();
  if (buffer.byteLength <= IV_BYTES) throw new Error("Stored chunk is too small to be encrypted.");
  const bytes = new Uint8Array(buffer);
  try {
    const plaintext = await subtle().decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, IV_BYTES) as unknown as BufferSource },
      key,
      bytes.subarray(IV_BYTES) as unknown as BufferSource,
    );
    return new Blob([plaintext]);
  } catch {
    throw new Error("A stored chunk could not be decrypted — it was altered or used a different key.");
  }
}
