import { supabase } from "../supabase/client.ts";
import type { Tables } from "../supabase/types.ts";
import type { StorageUsage } from "./attachments.ts";

export type BillingPackageKind = "ai_credits" | "storage";
export type StoragePurchaseRow = Tables<"workspace_storage_purchases">;
export type PesepayWalletRow = Tables<"workspace_pesepay_wallets">;
export type PesepayTransactionRow = Tables<"workspace_pesepay_transactions">;
export type BillingPackageRow = Tables<"billing_packages">;
export type AiCreditTransactionRow = Tables<"workspace_ai_credit_transactions">;

export type BillingPackage = {
  id: string;
  kind: BillingPackageKind;
  label: string;
  description: string;
  credits: number | null;
  storageMb: number | null;
  durationDays: number | null;
  amount: number;
  currencyCode: string;
  estimatedInfrastructureCost: number;
  estimatedPaymentFee: number;
};

export type OrderVerification = {
  status: "pending" | "completed" | "failed" | "cancelled";
  kind?: string;
  transactionStatus?: string | null;
};

function toBillingPackage(row: BillingPackageRow): BillingPackage {
  return {
    id: row.id,
    kind: row.kind as BillingPackageKind,
    label: row.label,
    description: row.description,
    credits: row.credits === null ? null : Number(row.credits),
    storageMb: row.storage_mb === null ? null : Number(row.storage_mb),
    durationDays: row.duration_days === null ? null : Number(row.duration_days),
    amount: Number(row.amount),
    currencyCode: row.currency_code,
    estimatedInfrastructureCost: Number(row.estimated_infrastructure_cost),
    estimatedPaymentFee: Number(row.estimated_payment_fee),
  };
}

async function invokePesepay<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("pesepay", { body });
  if (!error) return data as T;

  const response = (error as { context?: Response }).context;
  if (response) {
    let serverMessage: string | undefined;
    try {
      serverMessage = (await response.json() as { error?: string }).error;
    } catch {
      serverMessage = undefined;
    }
    if (serverMessage) throw new Error(serverMessage);
  }
  throw error;
}

export async function listBillingPackages(
  kind?: BillingPackageKind,
): Promise<BillingPackage[]> {
  let query = supabase
    .from("billing_packages")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toBillingPackage);
}

export async function initiatePesepayCheckout(input: {
  invoiceId: string;
  workspaceId: string;
}): Promise<{ redirectUrl: string; referenceNumber: string; orderId: string }> {
  const result = await invokePesepay<{
    redirectUrl?: string;
    referenceNumber?: string;
    orderId?: string;
    error?: string;
  }>({ ...input, action: "pay-invoice" });
  if (!result.redirectUrl || !result.referenceNumber) {
    throw new Error(result.error || "Checkout is unavailable right now. Try again.");
  }
  return {
    redirectUrl: result.redirectUrl,
    referenceNumber: result.referenceNumber,
    orderId: result.orderId ?? "",
  };
}

export async function initiatePackageCheckout(input: {
  workspaceId: string;
  packageId: string;
}): Promise<{
  redirectUrl: string;
  referenceNumber: string;
  purchaseId: string;
  packageKind?: BillingPackageKind;
}> {
  const result = await invokePesepay<{
    redirectUrl?: string;
    referenceNumber?: string;
    purchaseId?: string;
    packageKind?: BillingPackageKind;
    error?: string;
  }>({ ...input, action: "checkout-package" });
  if (!result.redirectUrl || !result.referenceNumber || !result.purchaseId) {
    throw new Error(result.error || "Checkout is unavailable right now. Try again.");
  }
  return {
    redirectUrl: result.redirectUrl,
    referenceNumber: result.referenceNumber,
    purchaseId: result.purchaseId,
    packageKind: result.packageKind,
  };
}

export async function verifyOrder(input: {
  workspaceId: string;
  orderId: string;
}): Promise<OrderVerification> {
  const result = await invokePesepay<OrderVerification & { error?: string }>({
    ...input,
    action: "verify-order",
  });
  if (!result.status) throw new Error(result.error || "Unable to verify this payment.");
  return result;
}

export async function payPackageWithBalance(input: {
  workspaceId: string;
  packageId: string;
}): Promise<{ status: "paid"; purchaseId: string; balance: number }> {
  const result = await invokePesepay<{
    status?: "paid";
    purchaseId?: string;
    balance?: number;
    error?: string;
  }>({ ...input, action: "pay-package-balance", requestId: crypto.randomUUID() });
  if (result.status !== "paid" || !result.purchaseId || typeof result.balance !== "number") {
    throw new Error(result.error || "Unable to pay for this package from your prepaid balance.");
  }
  return { status: result.status, purchaseId: result.purchaseId, balance: result.balance };
}

export async function payInvoiceWithBalance(input: {
  workspaceId: string;
  invoiceId: string;
}): Promise<{ status: "paid"; paymentId: string; balance: number }> {
  const result = await invokePesepay<{
    status?: "paid";
    paymentId?: string;
    balance?: number;
    error?: string;
  }>({ ...input, action: "pay-invoice-balance", requestId: crypto.randomUUID() });
  if (result.status !== "paid" || !result.paymentId || typeof result.balance !== "number") {
    throw new Error(result.error || "Unable to pay the invoice from your prepaid balance.");
  }
  return { status: result.status, paymentId: result.paymentId, balance: result.balance };
}

