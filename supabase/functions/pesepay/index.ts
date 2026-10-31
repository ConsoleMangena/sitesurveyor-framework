import { adminClient, corsHeaders, getCaller, json } from "../_shared/supabase.ts";

const PESEPAY_PRODUCTION_URL = "https://api.pesepay.com/api/payments-engine/v1";
const PESEPAY_SANDBOX_URL = "https://api.test.sandbox.pesepay.com/payments-engine/v1";

const STORAGE_PLANS = {
  "10gb": { label: "10 GB", storageMb: 10 * 1024, amount: 5, currencyCode: "USD" },
  "50gb": { label: "50 GB", storageMb: 50 * 1024, amount: 15, currencyCode: "USD" },
  "100gb": { label: "100 GB", storageMb: 100 * 1024, amount: 30, currencyCode: "USD" },
} as const;

type Transaction = {
  referenceNumber?: string;
  redirectUrl?: string;
  transactionStatus?: string;
  amountDetails?: { amount?: number; currencyCode?: string };
};

type WalletTransaction = {
  id: string;
  wallet_id: string;
  workspace_id: string;
  user_id: string;
  kind: string;
  status: string;
  amount: number;
  currency_code: string;
  pesepay_reference: string | null;
};

type CheckoutInput = {
  amount: number;
  currencyCode: string;
  reasonForPayment: string;
  merchantReference: string;
  returnUrl: string;
};

function requireKey(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function encrypt(value: unknown, keyText: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(keyText);
  const iv = keyBytes.slice(0, 16);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return bytesToBase64(new Uint8Array(encrypted));
}

async function decrypt(payload: string, keyText: string): Promise<Transaction> {
  const keyBytes = new TextEncoder().encode(keyText);
  const iv = keyBytes.slice(0, 16);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, base64ToBytes(payload));
  return JSON.parse(new TextDecoder().decode(decrypted)) as Transaction;
}

function apiBase(): string {
  return Deno.env.get("PESEPAY_ENVIRONMENT") === "production"
    ? PESEPAY_PRODUCTION_URL
    : PESEPAY_SANDBOX_URL;
}

async function pesepayRequest(
  path: string,
  init: RequestInit,
  encryptionKey: string,
): Promise<Transaction> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      authorization: requireKey("PESEPAY_INTEGRATION_KEY"),
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json() as { payload?: string; message?: string };
  if (!response.ok || !body.payload) {
    throw new Error(body.message || `Pesepay request failed (${response.status})`);
  }
  return decrypt(body.payload, encryptionKey);
}

async function createCheckout(input: CheckoutInput): Promise<Transaction> {
  const encryptionKey = requireKey("PESEPAY_ENCRYPTION_KEY");
  return pesepayRequest("/payments/initiate", {
    method: "POST",
    body: JSON.stringify({
      payload: await encrypt({
        amountDetails: { amount: input.amount, currencyCode: input.currencyCode },
        reasonForPayment: input.reasonForPayment,
        merchantReference: input.merchantReference,
        resultUrl: `${requireKey("SUPABASE_URL")}/functions/v1/pesepay`,
        returnUrl: input.returnUrl,
      }, encryptionKey),
    }),
  }, encryptionKey);
}

