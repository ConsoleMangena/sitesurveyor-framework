import { BaseWalletAdapter, WalletReadyState, type WalletName, type SupportedTransactionVersions, type TransactionOrVersionedTransaction } from "@solana/wallet-adapter-base";
import { Connection, Keypair, PublicKey, Transaction, type TransactionSignature } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "./config.ts";
import { loadCustomWallet, saveCustomWallet } from "./customWalletRepository.ts";

const STORAGE_KEY = "sitesurveyor:custom-wallet:address";
const encoder = new TextEncoder();

interface StoredWallet { address: string; salt: string; iv: string; ciphertext: string }

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(pin) as BufferSource, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: 250_000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["deriveKey"]);
}
async function encryptKeypair(keypair: Keypair, pin: string): Promise<StoredWallet> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, keypair.secretKey as BufferSource);
  return { address: keypair.publicKey.toBase58(), salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}
async function decryptKeypair(stored: StoredWallet, pin: string): Promise<Keypair> {
  try {
    const key = await deriveKey(pin, base64ToBytes(stored.salt));
    const secret = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(stored.iv) as BufferSource }, key, base64ToBytes(stored.ciphertext) as BufferSource);
    const keypair = Keypair.fromSecretKey(new Uint8Array(secret));
    if (keypair.publicKey.toBase58() !== stored.address) throw new Error("Wallet data is invalid.");
    return keypair;
  } catch {
    throw new Error("Incorrect PIN or corrupted custom wallet data.");
  }
}

export const CUSTOM_WALLET_NAME = "SiteSurveyor Wallet" as WalletName<"SiteSurveyor Wallet">;

export class CustomWalletAdapter extends BaseWalletAdapter {
  readonly name = CUSTOM_WALLET_NAME;
  readonly url = "https://sitesurveyor.app";
  readonly icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%237c3aed' d='M12 2 3 7v10l9 5 9-5V7z'/%3E%3C/svg%3E";
  readonly readyState = WalletReadyState.Loadable;
  readonly supportedTransactionVersions: SupportedTransactionVersions = null;
  private keypair: Keypair | null = null;
  private connectingFlag = false;

  get publicKey(): PublicKey | null { return this.keypair?.publicKey ?? null; }
  get connecting(): boolean { return this.connectingFlag; }
  get connected(): boolean { return Boolean(this.keypair); }

  hasStoredWallet(): boolean {
    if (typeof localStorage === "undefined") return false;
    return Boolean(localStorage.getItem(STORAGE_KEY));
  }
  async createWallet(pin: string): Promise<string> {
    if (!pin || pin.length < 8) throw new Error("Use a wallet PIN of at least 8 characters.");
    if (await loadCustomWallet()) throw new Error("A custom wallet already exists. Unlock it or remove it first.");
    const stored = await encryptKeypair(Keypair.generate(), pin);
    await saveCustomWallet({ wallet_address: stored.address, salt: stored.salt, iv: stored.iv, ciphertext: stored.ciphertext });
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, stored.address);
    this.keypair = await decryptKeypair(stored, pin);
    this.emit("connect", this.keypair.publicKey);
    return stored.address;
  }
  async unlockWallet(pin: string): Promise<string> {
    const stored = await loadCustomWallet();
    if (!stored) throw new Error("Create a custom wallet first.");
    const encrypted: StoredWallet = { address: stored.wallet_address, salt: stored.salt, iv: stored.iv, ciphertext: stored.ciphertext };
    this.keypair = await decryptKeypair(encrypted, pin);
    this.emit("connect", this.keypair.publicKey);
    return stored.wallet_address;
  }
  async connect(): Promise<void> {
    if (!this.keypair) throw new Error("Unlock your SiteSurveyor Wallet first.");
    this.emit("connect", this.keypair.publicKey);
  }
  async autoConnect(): Promise<void> { return; }
  async disconnect(): Promise<void> { this.keypair = null; this.emit("disconnect"); }
  async sendTransaction(transaction: TransactionOrVersionedTransaction<null>, connection: Connection): Promise<TransactionSignature> {
    if (!this.keypair) throw new Error("Unlock your SiteSurveyor Wallet first.");
    if (!(transaction instanceof Transaction)) throw new Error("Versioned transactions are not supported by this wallet yet.");
    transaction.feePayer = this.keypair.publicKey;
    return connection.sendTransaction(transaction, [this.keypair]);
  }
  getSecretKeyForInternalUse(): Uint8Array {
    if (!this.keypair) throw new Error("Unlock your SiteSurveyor Wallet first.");
    return this.keypair.secretKey;
  }
}

export const customWalletAdapter = new CustomWalletAdapter();
export const customWalletConnection = new Connection(SOLANA_RPC_URL, "confirmed");
