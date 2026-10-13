/**
 * Open-source embedded Solana wallet.
 *
 * The wallet is generated in the browser, encrypted with a user PIN using the
 * Web Crypto API (PBKDF2 + AES-GCM), and the encrypted blob is stored on the
 * server. The PIN and decrypted secret key never leave the browser.
 *
 * This is a simple self-custodial alternative to browser-extension wallets
 * like Phantom. It works in Tauri, mobile browsers, and desktop browsers.
 */

import { Keypair, PublicKey } from "@solana/web3.js";
import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export interface EncryptedWallet {
  walletAddress: string;
  encryptedKey: string; // base64 ciphertext
  iv: string;           // base64 IV
  salt: string;         // base64 salt
  encryptedMnemonic?: string; // base64 ciphertext for the seed phrase
  mnemonicIv?: string;        // base64 IV for the seed phrase
}

export interface EmbeddedWallet {
  publicKey: PublicKey;
  keypair: Keypair;
  walletAddress: string;
  mnemonic?: string;
}

export interface CreateEncryptedWalletResult {
  encryptedWallet: EncryptedWallet;
  mnemonic: string;
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

function isValidBase64(value: unknown): value is string {
  return typeof value === "string" && BASE64_PATTERN.test(value.trim());
}

function sanitizeBase64(value: string): string {
  // Remove whitespace and normalize common separators.
  return value.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
}

export function base64ToBuffer(base64: string): Uint8Array {
  if (!isValidBase64(base64)) {
    throw new Error(
      "Stored wallet data is not valid base64. The wallet may be corrupted; try deleting and recreating it.",
    );
  }
  const cleaned = sanitizeBase64(base64);
  try {
    const binary = window.atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    throw new Error(
      "Stored wallet data could not be decoded. The wallet may be corrupted; try deleting and recreating it.",
    );
  }
}

export function bufferToBase64(buffer: Uint8Array | ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return window.btoa(binary);
}

function validateEncryptedWallet(
  encrypted: EncryptedWallet,
): asserts encrypted is EncryptedWallet {
  const fields: Array<{ key: keyof EncryptedWallet; label: string }> = [
    { key: "walletAddress", label: "wallet address" },
    { key: "encryptedKey", label: "encrypted key" },
    { key: "iv", label: "IV" },
    { key: "salt", label: "salt" },
  ];
  for (const { key, label } of fields) {
    const value = encrypted[key];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(
        `Stored wallet is missing the ${label}. Delete the wallet and create a new one.`,
      );
    }
  }
  const base64Fields: Array<{
    key: keyof EncryptedWallet;
    label: string;
    optional?: boolean;
  }> = [
    { key: "encryptedKey", label: "encrypted key" },
    { key: "iv", label: "IV" },
    { key: "salt", label: "salt" },
    { key: "encryptedMnemonic", label: "encrypted seed phrase", optional: true },
    { key: "mnemonicIv", label: "seed phrase IV", optional: true },
  ];
  for (const { key, label, optional } of base64Fields) {
    const value = encrypted[key];
    if (optional && (value === undefined || value === "")) continue;
    if (!isValidBase64(value)) {
      throw new Error(
        `Stored wallet ${label} is not valid base64. The wallet may be corrupted; delete it and create a new one.`,
      );
    }
  }
  const hasMnemonic = encrypted.encryptedMnemonic && encrypted.encryptedMnemonic.trim() !== "";
  const hasIv = encrypted.mnemonicIv && encrypted.mnemonicIv.trim() !== "";
  if (hasMnemonic !== hasIv) {
    throw new Error(
      "Stored wallet seed phrase data is incomplete. The wallet may be corrupted; delete it and create a new one.",
    );
  }
}

async function getCrypto(): Promise<Crypto> {
  if (typeof window === "undefined" || !window.crypto?.subtle || !window.crypto.getRandomValues) {
    throw new Error(
      "Web Crypto API is not available. Use HTTPS or localhost and a modern browser.",
    );
  }
  return window.crypto;
}

