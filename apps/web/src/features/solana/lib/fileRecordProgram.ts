/**
 * Minimal Anchor-program client for the SiteSurveyor File Record program.
 *
 * This module intentionally uses only @solana/web3.js so it does not add the
 * large @coral-xyz/anchor dependency. It constructs the same instruction data
 * Anchor would produce (8-byte discriminator + serialized args) and derives
 * the same PDAs.
 *
 * All signing can be done either by an embedded wallet keypair (no browser
 * extension required) or by an injected wallet provider such as Phantom.
 */

import { Buffer } from "buffer";
import {
  type Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { getConnection } from "../payments/solanaPay";
import { SOLANA_CLUSTER } from "./config";
import { isUserRejection } from "./provider";

/** Replace with the program ID after deploying from Solana Playground. */
const DEFAULT_FILE_RECORD_PROGRAM_ID =
  "Fg6PaFpoGVkY9jXjCqYj9jXjCqYj9jXjCqYj9jXjCqYj";

export const FILE_RECORD_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_SOLANA_FILE_RECORD_PROGRAM_ID ??
    DEFAULT_FILE_RECORD_PROGRAM_ID,
);

const INSTRUCTION_DISCRIMINATORS = {
  anchorFile: Buffer.from("7ecfb0be9dac1f37", "hex"),
  deleteFile: Buffer.from("3c952169b827e6eb", "hex"),
  restoreFile: Buffer.from("7efaf0c139a6900e", "hex"),
};

export interface FileRecordResult {
  signature: string;
  network: string;
  walletAddress: string;
  programId: string;
  recordPda: string;
  workspacePda: string;
}

export const OnChainStorageTier = {
  OffChain: 0,
  OnChain: 1,
} as const;
export type OnChainStorageTier = (typeof OnChainStorageTier)[keyof typeof OnChainStorageTier];

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function hashToBytes(hexHash: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(hexHash)) {
    throw new Error("Invalid content hash; expected 64 hex characters.");
  }
  return Buffer.from(hexHash, "hex");
}

export function deriveWorkspacePda(workspaceId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("workspace"), uuidToBytes(workspaceId)],
    FILE_RECORD_PROGRAM_ID,
  );
  return pda;
}

export function deriveFileRecordPda(
  workspaceId: string,
  contentHash: string,
): PublicKey {
  const workspacePda = deriveWorkspacePda(workspaceId);
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("file-record"),
      workspacePda.toBuffer(),
      hashToBytes(contentHash),
    ],
    FILE_RECORD_PROGRAM_ID,
  );
  return pda;
}

function buildAnchorFileInstruction(
  signer: PublicKey,
  workspacePda: PublicKey,
  recordPda: PublicKey,
  contentHash: string,
  storageTier: number,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: FILE_RECORD_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: workspacePda, isSigner: false, isWritable: false },
      { pubkey: recordPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      INSTRUCTION_DISCRIMINATORS.anchorFile,
      hashToBytes(contentHash),
      Buffer.from([storageTier]),
    ]),
  });
}

function buildDeleteRestoreInstruction(
  signer: PublicKey,
  recordPda: PublicKey,
  discriminator: Buffer,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: FILE_RECORD_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: recordPda, isSigner: false, isWritable: true },
    ],
    data: discriminator,
  });
}

async function resolveSigner(
  signer?: Keypair,
): Promise<{ payer: PublicKey; walletAddress: string; signer?: Keypair }> {
  if (signer) {
    return {
      payer: signer.publicKey,
      walletAddress: signer.publicKey.toBase58(),
      signer,
    };
  }
  const { connectWallet } = await import("./provider");
  const { provider, walletAddress } = await connectWallet();
  if (!provider.signAndSendTransaction) {
    throw new Error(
      "This wallet does not support sending transactions. Use Phantom or Solflare.",
    );
  }
  return { payer: new PublicKey(walletAddress), walletAddress };
}

