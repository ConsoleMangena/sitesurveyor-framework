/**
 * On-chain file anchoring for SiteSurveyor.
 *
 * Survey files stay in off-chain Supabase Storage. Only the SHA-256 content
 * hash is anchored to Solana for tamper-evident proof of integrity.
 *
 * Two anchoring strategies are supported:
 *   1. File Record program (preferred) — a dedicated Anchor program that
 *      stores a typed PDA account per file. Configure by setting
 *      `VITE_SOLANA_FILE_RECORD_PROGRAM_ID`.
 *   2. SPL Memo fallback — writes the hash into a transaction memo. Used when
 *      no File Record program is configured.
 *
 * Anchoring can be signed by an embedded wallet keypair (no browser extension)
 * or by an injected Phantom/Solflare wallet.
 */

import { Buffer } from "buffer";
import {
  type Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { SOLANA_CLUSTER } from "../lib/config";
import { isUserRejection } from "../lib/provider";
import { getConnection } from "./solanaPay";
import {
  anchorFileRecord,
  deleteFileRecord,
  isFileRecordProgramConfigured,
  restoreFileRecord,
  type FileRecordResult,
} from "../lib/fileRecordProgram";

/** SPL Memo program id (v2). */
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

/** Prefix so memo anchors are recognisable on-chain. */
const MEMO_PREFIX = "sitesurveyor:file:sha256:";

export type AnchorFileResult = FileRecordResult;

interface LegacyMemoResult {
  signature: string;
  network: string;
  walletAddress: string;
  programId: string;
  recordPda: string;
  workspacePda: string;
}

async function anchorWithMemo(
  contentHash: string,
  signer?: Keypair,
): Promise<LegacyMemoResult> {
  if (!/^[0-9a-f]{64}$/.test(contentHash)) {
    throw new Error("Invalid content hash; cannot anchor this file.");
  }

  const conn = getConnection();
  const { blockhash } = await conn.getLatestBlockhash("confirmed");

  let payer: PublicKey;
  let walletAddress: string;

  if (signer) {
    payer = signer.publicKey;
    walletAddress = signer.publicKey.toBase58();
  } else {
    const { connectWallet } = await import("../lib/provider");
    const { provider, walletAddress: addr } = await connectWallet();
    if (!provider.signAndSendTransaction) {
      throw new Error(
        "This wallet does not support sending transactions. Use Phantom or Solflare.",
      );
    }
    payer = new PublicKey(addr);
    walletAddress = addr;
  }

  const memoIx = new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    data: Buffer.from(`${MEMO_PREFIX}${contentHash}`, "utf8"),
  });

  const tx = new Transaction();
  tx.feePayer = payer;
  tx.recentBlockhash = blockhash;
  tx.add(memoIx);

  try {
    let signature: string;
    if (signer) {
      tx.sign(signer);
      signature = await conn.sendRawTransaction(tx.serialize(), {
        preflightCommitment: "confirmed",
      });
      await conn.confirmTransaction(signature, "confirmed");
    } else {
      const { connectWallet } = await import("../lib/provider");
      const { provider } = await connectWallet();
      signature = (await provider.signAndSendTransaction!(tx)).signature;
    }

    return {
      signature,
      network: SOLANA_CLUSTER,
      walletAddress,
      programId: MEMO_PROGRAM_ID.toBase58(),
      recordPda: "",
      workspacePda: "",
    };
  } catch (err) {
    if (isUserRejection(err)) {
      throw new Error("Anchoring cancelled in wallet.");
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** Estimate the network fee to anchor a content hash via the SPL Memo fallback. */
export async function estimateAnchorFileFee(contentHash: string): Promise<number> {
  if (!/^[0-9a-f]{64}$/.test(contentHash)) return 0;
  const conn = getConnection();
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const placeholderPayer = new PublicKey(
    "11111111111111111111111111111111",
  );
  const memoIx = new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: placeholderPayer, isSigner: true, isWritable: false }],
    data: Buffer.from(`${MEMO_PREFIX}${contentHash}`, "utf8"),
  });
  const tx = new Transaction();
  tx.feePayer = placeholderPayer;
  tx.recentBlockhash = blockhash;
  tx.add(memoIx);
  const { value } = await conn.getFeeForMessage(tx.compileMessage(), "confirmed");
  return (value ?? 0) / LAMPORTS_PER_SOL;
}

/**
 * Anchor a content hash on-chain.
 *
 * Uses the File Record Anchor program when `VITE_SOLANA_FILE_RECORD_PROGRAM_ID`
 * is configured; otherwise falls back to an SPL Memo transaction.
 */
export async function anchorFileHash(
  workspaceId: string,
  contentHash: string,
  signer?: Keypair,
): Promise<AnchorFileResult> {
  if (isFileRecordProgramConfigured()) {
    return anchorFileRecord(workspaceId, contentHash, signer);
  }
  return anchorWithMemo(contentHash, signer);
}

/** Record an on-chain soft-delete attestation for a file. */
export async function deleteFileHash(
  workspaceId: string,
  contentHash: string,
  signer?: Keypair,
): Promise<AnchorFileResult> {
  if (isFileRecordProgramConfigured()) {
    return deleteFileRecord(workspaceId, contentHash, signer);
  }
  throw new Error("On-chain delete attestation requires the File Record program.");
}

/** Clear the on-chain deletion flag for a file. */
export async function restoreFileHash(
  workspaceId: string,
  contentHash: string,
  signer?: Keypair,
): Promise<AnchorFileResult> {
  if (isFileRecordProgramConfigured()) {
    return restoreFileRecord(workspaceId, contentHash, signer);
  }
  throw new Error("On-chain restore attestation requires the File Record program.");
}

/** Solana explorer URL for an anchor transaction signature. */
export function explorerTxUrl(signature: string, network: string): string {
  const cluster = network === "mainnet-beta" ? "" : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

/** Solana explorer URL for a program account (PDA). */
export function explorerAccountUrl(address: string, network: string): string {
  const cluster = network === "mainnet-beta" ? "" : `?cluster=${network}`;
  return `https://explorer.solana.com/address/${address}${cluster}`;
}