function getSubtleCrypto(): SubtleCrypto {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error(
      "Web Crypto API is not available. Use HTTPS or localhost and a modern browser.",
    );
  }
  return window.crypto.subtle;
}

async function deriveEncryptionKey(
  pin: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const keyMaterial = await subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(pin) as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 250_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function generateSalt(): Promise<Uint8Array> {
  const crypto = await getCrypto();
  return crypto.getRandomValues(new Uint8Array(16));
}

async function generateIv(): Promise<Uint8Array> {
  const crypto = await getCrypto();
  return crypto.getRandomValues(new Uint8Array(12));
}

/** Generate a new Solana keypair from a BIP-39 mnemonic and encrypt both with the user's PIN. */
export async function createEncryptedWallet(
  pin: string,
): Promise<CreateEncryptedWalletResult> {
  const mnemonic = generateMnemonic(wordlist, 128); // 12-word phrase
  const seed = mnemonicToSeedSync(mnemonic);
  const keypair = Keypair.fromSeed(seed.slice(0, 32));
  const secretKey = keypair.secretKey; // 64 bytes
  const salt = await generateSalt();
  const aesKey = await deriveEncryptionKey(pin, salt);
  const subtle = await getSubtleCrypto();

  const iv = await generateIv();
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    aesKey,
    secretKey as BufferSource,
  );

  const mnemonicIv = await generateIv();
  const mnemonicBytes = TEXT_ENCODER.encode(mnemonic);
  const encryptedMnemonic = await subtle.encrypt(
    { name: "AES-GCM", iv: mnemonicIv as BufferSource },
    aesKey,
    mnemonicBytes as BufferSource,
  );

  return {
    encryptedWallet: {
      walletAddress: keypair.publicKey.toBase58(),
      encryptedKey: bufferToBase64(ciphertext),
      iv: bufferToBase64(iv),
      salt: bufferToBase64(salt),
      encryptedMnemonic: bufferToBase64(encryptedMnemonic),
      mnemonicIv: bufferToBase64(mnemonicIv),
    },
    mnemonic,
  };
}

/** Import an existing wallet from a BIP-39 seed phrase and encrypt it with the user's PIN. */
export async function importEncryptedWalletFromMnemonic(
  mnemonic: string,
  pin: string,
): Promise<{ encryptedWallet: EncryptedWallet; walletAddress: string }> {
  const normalized = mnemonic
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .join(" ");
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error(
      "Invalid seed phrase. Enter all 12 words in the correct order, separated by spaces.",
    );
  }
  const seed = mnemonicToSeedSync(normalized);
  const keypair = Keypair.fromSeed(seed.slice(0, 32));
  const secretKey = keypair.secretKey;
  const salt = await generateSalt();
  const aesKey = await deriveEncryptionKey(pin, salt);
  const subtle = await getSubtleCrypto();

  const iv = await generateIv();
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    aesKey,
    secretKey as BufferSource,
  );

  const mnemonicIv = await generateIv();
  const mnemonicBytes = TEXT_ENCODER.encode(normalized);
  const encryptedMnemonic = await subtle.encrypt(
    { name: "AES-GCM", iv: mnemonicIv as BufferSource },
    aesKey,
    mnemonicBytes as BufferSource,
  );

  return {
    encryptedWallet: {
      walletAddress: keypair.publicKey.toBase58(),
      encryptedKey: bufferToBase64(ciphertext),
      iv: bufferToBase64(iv),
      salt: bufferToBase64(salt),
      encryptedMnemonic: bufferToBase64(encryptedMnemonic),
      mnemonicIv: bufferToBase64(mnemonicIv),
    },
    walletAddress: keypair.publicKey.toBase58(),
  };
}

