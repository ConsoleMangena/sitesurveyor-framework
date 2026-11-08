/**
 * `market-verify-payment` — mark a marketplace payment completed, from chain.
 *
 * The browser can send a transfer and tell us its signature, but a signature is
 * a claim, not a receipt: the `guard_marketplace_order_status` trigger rejects
 * "completed" from any non-privileged role, so this function (service role) is
 * the only path to that status.
 *
 * Request: `{ order_id: string }` with the buyer's bearer token.
 * Response: `{ verified: true, status }` or `{ verified: false, reason }`.
 *
 * What is checked, in order:
 *   1. The caller is signed in and belongs to the order's buyer workspace.
 *   2. The order is `submitted` and carries a signature.
 *   3. `getTransaction` finds it, it did not fail, and it is confirmed/finalized.
 *   4. The transaction actually pays the order's seller wallet at least the
 *      order amount - native SOL, or an SPL transfer of the order's currency.
 *
 * Nothing here trusts a client-supplied amount, address or status.
 */

import { adminClient, corsHeaders, getCaller, json } from "../_shared/supabase.ts";

const SOLANA_CLUSTER =
  (Deno.env.get("SOLANA_CLUSTER") as "devnet" | "mainnet-beta" | "testnet") ??
    "devnet";

const DEFAULT_RPC_URL: Record<string, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  testnet: "https://api.testnet.solana.com",
};

const RPC_URL = Deno.env.get("SOLANA_RPC_URL") ?? DEFAULT_RPC_URL[SOLANA_CLUSTER];
const FETCH_TIMEOUT_MS = 12_000;
/** Native SOL has nine decimals; quoted prices are whole tokens. */
const LAMPORTS_PER_SOL = 1_000_000_000;

/** Circle's canonical USDC mints; overridable per deployment. */
const DEFAULT_USDC_MINT: Record<string, string> = {
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  testnet: "CpMah17kQEL2wqyMKt3mZBdTnZbkbfx4nqmQMFDP5vwp",
};
const USDC_MINT = Deno.env.get("SOLANA_USDC_MINT") ?? DEFAULT_USDC_MINT[SOLANA_CLUSTER];

interface TransactionMeta {
  err?: unknown;
  preBalances?: number[];
  postBalances?: number[];
  preTokenBalances?: Array<{ accountIndex: number; mint: string; owner?: string; uiTokenAmount?: { amount?: string; decimals?: number } }>;
  postTokenBalances?: Array<{ accountIndex: number; mint: string; owner?: string; uiTokenAmount?: { amount?: string; decimals?: number } }>;
}

interface TransactionResult {
  meta?: TransactionMeta | null;
  transaction?: {
    message?: { accountKeys?: Array<{ pubkey?: string } | string> };
  } | null;
}

