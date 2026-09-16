import { getCurrentUser } from "../auth/session.ts";
import { supabase } from "../supabase/client.ts";
import type { Tables, TablesInsert, TablesUpdate } from "../supabase/types.ts";
import { notifyQuoteAccepted } from "./notificationEvents.ts";

export type QuoteRow = Tables<"quotes">;
export type QuoteInsert = TablesInsert<"quotes">;
export type QuoteUpdate = TablesUpdate<"quotes">;
export type QuoteItemRow = Tables<"quote_items">;
export type QuoteItemInsert = TablesInsert<"quote_items">;

export interface QuoteWithDetails extends QuoteRow {
  organization_name: string | null;
  project_name: string | null;
  [key: string]: unknown;
}

export async function listQuotes(
  workspaceId: string,
): Promise<QuoteWithDetails[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("quotes")
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
    } as QuoteWithDetails;
  });
}

export async function getQuoteWithItems(
  quoteId: string,
): Promise<{ quote: QuoteRow; items: QuoteItemRow[] } | null> {
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteError) throw quoteError;
  if (!quote) return null;

  const { data: items, error: itemsError } = await supabase
    .from("quote_items")
    .select("*")
    .eq("quote_id", quoteId)
    .order("line_number");

  if (itemsError) throw itemsError;

  return { quote, items: items ?? [] };
}

export async function createQuote(
  workspaceId: string,
  input: Omit<QuoteInsert, "workspace_id" | "created_by">,
  items: Omit<QuoteItemInsert, "workspace_id" | "quote_id">[],
): Promise<QuoteRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to create a quote.");

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({ ...input, workspace_id: workspaceId, created_by: user.id })
    .select("*")
    .single();

  if (quoteError) throw quoteError;

  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from("quote_items")
      .insert(
        items.map((item, i) => ({
          ...item,
          workspace_id: workspaceId,
          quote_id: quote.id,
          line_number: i + 1,
        })),
      );

    if (itemsError) throw itemsError;
  }

  return quote;
}

export async function deleteQuote(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to delete a quote.");

  const { error: itemsError } = await supabase
    .from("quote_items")
    .delete()
    .eq("quote_id", id);
  if (itemsError) throw itemsError;

  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw error;
}

export async function updateQuote(
  id: string,
  patch: QuoteUpdate,
): Promise<QuoteRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to update a quote.");

  const { data, error } = await supabase
    .from("quotes")
    .update(patch)
    .eq("id", id)
    .select("*, organizations(name)")
    .single();

  if (error) throw error;

  if (patch.status === "accepted") {
    const org = (data as { organizations?: { name?: string } | null })
      .organizations;
    void notifyQuoteAccepted({
      workspaceId: data.workspace_id,
      ownerUserId: data.created_by,
      quoteNumber: data.quote_number,
      organizationName: org?.name ?? null,
      quoteId: data.id,
    });
  }

  return data;
}

export async function saveQuoteItems(
  workspaceId: string,
  quoteId: string,
  items: Omit<QuoteItemInsert, "workspace_id" | "quote_id">[],
): Promise<QuoteItemRow[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to update quote items.");

  const { error: deleteError } = await supabase
    .from("quote_items")
    .delete()
    .eq("quote_id", quoteId);

  if (deleteError) throw deleteError;

  if (items.length === 0) return [];

  const { data, error } = await supabase
    .from("quote_items")
    .insert(
      items.map((item, i) => ({
        ...item,
        workspace_id: workspaceId,
        quote_id: quoteId,
        line_number: i + 1,
      })),
    )
    .select("*");

  if (error) throw error;
  return data ?? [];
}
