import { supabase } from "../supabase/client.ts";
import type { Tables } from "../supabase/types.ts";

export const STORAGE_PLANS = [
  { id: "10gb", label: "10 GB", storageMb: 10 * 1024, amount: 5, currencyCode: "USD" },
  { id: "50gb", label: "50 GB", storageMb: 50 * 1024, amount: 15, currencyCode: "USD" },
  { id: "100gb", label: "100 GB", storageMb: 100 * 1024, amount: 30, currencyCode: "USD" },
] as const;

export type StoragePlanId = (typeof STORAGE_PLANS)[number]["id"];
export type StoragePurchaseRow = Tables<"workspace_storage_purchases">;
export type PesepayWalletRow = Tables<"workspace_pesepay_wallets">;
export type PesepayTransactionRow = Tables<"workspace_pesepay_transactions">;

export async function initiatePesepayCheckout(input: {
  invoiceId: string;
  workspaceId: string;
}): Promise<{ redirectUrl: string; referenceNumber: string }> {
  const { data, error } = await supabase.functions.invoke("pesepay", {
    body: input,
  });
  if (error) throw error;
  const result = data as { redirectUrl?: string; referenceNumber?: string; error?: string };
  if (!result.redirectUrl || !result.referenceNumber) {
    throw new Error(result.error || "Pesepay did not return a checkout URL.");
  }
  return {
    redirectUrl: result.redirectUrl,
    referenceNumber: result.referenceNumber,
  };
}

export async function listStoragePurchases(workspaceId: string): Promise<StoragePurchaseRow[]> {
  const { data, error } = await supabase
    .from("workspace_storage_purchases")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(6);
  if (error) throw error;
  return data ?? [];
}

async function invokeWalletFunction<T>(body: Record<string, unknown>): Promise<T> {
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

export async function getPesepayWallet(workspaceId: string): Promise<PesepayWalletRow | null> {
  const { data, error } = await supabase
    .from("workspace_pesepay_wallets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listPesepayTransactions(workspaceId: string): Promise<PesepayTransactionRow[]> {
  const { data, error } = await supabase
    .from("workspace_pesepay_transactions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw error;
  return data ?? [];
}

export async function initiateWalletDeposit(input: {
  workspaceId: string;
  amount: number;
}): Promise<{ redirectUrl: string; referenceNumber: string; depositId: string }> {
  const result = await invokeWalletFunction<{
    redirectUrl?: string;
    referenceNumber?: string;
    depositId?: string;
    error?: string;
  }>({ ...input, action: "deposit" });
  if (!result.redirectUrl || !result.referenceNumber || !result.depositId) {
    throw new Error(result.error || "PesePay did not return a deposit checkout URL.");
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
  const result = await invokeWalletFunction<{
    status?: "pending" | "completed" | "failed";
    transactionStatus?: string | null;
    error?: string;
  }>({ ...input, action: "verify-deposit" });
  if (!result.status) throw new Error(result.error || "Unable to verify the wallet deposit.");
  return { status: result.status, transactionStatus: result.transactionStatus };
}

export async function payStorageWithBalance(input: {
  workspaceId: string;
  storagePlanId: StoragePlanId;
}): Promise<{ status: "paid"; purchaseId: string; balance: number }> {
  const result = await invokeWalletFunction<{
    status?: "paid";
    purchaseId?: string;
    balance?: number;
    error?: string;
  }>({ ...input, action: "pay-storage-balance", requestId: crypto.randomUUID() });
  if (result.status !== "paid" || !result.purchaseId || typeof result.balance !== "number") {
    throw new Error(result.error || "Unable to pay for storage from the PesePay balance.");
  }
  return { status: result.status, purchaseId: result.purchaseId, balance: result.balance };
}

export async function payInvoiceWithBalance(input: {
  workspaceId: string;
  invoiceId: string;
}): Promise<{ status: "paid"; paymentId: string; balance: number }> {
  const result = await invokeWalletFunction<{
    status?: "paid";
    paymentId?: string;
    balance?: number;
    error?: string;
  }>({ ...input, action: "pay-invoice-balance", requestId: crypto.randomUUID() });
  if (result.status !== "paid" || !result.paymentId || typeof result.balance !== "number") {
    throw new Error(result.error || "Unable to pay the invoice from the PesePay balance.");
  }
  return { status: result.status, paymentId: result.paymentId, balance: result.balance };
}
