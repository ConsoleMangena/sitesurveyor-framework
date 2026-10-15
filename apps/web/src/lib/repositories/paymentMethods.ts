import { getCurrentUser } from "../auth/session.ts";
import { supabase } from "../supabase/client.ts";
import type { Tables, TablesInsert } from "../supabase/types.ts";

export type PaymentMethodRow = Tables<"payment_methods">;
export type PaymentMethodInsert = TablesInsert<"payment_methods">;

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
  return data ?? [];
}

export async function createPaymentMethod(
  workspaceId: string,
  input: Omit<PaymentMethodInsert, "workspace_id" | "created_by" | "id">,
): Promise<PaymentMethodRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to add a payment method.");

  const { data, error } = await supabase
    .from("payment_methods")
    .insert({ ...input, workspace_id: workspaceId, created_by: user.id })
    .select("*")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Failed to create payment method.");
  return data;
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
