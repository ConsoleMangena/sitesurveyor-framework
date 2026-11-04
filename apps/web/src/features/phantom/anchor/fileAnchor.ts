/**
 * Anchoring a workspace file on Solana.
 *
 * The file itself stays in Supabase storage. Only its SHA-256 digest is written
 * to the chain, as a memo signed by the connected wallet: that proves the exact
 * bytes existed at `anchored_at` and lets anyone re-hash the object later to
 * check it has not been altered.
 *
 * The memo is versioned (`ssv1`) and self-describing, so a chain reader can tie
 * a signature back to the attachment row without any off-chain index. The
 * hybrid chunked flow (`ssv2`) lives in ./fullFileAnchorRunner.ts and shares the
 * transaction builders and helpers below.
 */

import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import type { AttachmentRow } from "../../../lib/repositories/attachments.ts";
import {
  markAttachmentAnchorPending,
  saveAttachmentAnchor,
} from "../../../lib/repositories/attachments.ts";
import {
  createAnchorOperation,
  linkAttachmentAnchor,
  updateAnchorOperation,
} from "../../../lib/repositories/fileAnchors.ts";
import { SOLANA_CLUSTER, SOLANA_CLUSTER_LABEL } from "../lib/config.ts";
import { isUserRejection } from "../lib/provider.ts";
import { getWalletBalanceLamports } from "../lib/solanaRpc.ts";
import { getConnection } from "../payments/phantomPay.ts";

export const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Memo program v3. A native program on every Solana cluster, so it needs no
 * account funding and costs only the base transaction fee.
 */
export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

/** The part of a connected wallet an anchor needs: a key it can sign with. */
export interface AnchorSigner {
  publicKey: PublicKey | null;
  sendTransaction(transaction: Transaction, connection: Connection): Promise<string>;
}

export interface AnchorTransactionOptions {
  connection?: Connection;
  timeoutMs?: number;
  intervalMs?: number;
}

/**
 * The on-chain statement for one file version. Lower-casing the digest keeps
 * memos comparable as plain strings: RPC explorers and hashes differ in case.
 */
export function buildAnchorMemo(attachmentId: string, contentHash: string): string {
  return `ssv1:${attachmentId}:sha256:${contentHash.trim().toLowerCase()}`;
}

/**
 * Memo v3 instruction data is the raw UTF-8 message. The transaction wire format
 * already length-prefixes instruction data, and a length byte above 0x7F is not
 * valid UTF-8 on its own — so any memo of 128 bytes or more that carries an extra
 * prefix is rejected by the program, and the wallet reports it as a send failure.
 */
export function encodeMemoData(memo: string): Buffer {
  return Buffer.from(memo, "utf8");
}

export function buildAnchorInstruction(memo: string): TransactionInstruction {
  // Memo program v3 takes no accounts — the transaction feePayer is the author.
  // Including an explicit signer key causes "Missing signature" errors.
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: encodeMemoData(memo),
  });
}

/**
 * A classic (non-versioned) transaction: the built-in SiteSurveyor wallet
 * vault advertises `supportedTransactionVersions: null` and rejects versioned
 * messages, and a single-instruction memo never needs them.
 */
export function buildAnchorTransaction(
  memo: string,
  signer: PublicKey,
  recentBlockhash: string,
): Transaction {
  const transaction = new Transaction();
  transaction.feePayer = signer;
  transaction.recentBlockhash = recentBlockhash;
  transaction.add(buildAnchorInstruction(memo));
  return transaction;
}

/** Network fee, in lamports, for anchoring this memo. */
export async function estimateAnchorFeeLamports(
  memo: string,
  signer: PublicKey,
  connection: Connection = getConnection(),
): Promise<number> {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const transaction = buildAnchorTransaction(memo, signer, blockhash);
  const { value } = await connection.getFeeForMessage(
    transaction.compileMessage(),
    "confirmed",
  );
  return value ?? 0;
}

/**
 * The connected wallet pays the network fee out of its own SOL. Anchoring never
 * touches the workspace's credit or wallet balance, so a wallet that cannot
 * cover the fee is reported before any transaction is signed.
 */
export async function assertAnchorFeeAffordable(
  memo: string,
  wallet: PublicKey,
  connection: Connection = getConnection(),
): Promise<number> {
  const feeLamports = await estimateAnchorFeeLamports(memo, wallet, connection);
  const balanceLamports = await getWalletBalanceLamports(wallet.toBase58());
  if (balanceLamports < feeLamports) {
    throw new Error(
      `Not enough SOL in ${wallet.toBase58().slice(0, 8)}… to pay the ~${(feeLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL network fee.`,
    );
  }
  return feeLamports;
}

