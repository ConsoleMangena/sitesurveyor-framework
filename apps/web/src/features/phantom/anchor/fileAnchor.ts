/**
 * Anchoring a workspace file on Solana.
 *
 * The file itself stays in Supabase storage. Only its SHA-256 digest is written
 * to the chain, as a memo signed by the connected wallet: that proves the exact
 * bytes existed at `anchored_at` and lets anyone re-hash the object later to
 * check it has not been altered.
 *
 * The memo is versioned (`ssv1`) and self-describing, so a chain reader can tie
 * a signature back to the attachment row without any off-chain index.
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
import { SOLANA_CLUSTER, SOLANA_CLUSTER_LABEL } from "../lib/config.ts";
import { isUserRejection } from "../lib/provider.ts";
import { getConnection } from "../payments/phantomPay.ts";

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

/** Memo v3 data is a little-endian u32 length prefix followed by the UTF-8 text. */
export function encodeMemoData(memo: string): Buffer {
  const text = Buffer.from(memo, "utf8");
  const data = Buffer.alloc(4 + text.length);
  data.writeUInt32LE(text.length, 0);
  text.copy(data, 4);
  return data;
}

export function buildAnchorInstruction(
  memo: string,
  signer: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
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
  transaction.add(buildAnchorInstruction(memo, signer));
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
}

type AnchorableAttachment = Pick<
  AttachmentRow,
  "id" | "workspace_id" | "content_hash"
>;

/**
 * Sign, send, confirm and record a file anchor. Every step after the wallet
 * returns a signature is written to the attachment row, so the UI can always
 * show where the attempt ended.
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
  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  let signature: string;
  try {
    signature = await signer.sendTransaction(
      buildAnchorTransaction(memo, wallet, blockhash),
      connection,
    );
  } catch (err) {
    // Nothing was sent, so the row is left exactly as it was.
    if (isUserRejection(err)) {
      throw new Error("Anchor cancelled in wallet.");
    }
    throw err instanceof Error ? err : new Error(String(err));
  }

  await markAttachmentAnchorPending(attachment, {
    signature,
    network: SOLANA_CLUSTER,
  });

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
  await saveAttachmentAnchor(attachment, {
    signature,
    network: SOLANA_CLUSTER,
    status: "anchored",
    anchoredAt,
  });

  return { signature, memo, network: SOLANA_CLUSTER, anchoredAt };
}
