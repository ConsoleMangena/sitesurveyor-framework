import { getCurrentUser } from "../auth/session.ts";
import { supabase } from "../supabase/client.ts";
import type { Tables, TablesInsert } from "../supabase/types.ts";

export type PaymentRow = Tables<"payments">;
export type PaymentInsert = TablesInsert<"payments">;

export interface PaymentWithInvoice extends PaymentRow {
  invoice_number: string | null;
}

export async function listPayments(
  workspaceId: string,
): Promise<PaymentWithInvoice[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("payments")
    .select("*, invoices(invoice_number)")
    .eq("workspace_id", workspaceId)
    .order("paid_on", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const inv = row.invoices as { invoice_number: string } | null;
    return {
      ...row,
      invoices: row.invoices,
      invoice_number: inv?.invoice_number ?? null,
    } as PaymentWithInvoice;
  });
}

export async function createPayment(
  workspaceId: string,
  input: Omit<PaymentInsert, "workspace_id" | "created_by">,
): Promise<PaymentRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to record a payment.");

  const { data, error } = await supabase
    .from("payments")
    .insert({ ...input, workspace_id: workspaceId, created_by: user.id })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
