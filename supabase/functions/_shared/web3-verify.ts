/**
 * Server-side verification of wallet signatures for the `web3-auth` Edge
 * Function.
 *
 * Signing in with a wallet proves nothing on its own: the *only* thing that
 * ties a wallet to a SiteSurveyor account is a signature this server checked
 * against the exact message it asked for. So verification here is deliberately
 * unforgiving — a signature that does not recover to the address embedded in
 * the signed message is rejected, never "fixed up" or trusted because the
 * client said so.
 *
 * Both curves are verified with the same audited primitives the rest of the
 * ecosystem uses:
 *   * Ethereum — secp256k1 + keccak-256, EIP-191 "personal message" prefix.
 *   * Solana   — ed25519 over the raw message bytes (RFC 8032).
 *
 * No private key material ever reaches this process: only the public message,
 * the signature, and the address the caller claims to control.
 */

import { secp256k1 } from "npm:@noble/curves@1.9.7/secp256k1";
import { keccak_256 } from "npm:@noble/hashes@1.8.0/sha3";
import { ed25519 } from "npm:@noble/curves@1.9.7/ed25519";
import { base58 } from "npm:@scure/base@2.4.0";

/** Thrown when a signature cannot be proven to belong to the claimed address. */
export class Web3VerificationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "Web3VerificationError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new Web3VerificationError(code, message);
}

// ── byte / hex helpers ───────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    fail("INVALID_SIGNATURE_ENCODING", "Signature is not valid hexadecimal.");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

const encoder = new TextEncoder();

// ── Ethereum (EIP-191 / secp256k1) ──────────────────────────────────────────

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
/** secp256k1 group order N. */
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_HALF_N = SECP256K1_N >> 1n;

/** EIP-191 "personal message" digest: keccak256("\x19Ethereum Signed Message:\n<len>" || msg). */
export function hashEthereumPersonalMessage(message: string): Uint8Array {
  const body = encoder.encode(message);
  const prefix = encoder.encode(`\x19Ethereum Signed Message:\n${body.length}`);
  const joined = new Uint8Array(prefix.length + body.length);
  joined.set(prefix, 0);
  joined.set(body, prefix.length);
  return keccak_256(joined);
}

/** Lower-case, `0x`-prefixed canonical form of an EVM address. */
export function normalizeEthereumAddress(address: string): string {
  const value = address.trim();
  if (!ETH_ADDRESS_RE.test(value)) {
    fail("INVALID_ADDRESS", "That is not a valid Ethereum address.");
  }
  return value.toLowerCase();
}

/**
 * Derive the EVM address that owns `message`'s signature.
 *
 * `signature` must be the 65-byte `r || s || v` blob wallets return from
 * `personal_sign`. `v` is accepted as 0/1, 27/28, or an EIP-155 value.
 */