/** Decrypt a stored wallet with the user's PIN. */
export async function decryptEmbeddedWallet(
  pin: string,
  encrypted: EncryptedWallet,
): Promise<EmbeddedWallet> {
  validateEncryptedWallet(encrypted);
  const salt = base64ToBuffer(encrypted.salt);
  const iv = base64ToBuffer(encrypted.iv);
  const ciphertext = base64ToBuffer(encrypted.encryptedKey);
  const aesKey = await deriveEncryptionKey(pin, salt);
  const subtle = await getSubtleCrypto();

  let secretKey: Uint8Array;
  try {
    const decrypted = await subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      aesKey,
      ciphertext as BufferSource,
    );
    secretKey = new Uint8Array(decrypted);
  } catch {
    throw new Error("Incorrect PIN. Unable to unlock wallet.");
  }

  let mnemonic: string | undefined;
  if (encrypted.encryptedMnemonic && encrypted.mnemonicIv) {
    try {
      const mnemonicCipher = base64ToBuffer(encrypted.encryptedMnemonic);
      const mnemonicIv = base64ToBuffer(encrypted.mnemonicIv);
      const decryptedMnemonic = await subtle.decrypt(
        { name: "AES-GCM", iv: mnemonicIv as BufferSource },
        aesKey,
        mnemonicCipher as BufferSource,
      );
      mnemonic = TEXT_DECODER.decode(decryptedMnemonic);
    } catch {
      // If the seed phrase ciphertext was corrupted, continue without it.
      mnemonic = undefined;
    }
  }

  try {
    const keypair = Keypair.fromSecretKey(secretKey);
    if (keypair.publicKey.toBase58() !== encrypted.walletAddress) {
      throw new Error("Decrypted key does not match stored wallet address.");
    }
    return {
      publicKey: keypair.publicKey,
      keypair,
      walletAddress: encrypted.walletAddress,
      mnemonic,
    };
  } catch {
    throw new Error("Incorrect PIN. Unable to unlock wallet.");
  }
}

/** Decrypt a wallet with the old PIN and re-encrypt it with a new PIN. */
export async function changeEncryptedWalletPin(
  oldPin: string,
  newPin: string,
  encrypted: EncryptedWallet,
): Promise<EncryptedWallet> {
  validateEncryptedWallet(encrypted);
  const wallet = await decryptEmbeddedWallet(oldPin, encrypted);
  const salt = await generateSalt();
  const aesKey = await deriveEncryptionKey(newPin, salt);
  const subtle = await getSubtleCrypto();

  const iv = await generateIv();
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    aesKey,
    wallet.keypair.secretKey as BufferSource,
  );

  let encryptedMnemonic: string | undefined;
  let mnemonicIv: string | undefined;
  if (wallet.mnemonic) {
    const ivMnemonic = await generateIv();
    const mnemonicBytes = TEXT_ENCODER.encode(wallet.mnemonic);
    const encrypted = await subtle.encrypt(
      { name: "AES-GCM", iv: ivMnemonic as BufferSource },
      aesKey,
      mnemonicBytes as BufferSource,
    );
    encryptedMnemonic = bufferToBase64(encrypted);
    mnemonicIv = bufferToBase64(ivMnemonic);
  }

  return {
    walletAddress: wallet.walletAddress,
    encryptedKey: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
    salt: bufferToBase64(salt),
    encryptedMnemonic,
    mnemonicIv,
  };
}

/** Validate PIN/passphrase strength. */
export function validatePinStrength(pin: string): {
  valid: boolean;
  message: string;
} {
  if (pin.length < 8) {
    return { valid: false, message: "PIN must be at least 8 characters." };
  }
  if (!/[a-zA-Z]/.test(pin)) {
    return { valid: false, message: "PIN must include at least one letter." };
  }
  if (!/[0-9]/.test(pin)) {
    return { valid: false, message: "PIN must include at least one number." };
  }
  if (!/[^a-zA-Z0-9]/.test(pin)) {
    return {
      valid: false,
      message: "PIN must include at least one special character.",
    };
  }
  return { valid: true, message: "" };
}

/** True when the runtime environment supports the embedded wallet. */
export function isEmbeddedWalletSupported(): boolean {
  return typeof window !== "undefined" && Boolean(window.crypto?.subtle);
}