async function checkPayment(reference: string): Promise<Transaction> {
  const encryptionKey = requireKey("PESEPAY_ENCRYPTION_KEY");
  return pesepayRequest(
    `/payments/check-payment?referenceNumber=${encodeURIComponent(reference)}`,
    { method: "GET" },
    encryptionKey,
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isFailedStatus(status: string | undefined): boolean {
  return ["FAILED", "CANCELLED", "CANCELED"].includes(status ?? "");
}

async function getMembership(
  admin: ReturnType<typeof adminClient>,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await admin
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function settleWalletDeposit(
  admin: ReturnType<typeof adminClient>,
  deposit: WalletTransaction,
  verified: Transaction,
): Promise<void> {
  const amount = verified.amountDetails?.amount;
  const currency = verified.amountDetails?.currencyCode;
  if (!deposit.pesepay_reference || typeof amount !== "number" || !currency) {
    throw new Error("Pesepay returned incomplete wallet deposit details");
  }
  const { error } = await admin.rpc("settle_workspace_pesepay_deposit", {
    p_reference: deposit.pesepay_reference,
    p_amount: amount,
    p_currency_code: currency,
  });
  if (error) throw error;
}

async function settleCallback(
  req: Request,
  admin: ReturnType<typeof adminClient>,
): Promise<Response> {
  const callback = await req.json() as Transaction;
  const reference = callback.referenceNumber?.trim();
  if (!reference) return json({ error: "missing referenceNumber" }, 400);

  const verified = await checkPayment(reference);
  const { data: deposit, error: depositError } = await admin
    .from("workspace_pesepay_transactions")
    .select("id, wallet_id, workspace_id, user_id, kind, status, amount, currency_code, pesepay_reference")
    .eq("pesepay_reference", reference)
    .eq("kind", "deposit")
    .maybeSingle();
  if (depositError) throw depositError;

  if (verified.transactionStatus !== "SUCCESS") {
    if (deposit && isFailedStatus(verified.transactionStatus)) {
      const { error } = await admin
        .from("workspace_pesepay_transactions")
        .update({ status: "failed" })
        .eq("id", deposit.id)
        .eq("status", "pending");
      if (error) throw error;
    }
    return json({ accepted: true }, 200);
  }

  if (deposit) {
    await settleWalletDeposit(admin, deposit, verified);
    return json({ accepted: true }, 200);
  }

  const { data: invoice, error: invoiceError } = await admin
    .from("invoices")
    .select("id, workspace_id, invoice_number, total, currency_code, status, pesepay_reference")
    .eq("pesepay_reference", reference)
    .maybeSingle();
  if (invoiceError) throw invoiceError;
  if (!invoice) return json({ accepted: true }, 200);

  const amount = verified.amountDetails?.amount;
  const currency = verified.amountDetails?.currencyCode;
  if (typeof amount !== "number" || Math.abs(amount - Number(invoice.total)) > 0.01 || currency !== invoice.currency_code) {
    throw new Error("Pesepay amount or currency does not match the invoice");
  }
  if (invoice.status === "paid") return json({ accepted: true }, 200);

  const { data: existing } = await admin
    .from("payments")
    .select("id")
    .eq("reference", reference)
    .maybeSingle();
  if (!existing) {
    const { error: paymentError } = await admin.from("payments").insert({
      workspace_id: invoice.workspace_id,
      invoice_id: invoice.id,
      amount,
      paid_on: new Date().toISOString().slice(0, 10),
      payment_method: "Pesepay",
      reference,
      notes: `Invoice ${invoice.invoice_number} paid via Pesepay`,
    });
    if (paymentError) throw paymentError;
  }
  const { error: updateError } = await admin
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", invoice.id);
  if (updateError) throw updateError;
  return json({ accepted: true }, 200);
}

async function initiateWalletDeposit(
  req: Request,
  admin: ReturnType<typeof adminClient>,
  callerId: string,
  body: { workspaceId?: string; amount?: number },
): Promise<Response> {
  const amount = Number(body.amount);
  if (!body.workspaceId || !Number.isFinite(amount) || amount < 1 || amount > 10000) {
    return json({ error: "Enter a deposit amount between USD 1 and USD 10,000" }, 400);
  }
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.0001) {
    return json({ error: "Deposit amounts can have at most two decimal places" }, 400);
  }
  const member = await getMembership(admin, body.workspaceId, callerId);
  if (!member) return json({ error: "not authorized for this workspace" }, 403);

  const { data: wallet, error: walletError } = await admin
    .from("workspace_pesepay_wallets")
    .upsert(
      { workspace_id: body.workspaceId, user_id: callerId, currency_code: "USD" },
      { onConflict: "workspace_id,user_id" },
    )
    .select("id")
    .single();
  if (walletError) throw walletError;

  const { data: deposit, error: depositError } = await admin
    .from("workspace_pesepay_transactions")
    .insert({
      wallet_id: wallet.id,
      workspace_id: body.workspaceId,
      user_id: callerId,
      kind: "deposit",
      amount,
      currency_code: "USD",
      description: "PesePay balance deposit",
    })
    .select("id")
    .single();
  if (depositError) throw depositError;

  try {
    const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://localhost";
    const transaction = await createCheckout({
      amount,
      currencyCode: "USD",
      reasonForPayment: "SiteSurveyor prepaid balance deposit (non-refundable)",
      merchantReference: deposit.id,
      returnUrl: `${origin}/?view=settings&pesepay=wallet-return&deposit=${deposit.id}`,
    });
    if (!transaction.referenceNumber || !transaction.redirectUrl) {
      throw new Error("Pesepay returned an invalid checkout response");
    }
    const { error: updateError } = await admin
      .from("workspace_pesepay_transactions")
      .update({ pesepay_reference: transaction.referenceNumber })
      .eq("id", deposit.id);
    if (updateError) throw updateError;
    return json({
      redirectUrl: transaction.redirectUrl,
      referenceNumber: transaction.referenceNumber,
      depositId: deposit.id,
    });
  } catch (error) {
    await admin
      .from("workspace_pesepay_transactions")
      .update({ status: "failed" })
      .eq("id", deposit.id);
    throw error;
  }
}

async function verifyWalletDeposit(
  admin: ReturnType<typeof adminClient>,
  callerId: string,
  body: { workspaceId?: string; depositId?: string },
): Promise<Response> {
  if (!body.workspaceId || !body.depositId) {
    return json({ error: "workspaceId and depositId are required" }, 400);
  }
  const member = await getMembership(admin, body.workspaceId, callerId);
  if (!member) return json({ error: "not authorized for this workspace" }, 403);

  const { data: deposit, error } = await admin
    .from("workspace_pesepay_transactions")
    .select("id, wallet_id, workspace_id, user_id, kind, status, amount, currency_code, pesepay_reference")
    .eq("id", body.depositId)
    .eq("workspace_id", body.workspaceId)
    .eq("user_id", callerId)
    .eq("kind", "deposit")
    .maybeSingle();
  if (error) throw error;
  if (!deposit) return json({ error: "wallet deposit not found" }, 404);
  if (deposit.status === "completed") return json({ status: "completed" });
  if (deposit.status === "failed" || !deposit.pesepay_reference) {
    return json({ status: "failed" });
  }

  const verified = await checkPayment(deposit.pesepay_reference);
  if (verified.transactionStatus === "SUCCESS") {
    await settleWalletDeposit(admin, deposit, verified);
    return json({ status: "completed" });
  }
  if (isFailedStatus(verified.transactionStatus)) {
    const { error: updateError } = await admin
      .from("workspace_pesepay_transactions")
      .update({ status: "failed" })
      .eq("id", deposit.id)
      .eq("status", "pending");
    if (updateError) throw updateError;
    return json({ status: "failed", transactionStatus: verified.transactionStatus });
  }
  return json({ status: "pending", transactionStatus: verified.transactionStatus ?? null });
}

async function payStorageWithBalance(
  admin: ReturnType<typeof adminClient>,
  callerId: string,
  body: { workspaceId?: string; storagePlanId?: string; requestId?: string },
): Promise<Response> {
  if (!body.workspaceId || !body.storagePlanId || !body.requestId || !isUuid(body.requestId)) {
    return json({ error: "workspaceId, storagePlanId, and a valid requestId are required" }, 400);
  }
  if (!Object.hasOwn(STORAGE_PLANS, body.storagePlanId)) {
    return json({ error: "unknown storage plan" }, 400);
  }
  const member = await getMembership(admin, body.workspaceId, callerId);
  if (!member) return json({ error: "not authorized for this workspace" }, 403);
  if (!["owner", "admin", "finance"].includes(member.role)) {
    return json({ error: "only workspace owners, admins, and finance managers can purchase storage" }, 403);
  }

  const { data, error } = await admin
    .rpc("pay_workspace_storage_with_balance", {
      p_workspace_id: body.workspaceId,
      p_user_id: callerId,
      p_plan_id: body.storagePlanId,
      p_request_id: body.requestId,
    })
    .single();
  if (error) throw error;
  const result = data as { purchase_id: string; remaining_balance: number | string };
  return json({
    status: "paid",
    purchaseId: result.purchase_id,
    balance: Number(result.remaining_balance),
  });
}

async function payInvoiceWithBalance(
  admin: ReturnType<typeof adminClient>,
  callerId: string,
  body: { workspaceId?: string; invoiceId?: string; requestId?: string },
): Promise<Response> {
  if (!body.workspaceId || !body.invoiceId || !body.requestId || !isUuid(body.requestId)) {
    return json({ error: "workspaceId, invoiceId, and a valid requestId are required" }, 400);
  }
  const member = await getMembership(admin, body.workspaceId, callerId);
  if (!member) return json({ error: "not authorized for this workspace" }, 403);
  if (!["owner", "admin", "finance"].includes(member.role)) {
    return json({ error: "only workspace owners, admins, and finance managers can pay invoices from the balance" }, 403);
  }

  const { data, error } = await admin
    .rpc("pay_workspace_invoice_with_balance", {
      p_workspace_id: body.workspaceId,
      p_user_id: callerId,
      p_invoice_id: body.invoiceId,
      p_request_id: body.requestId,
    })
    .single();
  if (error) throw error;
  const result = data as { payment_id: string; remaining_balance: number | string };
  return json({
    status: "paid",
    paymentId: result.payment_id,
    balance: Number(result.remaining_balance),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = adminClient();
  try {
    if (req.method === "POST" && req.headers.get("authorization") === Deno.env.get("PESEPAY_INTEGRATION_KEY")) {
      return await settleCallback(req, admin);
    }
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    const caller = await getCaller(req);
    if (!caller) return json({ error: "authentication required" }, 401);
    const body = await req.json() as {
      action?: string;
      invoiceId?: string;
      workspaceId?: string;
      storagePlanId?: string;
      depositId?: string;
      requestId?: string;
      amount?: number;
    };
    if (!body.workspaceId) return json({ error: "workspaceId is required" }, 400);

    if (body.action === "deposit") {
      return await initiateWalletDeposit(req, admin, caller.id, body);
    }
    if (body.action === "verify-deposit") {
      return await verifyWalletDeposit(admin, caller.id, body);
    }
    if (body.action === "pay-storage-balance") {
      return await payStorageWithBalance(admin, caller.id, body);
    }
    if (body.action === "pay-invoice-balance") {
      return await payInvoiceWithBalance(admin, caller.id, body);
    }
    if (!body.invoiceId) return json({ error: "invoiceId is required" }, 400);

    const member = await getMembership(admin, body.workspaceId, caller.id);
    if (!member) return json({ error: "not authorized for this workspace" }, 403);
    const { data: invoice, error } = await admin
      .from("invoices")
      .select("id, workspace_id, invoice_number, total, currency_code, status")
      .eq("id", body.invoiceId)
      .eq("workspace_id", body.workspaceId)
      .single();
    if (error || !invoice) return json({ error: "invoice not found" }, 404);
    if (invoice.status === "paid") return json({ error: "invoice is already paid" }, 409);
    if (!Number.isFinite(Number(invoice.total)) || Number(invoice.total) <= 0) {
      return json({ error: "invoice has an invalid total" }, 400);
    }
    if (invoice.currency_code !== "USD" && invoice.currency_code !== "ZWL") {
      return json({ error: "Pesepay supports USD and ZWL invoices only" }, 400);
    }

    const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://localhost";
    const transaction = await createCheckout({
      amount: Number(invoice.total),
      currencyCode: invoice.currency_code,
      reasonForPayment: `Invoice ${invoice.invoice_number}`,
      merchantReference: invoice.invoice_number,
      returnUrl: `${origin}/?view=billing&pesepay=return&invoice=${invoice.id}`,
    });
    if (!transaction.referenceNumber || !transaction.redirectUrl) {
      throw new Error("Pesepay returned an invalid checkout response");
    }
    const { error: updateError } = await admin
      .from("invoices")
      .update({ pesepay_reference: transaction.referenceNumber })
      .eq("id", invoice.id);
    if (updateError) throw updateError;
    return json({ redirectUrl: transaction.redirectUrl, referenceNumber: transaction.referenceNumber });
  } catch (error) {
    console.error("pesepay error", error);
    return json({ error: error instanceof Error ? error.message : "Pesepay payment failed" }, 500);
  }
});