export function recoverEthereumAddress(message: string, signature: string): string {
  const bytes = hexToBytes(signature);

  if (bytes.length !== 65) {
    fail(
      "INVALID_SIGNATURE_ENCODING",
      "Ethereum signatures must be 65 bytes (r, s and v).",
    );
  }

  const r = bytes.subarray(0, 32);
  const s = bytes.subarray(32, 64);
  const v = bytes[64];

  let recovery: number;
  if (v === 0 || v === 1) {
    recovery = v;
  } else if (v === 27 || v === 28) {
    recovery = v - 27;
  } else if (v >= 35) {
    // EIP-155: v = chainId * 2 + 35 + recovery.
    recovery = (v - 35) % 2;
  } else {
    fail("INVALID_SIGNATURE", "Signature recovery id (v) is not recognised.");
  }

  let sBig = bytesToBigInt(s);
  if (sBig <= 0n || sBig >= SECP256K1_N) {
    fail("INVALID_SIGNATURE", "Signature scalar s is out of range.");
  }
  let rBig = bytesToBigInt(r);
  if (rBig <= 0n || rBig >= SECP256K1_N) {
    fail("INVALID_SIGNATURE", "Signature scalar r is out of range.");
  }

  // Signatures are malleable: (r, s) and (r, N - s) both verify with mirrored
  // recovery ids. Normalising to the low-s form means the address recovery
  // below is independent of which half of the curve the signer happened to
  // land in, while still yielding exactly one owner per signature.
  if (sBig > SECP256K1_HALF_N) {
    sBig = SECP256K1_N - sBig;
    recovery ^= 1;
  }

  const compact = new Uint8Array(64);
  compact.set(bigIntToBytes(rBig, 32), 0);
  compact.set(bigIntToBytes(sBig, 32), 32);

  const digest = hashEthereumPersonalMessage(message);

  // The published types for `@noble/curves@1.9.7` do not describe
  // `recoverPublicKey` on `CurveFnWithCreate`, but the runtime export is the
  // documented `recoverPublicKey(signature, msgHash, opts)` — assert the exact
  // shape we rely on here so a future version change fails loudly instead of
  // silently returning garbage.
  type RecoverableSecp256k1 = {
    recoverPublicKey(
      signature: Uint8Array,
      msgHash: Uint8Array,
      opts?: { prehash?: boolean },
    ): Uint8Array;
  };
  const { recoverPublicKey } = secp256k1 as unknown as RecoverableSecp256k1;

  let recovered: Uint8Array;
  try {
    recovered = recoverPublicKey(
      Uint8Array.from([recovery, ...compact]),
      digest,
      { prehash: false },
    );
  } catch {
    fail("INVALID_SIGNATURE", "Signature could not be recovered.");
  }

  // `recoverPublicKey` returns the compressed point; the address is derived
  // from the uncompressed form (keccak256 of x || y, last 20 bytes).
  const uncompressed = secp256k1.Point.fromBytes(recovered).toRawBytes(false);
  const digest2 = keccak_256(uncompressed.subarray(1));
  return `0x${bytesToHex(digest2.subarray(12))}`;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  return value;
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/**
 * Verify an Ethereum signature over `message` belongs to `expectedAddress`.
 * Returns the lower-cased address that actually signed.
 */
export function verifyEthereumSignature(params: {
  message: string;
  signature: string;
  expectedAddress: string;
}): { address: string } {
  const expected = normalizeEthereumAddress(params.expectedAddress);
  const signer = recoverEthereumAddress(params.message, params.signature);

  if (signer !== expected) {
    fail(
      "SIGNATURE_MISMATCH",
      "The signature does not belong to that Ethereum address.",
    );
  }
  return { address: expected };
}

// ── Solana (ed25519) ─────────────────────────────────────────────────────────

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Lower-case-free canonical check: base58 round-trips to the same string. */
export function normalizeSolanaAddress(address: string): string {
  const value = address.trim();
  if (!SOLANA_ADDRESS_RE.test(value)) {
    fail("INVALID_ADDRESS", "That is not a valid Solana address.");
  }
  let decoded: Uint8Array;
  try {
    decoded = base58.decode(value);
  } catch {
    fail("INVALID_ADDRESS", "That is not a valid Solana address.");
  }
  if (decoded.length !== 32) {
    fail("INVALID_ADDRESS", "That is not a valid Solana address.");
  }
  // Reject non-canonical base58 spellings so one address has one string form.
  if (base58.encode(decoded) !== value) {
    fail("INVALID_ADDRESS", "That Solana address is not in canonical form.");
  }
  return value;
}

/**
 * Solana wallets return base58 signatures (the Wallet Standard's default) and
 * some paths hand back base64. Accept both, but require exactly 64 bytes.
 */
function decodeSolanaSignature(signature: string): Uint8Array {
  const value = signature.trim();
  if (!value) {
    fail("INVALID_SIGNATURE_ENCODING", "Signature is empty.");
  }

  try {
    const decoded = base58.decode(value);
    if (decoded.length === 64) return decoded;
  } catch {
    // fall through to base64
  }

  try {
    const bin = atob(value);
    if (bin.length === 64) {
      const out = new Uint8Array(64);
      for (let i = 0; i < 64; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
  } catch {
    // fall through to the error below
  }

  fail(
    "INVALID_SIGNATURE_ENCODING",
    "Solana signatures must be 64 bytes encoded as base58 or base64.",
  );
}

/** Verify an ed25519 signature over `message` belongs to `expectedAddress`. */
export function verifySolanaSignature(params: {
  message: string;
  signature: string;
  expectedAddress: string;
}): { address: string } {
  const expected = normalizeSolanaAddress(params.expectedAddress);

  let publicKey: Uint8Array;
  try {
    publicKey = base58.decode(expected);
  } catch {
    fail("INVALID_ADDRESS", "That is not a valid Solana address.");
  }
  if (publicKey.length !== 32) {
    fail("INVALID_ADDRESS", "That is not a valid Solana address.");
  }

  const signatureBytes = decodeSolanaSignature(params.signature);
  const messageBytes = encoder.encode(params.message);

  let valid = false;
  try {
    // RFC 8032 (strict) rather than ZIP-215: it matches what Supabase Auth
    // itself enforces, so a signature accepted here is accepted there too.
    valid = ed25519.verify(signatureBytes, messageBytes, publicKey, {
      zip215: false,
    });
  } catch {
    valid = false;
  }

  if (!valid) {
    fail(
      "SIGNATURE_MISMATCH",
      "The signature does not belong to that Solana address.",
    );
  }

  return { address: expected };
}