async function submitTransaction(
  tx: Transaction,
  signer?: Keypair,
): Promise<{ signature: string }> {
  const conn = getConnection();
  try {
    if (signer) {
      tx.sign(signer);
      const signature = await conn.sendRawTransaction(tx.serialize(), {
        preflightCommitment: "confirmed",
      });
      await conn.confirmTransaction(signature, "confirmed");
      return { signature };
    }
    const { connectWallet } = await import("./provider");
    const { provider } = await connectWallet();
    return await provider.signAndSendTransaction!(tx);
  } catch (err) {
    if (isUserRejection(err)) {
      throw new Error("Transaction cancelled in wallet.");
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Anchor a file hash via the File Record program.
 * Falls back to the memo path if no program ID is configured.
 */
export async function anchorFileRecord(
  workspaceId: string,
  contentHash: string,
  signer?: Keypair,
  storageTier: number = OnChainStorageTier.OffChain,
): Promise<FileRecordResult> {
  const workspacePda = deriveWorkspacePda(workspaceId);
  const recordPda = deriveFileRecordPda(workspaceId, contentHash);

  const { payer, walletAddress, signer: resolvedSigner } = await resolveSigner(signer);
  const ix = buildAnchorFileInstruction(
    payer,
    workspacePda,
    recordPda,
    contentHash,
    storageTier,
  );

  const conn = getConnection();
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.feePayer = payer;
  tx.recentBlockhash = blockhash;
  tx.add(ix);

  const { signature } = await submitTransaction(tx, resolvedSigner);

  return {
    signature,
    network: SOLANA_CLUSTER,
    walletAddress,
    programId: FILE_RECORD_PROGRAM_ID.toBase58(),
    workspacePda: workspacePda.toBase58(),
    recordPda: recordPda.toBase58(),
  };
}

/** Record an on-chain soft-delete attestation for a file. */
export async function deleteFileRecord(
  workspaceId: string,
  contentHash: string,
  signer?: Keypair,
): Promise<FileRecordResult> {
  const workspacePda = deriveWorkspacePda(workspaceId);
  const recordPda = deriveFileRecordPda(workspaceId, contentHash);

  const { payer, walletAddress, signer: resolvedSigner } = await resolveSigner(signer);
  const ix = buildDeleteRestoreInstruction(
    payer,
    recordPda,
    INSTRUCTION_DISCRIMINATORS.deleteFile,
  );

  const conn = getConnection();
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.feePayer = payer;
  tx.recentBlockhash = blockhash;
  tx.add(ix);

  const { signature } = await submitTransaction(tx, resolvedSigner);

  return {
    signature,
    network: SOLANA_CLUSTER,
    walletAddress,
    programId: FILE_RECORD_PROGRAM_ID.toBase58(),
    workspacePda: workspacePda.toBase58(),
    recordPda: recordPda.toBase58(),
  };
}

/** Clear the on-chain deletion flag for a file. */
export async function restoreFileRecord(
  workspaceId: string,
  contentHash: string,
  signer?: Keypair,
): Promise<FileRecordResult> {
  const workspacePda = deriveWorkspacePda(workspaceId);
  const recordPda = deriveFileRecordPda(workspaceId, contentHash);

  const { payer, walletAddress, signer: resolvedSigner } = await resolveSigner(signer);
  const ix = buildDeleteRestoreInstruction(
    payer,
    recordPda,
    INSTRUCTION_DISCRIMINATORS.restoreFile,
  );

  const conn = getConnection();
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.feePayer = payer;
  tx.recentBlockhash = blockhash;
  tx.add(ix);

  const { signature } = await submitTransaction(tx, resolvedSigner);

  return {
    signature,
    network: SOLANA_CLUSTER,
    walletAddress,
    programId: FILE_RECORD_PROGRAM_ID.toBase58(),
    workspacePda: workspacePda.toBase58(),
    recordPda: recordPda.toBase58(),
  };
}

/** True when a dedicated File Record program ID is configured. */
export function isFileRecordProgramConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SOLANA_FILE_RECORD_PROGRAM_ID);
}