function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Solana RPC failed (${response.status})`);
      return response.json();
    })
    .then((envelope: { result?: unknown; error?: { message?: string } }) => {
      if (envelope.error) {
        throw new Error(envelope.error.message ?? "Solana RPC error");
      }
      return envelope.result;
    })
    .finally(() => clearTimeout(timer));
}

/**
 * Native SOL: the destination's lamport balance must have grown by at least the
 * amount. Fee payer is normally the buyer, so pre/post balances are enough and
 * no amount is taken from client input.
 */
function nativeTransferCovers(
  tx: TransactionResult,
  destination: string,
  amount: number,
): boolean {
  const meta = tx.meta;
  const keys = tx.transaction?.message?.accountKeys ?? [];
  if (!meta?.preBalances || !meta.postBalances) return false;

  const index = keys.findIndex((key) =>
    typeof key === "string" ? key === destination : key?.pubkey === destination
  );
  if (index < 0) return false;

  const delta = (meta.postBalances[index] ?? 0) - (meta.preBalances[index] ?? 0);
  return delta >= Math.floor(amount * LAMPORTS_PER_SOL);
}

/**
 * SPL (e.g. USDC): the destination owner's balance for the order's mint must
 * have grown by at least the amount. A freshly created associated account has
 * no pre-balance entry, which is why the "before" total defaults to zero.
 */
function tokenTransferCovers(
  tx: TransactionResult,
  destination: string,
  amount: number,
  mint: string,
): boolean {
  const meta = tx.meta;
  if (!meta?.postTokenBalances && !meta?.preTokenBalances) return false;

  const total = (entries: TransactionMeta["postTokenBalances"]) =>
    (entries ?? []).reduce((sum, entry) => {
      if (entry.mint !== mint) return sum;
      if ((entry.owner ?? "") !== destination) return sum;
      const raw = Number(entry.uiTokenAmount?.amount ?? "0");
      const decimals = entry.uiTokenAmount?.decimals ?? 0;
      return sum + raw / 10 ** decimals;
    }, 0);

  const change = total(meta.postTokenBalances) - total(meta.preTokenBalances);
  // Token amounts are floats in ui units; allow a rounding hair.
  return change + 1e-9 >= amount;
}

function parseBody(value: unknown): { order_id: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const orderId = record.order_id;
  return typeof orderId === "string" && orderId.trim() !== ""
    ? { order_id: orderId.trim() }
    : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ verified: false, reason: "Use POST." }, 405);
  }

  const body = parseBody(await request.json().catch(() => null));
  if (!body) {
    return json({ verified: false, reason: "order_id is required." }, 400);
  }

  const admin = adminClient();

  // 1. Who is asking, and may they see this order?
  const caller = await getCaller(request);
  if (!caller) {
    return json({ verified: false, reason: "Sign in to confirm this payment." }, 401);
  }
  const userId = caller.id;

  const { data: order, error: orderError } = await admin
    .from("marketplace_orders")
    .select("id, buyer_workspace_id, amount, currency, external_payment_ref, payment_status, metadata")
    .eq("id", body.order_id)
    .maybeSingle();

  if (orderError) {
    return json({ verified: false, reason: orderError.message }, 500);
  }
  if (!order) {
    return json({ verified: false, reason: "That order was not found." }, 404);
  }

  const { data: membership } = await admin
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", order.buyer_workspace_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return json({ verified: false, reason: "That order belongs to another workspace." }, 403);
  }

  if (order.payment_status === "completed") {
    return json({ verified: true, status: "completed" });
  }
  if (order.payment_status !== "submitted" || !order.external_payment_ref) {
    return json({ verified: false, reason: "No transaction has been submitted for this order yet." }, 409);
  }

  // 2. Where should the money have gone?
  const metadata = (order.metadata ?? {}) as Record<string, unknown>;
  const destination = typeof metadata.seller_wallet_address === "string"
    ? metadata.seller_wallet_address
    : null;
  if (!destination) {
    return json({ verified: false, reason: "This order has no seller wallet recorded." }, 409);
  }

  // 3. What actually landed on chain?
  let tx: TransactionResult | null = null;
  try {
    tx = (await rpcCall("getTransaction", [
      order.external_payment_ref,
      { commitment: "confirmed", maxSupportedTransactionVersion: 0, encoding: "json" },
    ])) as TransactionResult | null;
  } catch (error) {
    return json(
      {
        verified: false,
        reason: error instanceof Error
          ? `Could not reach the Solana cluster: ${error.message}`
          : "Could not reach the Solana cluster.",
      },
      502,
    );
  }

  if (!tx) {
    return json({ verified: false, reason: "The transaction is not confirmed yet. Try again shortly." }, 409);
  }
  if (tx.meta?.err) {
    return json({ verified: false, reason: "That transaction failed on chain." }, 409);
  }

  const amount = Number(order.amount);
  const currency = (order.currency ?? "").toUpperCase();
  const paid = currency === "SOL"
    ? nativeTransferCovers(tx, destination, amount)
    : tokenTransferCovers(tx, destination, amount, USDC_MINT);

  if (!paid) {
    return json(
      {
        verified: false,
        reason: `The transaction does not pay ${amount} ${currency || "tokens"} to the seller wallet.`,
      },
      409,
    );
  }

  // 4. Only now is "completed" true.
  const { error: updateError } = await admin
    .from("marketplace_orders")
    .update({ payment_status: "completed", updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("payment_status", "submitted");

  if (updateError) {
    return json({ verified: false, reason: updateError.message }, 500);
  }

  return json({ verified: true, status: "completed" });
});
