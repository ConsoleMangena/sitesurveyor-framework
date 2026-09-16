import { getCurrentUser } from "../auth/session.ts";
import { supabase } from "../supabase/client.ts";
import type { Tables, TablesInsert, TablesUpdate } from "../supabase/types.ts";

export type InvoiceRow = Tables<"invoices">;
export type InvoiceInsert = TablesInsert<"invoices">;
export type InvoiceUpdate = TablesUpdate<"invoices">;
export type InvoiceItemRow = Tables<"invoice_items">;
export type InvoiceItemInsert = TablesInsert<"invoice_items">;

export interface InvoiceWithDetails extends InvoiceRow {
  organization_name: string | null;
  project_name: string | null;
  [key: string]: unknown;
}

export async function listInvoices(
  workspaceId: string,
): Promise<InvoiceWithDetails[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("invoices")
    .select("*, organizations(name), projects(name)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const org = row.organizations as { name: string } | null;
    const proj = row.projects as { name: string } | null;
    return {
      ...row,
      organizations: row.organizations,
      projects: row.projects,
      organization_name: org?.name ?? null,
      project_name: proj?.name ?? null,
    } as InvoiceWithDetails;
  });
}

export async function getInvoiceWithItems(
  invoiceId: string,
): Promise<{ invoice: InvoiceRow; items: InvoiceItemRow[] } | null> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError) throw invoiceError;
  if (!invoice) return null;

  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_number");

  if (itemsError) throw itemsError;

  return { invoice, items: items ?? [] };
}

export async function createInvoice(
  workspaceId: string,
  input: Omit<InvoiceInsert, "workspace_id" | "created_by">,
  items: Omit<InvoiceItemInsert, "workspace_id" | "invoice_id">[],
): Promise<InvoiceRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to create an invoice.");

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({ ...input, workspace_id: workspaceId, created_by: user.id })
    .select("*")
    .single();

  if (invoiceError) throw invoiceError;

  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from("invoice_items")
      .insert(
        items.map((item, i) => ({
          ...item,
          workspace_id: workspaceId,
          invoice_id: invoice.id,
          line_number: i + 1,
        })),
      );

    if (itemsError) throw itemsError;
  }

  return invoice;
}

export async function updateInvoice(
  id: string,
  patch: InvoiceUpdate,
): Promise<InvoiceRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to update an invoice.");

  const { data, error } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteInvoice(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to delete an invoice.");

  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw error;
}

export async function saveInvoiceItems(
  workspaceId: string,
  invoiceId: string,
  items: Omit<InvoiceItemInsert, "workspace_id" | "invoice_id">[],
): Promise<InvoiceItemRow[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to update invoice items.");

  const { error: deleteError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", invoiceId);

  if (deleteError) throw deleteError;

  if (items.length === 0) return [];

  const { data, error } = await supabase
    .from("invoice_items")
    .insert(
      items.map((item, i) => ({
        ...item,
        workspace_id: workspaceId,
        invoice_id: invoiceId,
        line_number: i + 1,
      })),
    )
    .select("*");

  if (error) throw error;
  return data ?? [];
}
