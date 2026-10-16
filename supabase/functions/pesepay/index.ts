import { adminClient, corsHeaders, getCaller, json } from "../_shared/supabase.ts";

const PESepay_PRODUCTION_URL = "https://api.pesepay.com/api/payments-engine/v1";
const PESepay_SANDBOX_URL = "https://api.test.sandbox.pesepay.com/payments-engine/v1";

type Transaction = {
  referenceNumber?: string;
  redirectUrl?: string;
  transactionStatus?: string;
  amountDetails?: { amount?: number; currencyCode?: string };
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

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
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
    ? PESepay_PRODUCTION_URL
    : PESepay_SANDBOX_URL;
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

async function settleCallback(req: Request, admin: ReturnType<typeof adminClient>): Promise<Response> {
  if (req.headers.get("authorization") !== Deno.env.get("PESEPAY_INTEGRATION_KEY")) {
    return json({ error: "unauthorized" }, 401);
  }
  const callback = await req.json() as Transaction;
  const reference = callback.referenceNumber?.trim();
  if (!reference) return json({ error: "missing referenceNumber" }, 400);

  const encryptionKey = requireKey("PESEPAY_ENCRYPTION_KEY");
  const verified = await pesepayRequest(
    `/payments/check-payment?referenceNumber=${encodeURIComponent(reference)}`,
    { method: "GET" },
    encryptionKey,
  );
  if (verified.transactionStatus !== "SUCCESS") return json({ accepted: true }, 200);

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
    const body = await req.json() as { invoiceId?: string; workspaceId?: string };
    if (!body.invoiceId || !body.workspaceId) return json({ error: "invoiceId and workspaceId are required" }, 400);

    const { data: member } = await admin.from("workspace_members").select("user_id").eq("workspace_id", body.workspaceId).eq("user_id", caller.id).eq("status", "active").maybeSingle();
    if (!member) return json({ error: "not authorized for this workspace" }, 403);
    const { data: invoice, error } = await admin.from("invoices").select("id, workspace_id, invoice_number, total, currency_code, status").eq("id", body.invoiceId).eq("workspace_id", body.workspaceId).single();
    if (error || !invoice) return json({ error: "invoice not found" }, 404);
    if (invoice.status === "paid") return json({ error: "invoice is already paid" }, 409);
    if (!Number.isFinite(Number(invoice.total)) || Number(invoice.total) <= 0) return json({ error: "invoice has an invalid total" }, 400);
    if (invoice.currency_code !== "USD" && invoice.currency_code !== "ZWL") return json({ error: "Pesepay supports USD and ZWL invoices only" }, 400);

    const functionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pesepay`;
    const transaction = await pesepayRequest("/payments/initiate", {
      method: "POST",
      body: JSON.stringify({ payload: await encrypt({
        amountDetails: { amount: Number(invoice.total), currencyCode: invoice.currency_code },
        reasonForPayment: `Invoice ${invoice.invoice_number}`,
        merchantReference: invoice.invoice_number,
        resultUrl: functionUrl,
        returnUrl: `${req.headers.get("origin") || Deno.env.get("APP_URL") || "https://localhost"}/?view=billing&pesepay=return&invoice=${invoice.id}`,
      }, requireKey("PESEPAY_ENCRYPTION_KEY")) }),
    }, requireKey("PESEPAY_ENCRYPTION_KEY"));
    if (!transaction.referenceNumber || !transaction.redirectUrl) throw new Error("Pesepay returned an invalid checkout response");
    const { error: updateError } = await admin.from("invoices").update({ pesepay_reference: transaction.referenceNumber }).eq("id", invoice.id);
    if (updateError) throw updateError;
    return json({ redirectUrl: transaction.redirectUrl, referenceNumber: transaction.referenceNumber });
  } catch (error) {
    console.error("pesepay error", error);
    return json({ error: error instanceof Error ? error.message : "Pesepay payment failed" }, 500);
  }
});
