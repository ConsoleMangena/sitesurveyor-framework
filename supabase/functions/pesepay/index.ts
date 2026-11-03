import { adminClient, corsHeaders, getCaller, json } from "../_shared/supabase.ts";

const PESEPAY_PRODUCTION_URL = "https://api.pesepay.com/api/payments-engine/v1";
const PESEPAY_SANDBOX_URL = "https://api.test.sandbox.pesepay.com/payments-engine/v1";

type Transaction = {
  referenceNumber?: string;
  redirectUrl?: string;
  transactionStatus?: string;
  amountDetails?: { amount?: number; currencyCode?: string };
};

type OrderKind = "deposit" | "storage_purchase" | "ai_credit_purchase" | "invoice_payment";

type OrderTransaction = {
  id: string;
  wallet_id: string;
  workspace_id: string;
  user_id: string;
  kind: OrderKind;
  status: string;
  amount: number;
  currency_code: string;
  pesepay_reference: string | null;
  package_id: string | null;
};

type BillingPackage = {
  id: string;
  kind: "ai_credits" | "storage";
  label: string;
  credits: number | null;
  storage_mb: number | null;
  duration_days: number | null;
  amount: number;
  currency_code: string;
  estimated_infrastructure_cost: number;
  estimated_payment_fee: number;
};

const PACKAGE_SELECT =
  "id, kind, label, credits, storage_mb, duration_days, amount, currency_code, estimated_infrastructure_cost, estimated_payment_fee";

const ORDER_SELECT =
  "id, wallet_id, workspace_id, user_id, kind, status, amount, currency_code, pesepay_reference, package_id";

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
  deposit: OrderTransaction,
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

async function settlePackagePurchase(
  admin: ReturnType<typeof adminClient>,
  purchase: OrderTransaction,
  verified: Transaction,
): Promise<void> {
  const amount = verified.amountDetails?.amount;
  const currency = verified.amountDetails?.currencyCode;
  if (!purchase.pesepay_reference || typeof amount !== "number" || !currency) {
    throw new Error("Pesepay returned incomplete package purchase details");
  }
  const { error } = await admin.rpc("settle_workspace_package_purchase", {
    p_reference: purchase.pesepay_reference,
    p_amount: amount,
    p_currency_code: currency,
  });
  if (error) throw error;
}

function failedStatusFor(providerStatus: string | undefined): "failed" | "cancelled" {
  return providerStatus === "CANCELLED" || providerStatus === "CANCELED" ? "cancelled" : "failed";
}

async function findOrderByReference(
  admin: ReturnType<typeof adminClient>,
  reference: string,
): Promise<OrderTransaction | null> {
  const { data, error } = await admin
    .from("workspace_pesepay_transactions")
    .select(ORDER_SELECT)
    .eq("pesepay_reference", reference)
    .in("kind", ["deposit", "storage_purchase", "ai_credit_purchase", "invoice_payment"])
    .maybeSingle();
  if (error) throw error;
  return (data as OrderTransaction | null) ?? null;
}

async function findOrderById(
  admin: ReturnType<typeof adminClient>,
  orderId: string,
  workspaceId: string,
  callerId: string,
): Promise<OrderTransaction | null> {
  const { data, error } = await admin
    .from("workspace_pesepay_transactions")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .eq("workspace_id", workspaceId)
    .eq("user_id", callerId)
    .maybeSingle();
  if (error) throw error;
  return (data as OrderTransaction | null) ?? null;
}