export async function listStoragePurchases(
  workspaceId: string,
  limit = 6,
): Promise<StoragePurchaseRow[]> {
  const { data, error } = await supabase
    .from("workspace_storage_purchases")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getPesepayWallet(workspaceId: string): Promise<PesepayWalletRow | null> {
  const { data, error } = await supabase
    .from("workspace_pesepay_wallets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listPesepayTransactions(
  workspaceId: string,
  limit = 25,
): Promise<PesepayTransactionRow[]> {
  const { data, error } = await supabase
    .from("workspace_pesepay_transactions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export interface RefundOutcome {
  creditsGranted: number;
  creditsReclaimed: number;
  storageMbRevoked: number;
  balanceReclaimed: number;
}

/**
 * Records a refund that was already settled with PesePay and revokes whatever
 * the payment granted. Platform administrators only; the server enforces that
 * and takes back no more than the workspace still holds.
 */
export async function recordTransactionRefund(
  transactionId: string,
  reason: string,
): Promise<RefundOutcome> {
  const { data, error } = await supabase.rpc("record_pesepay_transaction_refund", {
    p_transaction_id: transactionId,
    p_reason: reason,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        credits_granted?: number | string;
        credits_reclaimed?: number | string;
        storage_mb_revoked?: number | string;
        balance_reclaimed?: number | string;
      }
    | undefined;
  return {
    creditsGranted: Number(row?.credits_granted ?? 0),
    creditsReclaimed: Number(row?.credits_reclaimed ?? 0),
    storageMbRevoked: Number(row?.storage_mb_revoked ?? 0),
    balanceReclaimed: Number(row?.balance_reclaimed ?? 0),
  };
}

export async function listAiCreditTransactions(
  workspaceId: string,
  limit = 25,
): Promise<AiCreditTransactionRow[]> {
  const { data, error } = await supabase
    .from("workspace_ai_credit_transactions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * Appends a reversing entry for one credit-ledger row. Platform administrators
 * only; the server enforces that and refuses to take the balance below zero.
 */
export async function reverseAiCreditEntry(
  workspaceId: string,
  transactionId: string,
  reason: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("reverse_workspace_ai_credits", {
    p_workspace_id: workspaceId,
    p_transaction_id: transactionId,
    p_reason: reason,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { remaining_balance?: number | string }
    | undefined;
  return Number(row?.remaining_balance ?? 0);
}

export async function getAiCreditBalance(workspaceId: string): Promise<number> {
  const { data, error } = await supabase
    .from("workspace_ai_credit_accounts")
    .select("balance")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.balance) : 0;
}

export type WorkspaceBillingOverview = {
  ai_credit_balance: number;
  ai_credits_used: number;
  wallet_balance: number;
  total_spent: number;
  total_spent_zwl: number;
  currency_code: string;
  successful_purchases: number;
  pending_payments: number;
  failed_payments: number;
  storage: StorageUsage | null;
};

export type PlatformFinancialOverview = {
  gross_revenue: number;
  refunds: number;
  payment_fees: number;
  infrastructure_costs: number;
  estimated_profit: number;
  transaction_volume: number;
  successful_orders: number;
  ai_credits_sold: number;
  storage_mb_sold: number;
  currency_code: string;
  cost_basis: string;
};

export async function getWorkspaceBillingOverview(
  workspaceId: string,
): Promise<WorkspaceBillingOverview | null> {
  const { data, error } = await supabase.rpc("get_workspace_billing_overview", {
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
  return (data as unknown as WorkspaceBillingOverview | null) ?? null;
}

export async function getPlatformFinancialOverview(): Promise<PlatformFinancialOverview | null> {
  const { data, error } = await supabase.rpc("get_platform_financial_overview");
  if (error) throw error;
  return (data as unknown as PlatformFinancialOverview | null) ?? null;
}

export async function initiateWalletDeposit(input: {
  workspaceId: string;
  amount: number;
}): Promise<{ redirectUrl: string; referenceNumber: string; depositId: string }> {
  const result = await invokePesepay<{
    redirectUrl?: string;
    referenceNumber?: string;
    depositId?: string;
    error?: string;
  }>({ ...input, action: "deposit" });
  if (!result.redirectUrl || !result.referenceNumber || !result.depositId) {
    throw new Error(result.error || "Deposit checkout is unavailable right now. Try again.");
  }
  return {
    redirectUrl: result.redirectUrl,
    referenceNumber: result.referenceNumber,
    depositId: result.depositId,
  };
}

export async function verifyWalletDeposit(input: {
  workspaceId: string;
  depositId: string;
}): Promise<{ status: "pending" | "completed" | "failed"; transactionStatus?: string | null }> {
  const verified = await verifyOrder({ workspaceId: input.workspaceId, orderId: input.depositId });
  return {
    status: verified.status === "cancelled" ? "failed" : verified.status,
    transactionStatus: verified.transactionStatus ?? null,
  };
}
