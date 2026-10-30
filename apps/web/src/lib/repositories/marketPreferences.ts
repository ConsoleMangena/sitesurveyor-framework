import { supabase } from "../supabase/client.ts";

export type SavedMarketSearch = {
  id: string;
  query: string;
  scope: string;
  sort: string;
  listing_category: string;
};

export type MarketFavorite = {
  id: string;
  market_kind: string;
  market_id: string;
};

export async function getSavedMarketSearch(query: string, scope: string, sort: string, listingCategory: string) {
  const { data, error } = await supabase
    .from("market_saved_searches")
    .select("id, query, scope, sort, listing_category")
    .eq("query", query)
    .eq("scope", scope)
    .eq("sort", sort)
    .eq("listing_category", listingCategory)
    .maybeSingle();
  if (error) throw error;
  return data as SavedMarketSearch | null;
}

export async function saveMarketSearch(input: Omit<SavedMarketSearch, "id">) {
  const { data, error } = await supabase
    .from("market_saved_searches")
    .upsert(input, { onConflict: "user_id,query,scope,sort,listing_category" })
    .select("id, query, scope, sort, listing_category")
    .single();
  if (error) throw error;
  return data as SavedMarketSearch;
}

export async function removeMarketSearch(id: string) {
  const { error } = await supabase.from("market_saved_searches").delete().eq("id", id);
  if (error) throw error;
}

export async function getMarketFavorite(kind: string, marketId: string) {
  const { data, error } = await supabase
    .from("market_favorites")
    .select("id, market_kind, market_id")
    .eq("market_kind", kind)
    .eq("market_id", marketId)
    .maybeSingle();
  if (error) throw error;
  return data as MarketFavorite | null;
}

export async function addMarketFavorite(kind: string, marketId: string) {
  const { data, error } = await supabase
    .from("market_favorites")
    .insert({ market_kind: kind, market_id: marketId })
    .select("id, market_kind, market_id")
    .single();
  if (error) throw error;
  return data as MarketFavorite;
}

export async function removeMarketFavorite(id: string) {
  const { error } = await supabase.from("market_favorites").delete().eq("id", id);
  if (error) throw error;
}
