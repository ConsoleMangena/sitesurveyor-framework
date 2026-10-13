import { getCurrentUser } from "../auth/session.ts";
import { supabase } from "../supabase/client.ts";
import { encryptFields, decryptFields } from "../../features/solana/payments/secureField";
import type { Tables, TablesInsert } from "../supabase/types.ts";

export type PaymentMethodRow = Tables<"payment_methods">;
export type PaymentMethodInsert = TablesInsert<"payment_methods">;

const ENCRYPTED_TYPE = "Crypto Wallet";

async function encryptMethodFields<T extends Partial<PaymentMethodInsert>>(
  workspaceId: string,
  method: T,
): Promise<T> {
  if (method.type !== ENCRYPTED_TYPE) return method;
  const fields = [method.detail ?? "", method.holder ?? "", method.expiry ?? ""];
  const [detail, holder, expiry] = await encryptFields(fields, workspaceId);
  return {
    ...method,
    detail: detail || method.detail,
    holder: holder || method.holder,
    expiry: expiry || method.expiry,
  };
}

async function decryptMethodFields(
  workspaceId: string,
  method: PaymentMethodRow,
): Promise<PaymentMethodRow> {
  if (method.type !== ENCRYPTED_TYPE) return method;
  const fields = [method.detail ?? "", method.holder ?? "", method.expiry ?? ""];
  const [detail, holder, expiry] = await decryptFields(fields, workspaceId);
  return {
    ...method,
    detail: detail || method.detail,
    holder: holder || method.holder,
    expiry: expiry || method.expiry,
  };
}

export async function listPaymentMethods(
  workspaceId: string,
): Promise<PaymentMethodRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = data ?? [];
  return Promise.all(rows.map((row) => decryptMethodFields(workspaceId, row)));
}

export async function createPaymentMethod(
  workspaceId: string,
  input: Omit<PaymentMethodInsert, "workspace_id" | "created_by" | "id">,
): Promise<PaymentMethodRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to add a payment method.");

  // Encrypt sensitive Crypto Wallet fields at rest.
  const encrypted = await encryptMethodFields(workspaceId, input);

  // If this is the first payment method or marked as default,
  // we could unset other defaults here or let the DB handle it.
  // For simplicity, we just insert.
  const { data, error } = await supabase
    .from("payment_methods")
    .insert({ ...encrypted, workspace_id: workspaceId, created_by: user.id })
    .select("*")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Failed to create payment method.");
  return decryptMethodFields(workspaceId, data);
}

/**
 * Save a connected Solana wallet as a reusable "Crypto Wallet" payment method.
 * Idempotent on the wallet address within a workspace: if the same wallet is
 * already saved, the existing row is returned instead of creating a duplicate.
 */
export async function saveSolanaWalletMethod(
  workspaceId: string,
  walletAddress: string,
  opts: { cluster?: string; label?: string } = {},
): Promise<PaymentMethodRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to connect a wallet.");

  const short = `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`;

  const { data: existingAll, error: listErr } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("type", ENCRYPTED_TYPE);
  if (listErr) throw listErr;

  const decryptedExisting = await Promise.all(
    (existingAll ?? []).map((row) => decryptMethodFields(workspaceId, row)),
  );
  const existing = decryptedExisting.find((m) => m.detail === walletAddress);
  if (existing) return existing;

  const encrypted = await encryptMethodFields(workspaceId, {
    type: ENCRYPTED_TYPE,
    label: opts.label ?? "Solana Wallet",
    detail: walletAddress,
    holder: short,
    expiry: opts.cluster ?? null,
    is_default: (existingAll ?? []).length === 0,
  });

  const { data, error } = await supabase
    .from("payment_methods")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      ...encrypted,
    })
    .select("*")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Failed to save Solana wallet payment method.");
  return decryptMethodFields(workspaceId, data);
}

export async function deletePaymentMethod(
  methodId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in.");

  const { error } = await supabase
    .from("payment_methods")
    .delete()
    .eq("id", methodId);

  if (error) throw error;
}

export async function setDefaultPaymentMethod(
  workspaceId: string,
  methodId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in.");

  const { error } = await supabase.rpc("set_default_payment_method", {
    p_workspace_id: workspaceId,
    p_method_id: methodId,
  });

  if (error) throw error;
}