/** Slot and charged fee of a landed transaction, when the RPC will still tell us. */
export async function readConfirmedTransaction(
  connection: Connection,
  signature: string,
): Promise<{ slot: number | null; fee: number | null } | null> {
  try {
    const { value } = await connection.getSignatureStatuses([signature]);
    const transaction = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    return {
      slot: transaction?.slot ?? value?.[0]?.slot ?? null,
      fee: transaction?.meta?.fee ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Wait for a signature with status polling. The Supabase `solana-data` proxy is
 * read-only and public RPC websocket streams are unreliable from the browser,
 * so `confirmTransaction` is deliberately not used.
 */
export async function waitForAnchorConfirmation(
  signature: string,
  options: AnchorTransactionOptions = {},
): Promise<void> {
  const connection = options.connection ?? getConnection();
  const intervalMs = options.intervalMs ?? 2000;
  const deadline = Date.now() + (options.timeoutMs ?? 60000);

  while (Date.now() < deadline) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status) {
      if (status.err) {
        const reason =
          typeof status.err === "object"
            ? Object.keys(status.err)[0] ?? "unknown"
            : String(status.err);
        throw new Error(`The anchor transaction failed on-chain (${reason}).`);
      }
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Solana did not confirm the anchor in time. Check signature ${signature.slice(0, 8)}… on ${SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER]}.`,
  );
}

export interface AnchorOutcome {
  signature: string;
  memo: string;
  network: string;
  anchoredAt: string;
  operationId: string;
  feeLamports: number;
}

type AnchorableAttachment = Pick<
  AttachmentRow,
  | "id"
  | "workspace_id"
  | "content_hash"
  | "bucket_name"
  | "storage_path"
  | "size_bytes"
  | "mime_type"
>;

/** Thrown when the wallet owner declines to sign: the attempt is cancelled, not broken. */
export class AnchorCancelledError extends Error {}

function fileNameOf(attachment: AnchorableAttachment): string {
  const segments = attachment.storage_path.split("/");
  return segments[segments.length - 1] || attachment.id;
}

/**
 * Sign, send, confirm and record a file anchor. Every stage lives as a row in
 * `file_anchor_operations`, so a failed attempt is inspectable and retryable
 * instead of a message that scrolls past.
 */
export async function anchorAttachment(
  attachment: AnchorableAttachment,
  signer: AnchorSigner,
  options: AnchorTransactionOptions = {},
): Promise<AnchorOutcome> {
  const wallet = signer.publicKey;
  if (!wallet) throw new Error("Connect a Solana wallet before anchoring a file.");
  if (!attachment.content_hash) {
    throw new Error("This file has no recorded hash, so there is nothing to anchor.");
  }

  const connection = options.connection ?? getConnection();
  const memo = buildAnchorMemo(attachment.id, attachment.content_hash);

  const operation = await createAnchorOperation({
    workspaceId: attachment.workspace_id,
    attachmentId: attachment.id,
    mode: "hash",
    bucketName: attachment.bucket_name,
    network: SOLANA_CLUSTER,
    fileName: fileNameOf(attachment),
    fileSizeBytes: attachment.size_bytes ?? 0,
    mimeType: attachment.mime_type,
    fileHash: attachment.content_hash,
  });

  try {
    const feeLamports = await assertAnchorFeeAffordable(memo, wallet, connection);
    await updateAnchorOperation(operation.id, {
      status: "submitting",
      memo,
      wallet_address: wallet.toBase58(),
      fee_lamports: feeLamports,
    });

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    let signature: string;
    try {
      signature = await signer.sendTransaction(
        buildAnchorTransaction(memo, wallet, blockhash),
        connection,
      );
    } catch (err) {
      if (isUserRejection(err)) {
        throw new AnchorCancelledError("Anchor cancelled in wallet.");
      }
      throw err instanceof Error ? err : new Error(String(err));
    }

    await updateAnchorOperation(operation.id, { status: "submitted", tx_signature: signature });
    await markAttachmentAnchorPending(attachment, {
      signature,
      network: SOLANA_CLUSTER,
    });

    await updateAnchorOperation(operation.id, { status: "confirming" });
    try {
      await waitForAnchorConfirmation(signature, { ...options, connection });
    } catch (err) {
      await saveAttachmentAnchor(attachment, {
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
    await saveAttachmentAnchor(attachment, {
      signature,
      network: SOLANA_CLUSTER,
      status: "anchored",
      anchoredAt,
    });
    await linkAttachmentAnchor(attachment.id, attachment.workspace_id, {
      mode: "hash",
      operationId: operation.id,
      feeLamports: confirmed?.fee ?? feeLamports,
    });

    return {
      signature,
      memo,
      network: SOLANA_CLUSTER,
      anchoredAt,
      operationId: operation.id,
      feeLamports: confirmed?.fee ?? feeLamports,
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