async function settleCallback(
  req: Request,
  admin: ReturnType<typeof adminClient>,
): Promise<Response> {
  const callback = await req.json() as Transaction;
  const reference = callback.referenceNumber?.trim();
  if (!reference) return json({ error: "missing referenceNumber" }, 400);

  const verified = await checkPayment(reference);
  const providerStatus = verified.transactionStatus ?? callback.transactionStatus ?? null;
  const order = await findOrderByReference(admin, reference);

  if (verified.transactionStatus !== "SUCCESS") {
    if (order && isFailedStatus(verified.transactionStatus)) {
      const { error } = await admin
        .from("workspace_pesepay_transactions")
        .update({ status: failedStatusFor(verified.transactionStatus), provider_status: providerStatus })
        .eq("id", order.id)
        .eq("status", "pending");
      if (error) throw error;
    }
    return json({ accepted: true }, 200);
  }

  if (order && order.kind !== "invoice_payment") {
    if (order.status !== "completed") {
      if (order.kind === "deposit") {
        await settleWalletDeposit(admin, order, verified);
      } else {
        await settlePackagePurchase(admin, order, verified);
      }
    }
    const { error } = await admin
      .from("workspace_pesepay_transactions")
      .update({ provider_status: providerStatus })
      .eq("id", order.id);
    if (error) throw error;
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

  if (order && order.status !== "completed") {
    const { error } = await admin
      .from("workspace_pesepay_transactions")
      .update({ status: "completed", related_id: invoice.id, provider_status: providerStatus, completed_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "pending");
    if (error) throw error;
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

async function ensureWallet(
  admin: ReturnType<typeof adminClient>,
  workspaceId: string,
  callerId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("workspace_pesepay_wallets")
    .upsert(
      { workspace_id: workspaceId, user_id: callerId, currency_code: "USD" },
      { onConflict: "workspace_id,user_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

type OpenOrderInput = {
  workspaceId: string;
  callerId: string;
  kind: OrderKind;
  amount: number;
  currencyCode: string;
  description: string;
  reasonForPayment: string;
  returnUrl: string;
  packageSnapshot?: BillingPackage;
  onReferenceSaved?: (referenceNumber: string) => Promise<void>;
};

type OpenedOrder = {
  redirectUrl: string;
  referenceNumber: string;
  orderId: string;
};

async function openCheckoutOrder(
  req: Request,
  admin: ReturnType<typeof adminClient>,
  input: OpenOrderInput,
): Promise<OpenedOrder> {
  const walletId = await ensureWallet(admin, input.workspaceId, input.callerId);
  const snapshot = input.packageSnapshot;
  const { data: order, error } = await admin
    .from("workspace_pesepay_transactions")
    .insert({
      wallet_id: walletId,
      workspace_id: input.workspaceId,
      user_id: input.callerId,
      kind: input.kind,
      amount: input.amount,
      currency_code: input.currencyCode,
      description: input.description,
      package_id: snapshot?.id ?? null,
      credit_amount: snapshot?.credits ?? null,
      storage_mb: snapshot?.storage_mb ?? null,
      duration_days: snapshot?.duration_days ?? null,
      estimated_infrastructure_cost: snapshot?.estimated_infrastructure_cost ?? 0,
      estimated_payment_fee: snapshot?.estimated_payment_fee ?? 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  const orderId = (order as { id: string }).id;

  try {
    const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://localhost";
    const transaction = await createCheckout({
      amount: input.amount,
      currencyCode: input.currencyCode,
      reasonForPayment: input.reasonForPayment,
      merchantReference: orderId,
      returnUrl: input.returnUrl.replace("{orderId}", orderId),
    });
    if (!transaction.referenceNumber || !transaction.redirectUrl) {
      throw new Error("Pesepay returned an invalid checkout response");
    }
    const { error: updateError } = await admin
      .from("workspace_pesepay_transactions")
      .update({ pesepay_reference: transaction.referenceNumber })
      .eq("id", orderId);
    if (updateError) throw updateError;
    if (input.onReferenceSaved) await input.onReferenceSaved(transaction.referenceNumber);
    return {
      redirectUrl: transaction.redirectUrl,
      referenceNumber: transaction.referenceNumber,
      orderId,
    };
  } catch (error) {
    await admin
      .from("workspace_pesepay_transactions")
      .update({ status: "failed", provider_status: "NOT_INITIATED" })
      .eq("id", orderId);
    throw error;
  }
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

  const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://localhost";
  const opened = await openCheckoutOrder(req, admin, {
    workspaceId: body.workspaceId,
    callerId,
    kind: "deposit",
    amount,
    currencyCode: "USD",
    description: "PesePay balance deposit",
    reasonForPayment: "SiteSurveyor prepaid balance deposit (non-refundable)",
    returnUrl: `${origin}/?view=billing&pesepay=wallet-return&deposit={orderId}`,
  });
  return json({ ...opened, depositId: opened.orderId });
}

async function settleOrder(
  admin: ReturnType<typeof adminClient>,
  order: OrderTransaction,
  verified: Transaction,
): Promise<void> {
  if (order.kind === "deposit") {
    await settleWalletDeposit(admin, order, verified);
    return;
  }
  await settlePackagePurchase(admin, order, verified);
}

async function markOrderFailed(
  admin: ReturnType<typeof adminClient>,
  order: OrderTransaction,
  providerStatus: string | undefined,
): Promise<void> {
  const { error } = await admin
    .from("workspace_pesepay_transactions")
    .update({ status: failedStatusFor(providerStatus), provider_status: providerStatus ?? null })
    .eq("id", order.id)
    .eq("status", "pending");
  if (error) throw error;
}

async function verifyOrder(
  admin: ReturnType<typeof adminClient>,
  callerId: string,
  body: { workspaceId?: string; depositId?: string; purchaseId?: string; orderId?: string },
): Promise<Response> {
  const orderId = body.orderId || body.purchaseId || body.depositId;
  if (!body.workspaceId || !orderId) {
    return json({ error: "workspaceId and orderId are required" }, 400);
  }
  const member = await getMembership(admin, body.workspaceId, callerId);
  if (!member) return json({ error: "not authorized for this workspace" }, 403);

  const order = await findOrderById(admin, orderId, body.workspaceId, callerId);
  if (!order) return json({ error: "payment not found" }, 404);
  if (order.kind === "invoice_payment") {
    return json({ error: "verify invoice payments from the billing invoice view" }, 400);
  }
  if (order.status === "completed") return json({ status: "completed", kind: order.kind });
  if (order.status !== "pending" || !order.pesepay_reference) {
    return json({ status: order.status, kind: order.kind });
  }

  const verified = await checkPayment(order.pesepay_reference);
  if (verified.transactionStatus === "SUCCESS") {
    await settleOrder(admin, order, verified);
    return json({ status: "completed", kind: order.kind });
  }
  if (isFailedStatus(verified.transactionStatus)) {
    await markOrderFailed(admin, order, verified.transactionStatus);
    return json({ status: failedStatusFor(verified.transactionStatus), kind: order.kind });
  }
  const { error } = await admin
    .from("workspace_pesepay_transactions")
    .update({ provider_status: verified.transactionStatus ?? null })
    .eq("id", order.id);
  if (error) throw error;
  return json({ status: "pending", kind: order.kind, transactionStatus: verified.transactionStatus ?? null });
}

async function loadActivePackage(
  admin: ReturnType<typeof adminClient>,
  packageId: string,
  allowedKinds: BillingPackage["kind"][],
): Promise<BillingPackage | Response> {
  const { data, error } = await admin
    .from("billing_packages")
    .select(PACKAGE_SELECT)
    .eq("id", packageId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  const pkg = data as BillingPackage | null;
  if (!pkg) return json({ error: "unknown or inactive package" }, 404);
  if (!allowedKinds.includes(pkg.kind)) {
    return json({ error: `${pkg.kind} packages cannot be purchased with this action` }, 400);
  }
  return pkg;
}

function isResponse(value: BillingPackage | Response): value is Response {
  return typeof (value as Response).status === "number";
}

async function initiatePackageCheckout(
  req: Request,
  admin: ReturnType<typeof adminClient>,
  callerId: string,
  body: { workspaceId?: string; packageId?: string },
): Promise<Response> {
  if (!body.workspaceId || !body.packageId) {
    return json({ error: "workspaceId and packageId are required" }, 400);
  }
  const member = await getMembership(admin, body.workspaceId, callerId);
  if (!member) return json({ error: "not authorized for this workspace" }, 403);
  if (!["owner", "admin", "finance"].includes(member.role)) {
    return json({ error: "only workspace owners, admins, and finance managers can purchase packages" }, 403);
  }

  const pkg = await loadActivePackage(admin, body.packageId, ["ai_credits", "storage"]);
  if (isResponse(pkg)) return pkg;
  const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://localhost";
  const opened = await openCheckoutOrder(req, admin, {
    workspaceId: body.workspaceId,
    callerId,
    kind: pkg.kind === "ai_credits" ? "ai_credit_purchase" : "storage_purchase",
    amount: Number(pkg.amount),
    currencyCode: pkg.currency_code,
    description: `${pkg.label} (PesePay checkout)`,
    reasonForPayment: `SiteSurveyor ${pkg.label} (non-refundable)`,
    returnUrl: `${origin}/?view=billing&pesepay=package-return&purchase={orderId}`,
    packageSnapshot: pkg,
  });
  return json({ ...opened, purchaseId: opened.orderId, packageKind: pkg.kind });
}

async function initiateInvoiceCheckout(
  req: Request,
  admin: ReturnType<typeof adminClient>,
  callerId: string,
  body: { workspaceId?: string; invoiceId?: string },
): Promise<Response> {
  if (!body.workspaceId || !body.invoiceId) {
    return json({ error: "workspaceId and invoiceId are required" }, 400);
  }
  const member = await getMembership(admin, body.workspaceId, callerId);
  if (!member) return json({ error: "not authorized for this workspace" }, 403);

  const { data: invoice, error } = await admin
    .from("invoices")
    .select("id, workspace_id, invoice_number, total, currency_code, status")
    .eq("id", body.invoiceId)
    .eq("workspace_id", body.workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!invoice) return json({ error: "invoice not found" }, 404);
  if (invoice.status === "paid") return json({ error: "invoice is already paid" }, 409);
  if (!Number.isFinite(Number(invoice.total)) || Number(invoice.total) <= 0) {
    return json({ error: "invoice has an invalid total" }, 400);
  }
  if (invoice.currency_code !== "USD" && invoice.currency_code !== "ZWL") {
    return json({ error: "Pesepay supports USD and ZWL invoices only" }, 400);
  }

  const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://localhost";
  const opened = await openCheckoutOrder(req, admin, {
    workspaceId: body.workspaceId,
    callerId,
    kind: "invoice_payment",
    amount: Number(invoice.total),
    currencyCode: invoice.currency_code,
    description: `Invoice ${invoice.invoice_number}`,
    reasonForPayment: `Invoice ${invoice.invoice_number}`,
    returnUrl: `${origin}/?view=billing&pesepay=return&invoice=${invoice.id}`,
    onReferenceSaved: async (referenceNumber) => {
      const { error: linkError } = await admin
        .from("invoices")
        .update({ pesepay_reference: referenceNumber })
        .eq("id", invoice.id);
      if (linkError) throw linkError;
    },
  });
  return json({ ...opened, invoiceId: invoice.id });
}

async function payPackageWithBalance(
  admin: ReturnType<typeof adminClient>,
  callerId: string,
  body: { workspaceId?: string; packageId?: string; storagePlanId?: string; requestId?: string },
  allowedKinds: BillingPackage["kind"][],
): Promise<Response> {
  const packageId = body.packageId || body.storagePlanId;
  if (!body.workspaceId || !packageId || !body.requestId || !isUuid(body.requestId)) {
    return json({ error: "workspaceId, packageId, and a valid requestId are required" }, 400);
  }
  const member = await getMembership(admin, body.workspaceId, callerId);
  if (!member) return json({ error: "not authorized for this workspace" }, 403);
  if (!["owner", "admin", "finance"].includes(member.role)) {
    return json({ error: "only workspace owners, admins, and finance managers can purchase packages" }, 403);
  }
  const pkg = await loadActivePackage(admin, packageId, allowedKinds);
  if (isResponse(pkg)) return pkg;

  const { data, error } = await admin
    .rpc("pay_workspace_package_with_balance", {
      p_workspace_id: body.workspaceId,
      p_user_id: callerId,
      p_package_id: packageId,
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
      packageId?: string;
      storagePlanId?: string;
      depositId?: string;
      purchaseId?: string;
      orderId?: string;
      requestId?: string;
      amount?: number;
    };
    if (!body.workspaceId) return json({ error: "workspaceId is required" }, 400);

    if (body.action === "deposit") {
      return await initiateWalletDeposit(req, admin, caller.id, body);
    }
    if (body.action === "checkout-package") {
      return await initiatePackageCheckout(req, admin, caller.id, body);
    }
    if (body.action === "verify-deposit" || body.action === "verify-order") {
      return await verifyOrder(admin, caller.id, body);
    }
    if (body.action === "pay-package-balance") {
      return await payPackageWithBalance(admin, caller.id, body, ["ai_credits", "storage"]);
    }
    if (body.action === "pay-storage-balance") {
      return await payPackageWithBalance(admin, caller.id, body, ["storage"]);
    }
    if (body.action === "pay-invoice-balance") {
      return await payInvoiceWithBalance(admin, caller.id, body);
    }
    if (body.action === "pay-invoice") {
      return await initiateInvoiceCheckout(req, admin, caller.id, body);
    }
    return json({ error: "unknown action" }, 400);
  } catch (error) {
    console.error("pesepay error", error);
    return json({ error: error instanceof Error ? error.message : "Pesepay payment failed" }, 500);
  }
});
