/**
 * Supabase Edge Function: solana-pay-verify
 *
 * POST /solana-pay-verify
 *   {
 *     workspaceId: string,
 *     invoiceId:   string,
 *     signature:   string,   // Solana tx signature (base58)
 *     reference:   string,   // base58 reference pubkey embedded in the transfer
 *     walletAddress: string  // payer wallet (base58)
 *   }
 *   → { paymentId: string, alreadyRecorded: boolean }
 *
 * Trust model: the client is never trusted for payment proof. This function
 * independently fetches the confirmed transaction from a Solana RPC node and
 * checks, on-chain, that:
 *   1. the transaction succeeded,
 *   2. it transferred the configured USDC mint,
 *   3. the recipient is the configured treasury,
 *   4. the amount equals the invoice total (USDC == USD, 1:1),
 *   5. the supplied reference pubkey appears in the transaction account keys.
 *
 * Only then is a `payments` row inserted. The UNIQUE index on
 * `payments.tx_signature` makes the insert idempotent: a replayed signature
 * resolves to the existing row instead of double-recording.
 *
 * Required function env (set via `supabase secrets set`):
 *   SOLANA_RPC_URL           e.g. https://api.devnet.solana.com
 *   SOLANA_USDC_MINT         USDC SPL mint for the target cluster
 *   SOLANA_TREASURY_ADDRESS  recipient wallet (base58)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const USDC_DECIMALS = 6;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const RPC_URL = Deno.env.get("SOLANA_RPC_URL");
  const USDC_MINT = Deno.env.get("SOLANA_USDC_MINT");
  const TREASURY = Deno.env.get("SOLANA_TREASURY_ADDRESS");

  if (!RPC_URL || !USDC_MINT || !TREASURY) {
    return json(
      { error: "Server not configured for on-chain payments." },
      500,
    );
  }

  let body: {
    workspaceId?: string;
    invoiceId?: string;
    signature?: string;
    reference?: string;
    walletAddress?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { workspaceId, invoiceId, signature, reference, walletAddress } = body;
  if (!workspaceId || !invoiceId || !signature || !reference) {
    return json(
      { error: "workspaceId, invoiceId, signature and reference are required" },
      400,
    );
  }

  // ── Authenticate the caller ──────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
    token,
  );
  if (userErr || !userData?.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const userId = userData.user.id;

  // Caller must be a member of the workspace.
  const { data: membership } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) {
    return json({ error: "Not a member of this workspace" }, 403);
  }

  // ── Idempotency: short-circuit if this signature is already recorded ──────
  const { data: existing } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("tx_signature", signature)
    .maybeSingle();
  if (existing) {
    return json({ paymentId: existing.id, alreadyRecorded: true });
  }

  // ── Load the invoice (amount + workspace scoping) ─────────────────────────
  const { data: invoice, error: invErr } = await supabaseAdmin
    .from("invoices")
    .select("id, total, workspace_id")
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (invErr || !invoice) {
    return json({ error: "Invoice not found" }, 404);
  }
  const expectedBaseUnits = BigInt(
    Math.round(Number(invoice.total) * 10 ** USDC_DECIMALS),
  );

  // ── Fetch and verify the transaction on-chain ─────────────────────────────
  let tx: SolanaTransaction | null;
  try {
    tx = await fetchTransaction(RPC_URL, signature);
  } catch (e) {
    return json({ error: `RPC error: ${(e as Error).message}` }, 502);
  }
  if (!tx) {
    return json({ error: "Transaction not found or not yet confirmed" }, 404);
  }
  if (tx.meta?.err) {
    return json({ error: "Transaction failed on-chain" }, 400);
  }

  const accountKeys = collectAccountKeys(tx);

  // 1. Reference key must be present in the transaction.
  if (!accountKeys.includes(reference)) {
    return json({ error: "Reference not found in transaction" }, 400);
  }

  // 2/3/4. Verify a USDC transfer to the treasury for the invoice amount,
  // using the token balance deltas in the transaction meta.
  const delta = treasuryUsdcDelta(tx, TREASURY, USDC_MINT);
  if (delta === null) {
    return json(
      { error: "No USDC transfer to treasury found in transaction" },
      400,
    );
  }
  if (delta !== expectedBaseUnits) {
    return json(
      {
        error: `Amount mismatch: received ${delta}, expected ${expectedBaseUnits}`,
      },
      400,
    );
  }

  // ── Record the payment (UNIQUE tx_signature guards against races) ─────────
  const amount = Number(delta) / 10 ** USDC_DECIMALS;
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("payments")
    .insert({
      workspace_id: workspaceId,
      invoice_id: invoiceId,
      amount,
      paid_on: new Date().toISOString().slice(0, 10),
      payment_method: "Solana (USDC)",
      reference,
      tx_signature: signature,
      chain: "solana",
      wallet_address: walletAddress ?? null,
      token_mint: USDC_MINT,
      created_by: userId,
    })
    .select("id")
    .single();

  if (insertErr) {
    // Unique violation → another request won the race; return existing row.
    const { data: raced } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("tx_signature", signature)
      .maybeSingle();
    if (raced) return json({ paymentId: raced.id, alreadyRecorded: true });
    return json({ error: insertErr.message }, 500);
  }

  return json({ paymentId: inserted.id, alreadyRecorded: false });
});

// ── Solana RPC helpers ─────────────────────────────────────────────────────

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

interface SolanaTransaction {
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  } | null;
  transaction: {
    message: {
      accountKeys?: string[];
      staticAccountKeys?: string[];
    };
  };
}

async function fetchTransaction(
  rpcUrl: string,
  signature: string,
): Promise<SolanaTransaction | null> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [
        signature,
        { commitment: "confirmed", maxSupportedTransactionVersion: 0 },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();
  if (payload.error) throw new Error(payload.error.message ?? "RPC error");
  return payload.result as SolanaTransaction | null;
}

function collectAccountKeys(tx: SolanaTransaction): string[] {
  const msg = tx.transaction.message;
  const keys = msg.accountKeys ?? msg.staticAccountKeys ?? [];
  // Account keys may be objects ({pubkey}) for jsonParsed; we requested json
  // (default) so they are plain base58 strings.
  return keys.map((k) => (typeof k === "string" ? k : (k as { pubkey: string }).pubkey));
}

/**
 * Net change (in base units) of the treasury owner's USDC balance for the
 * given mint. Returns null when no matching token account is present.
 */
function treasuryUsdcDelta(
  tx: SolanaTransaction,
  treasury: string,
  mint: string,
): bigint | null {
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];

  const matches = (b: TokenBalance) => b.mint === mint && b.owner === treasury;

  const postBal = post.find(matches);
  if (!postBal) return null;

  const preBal = pre.find(
    (b) => b.accountIndex === postBal.accountIndex && matches(b),
  );

  const postAmount = BigInt(postBal.uiTokenAmount.amount);
  const preAmount = preBal ? BigInt(preBal.uiTokenAmount.amount) : 0n;
  const delta = postAmount - preAmount;
  return delta > 0n ? delta : null;
}
