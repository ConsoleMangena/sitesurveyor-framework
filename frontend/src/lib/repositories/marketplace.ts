import { supabase } from '../supabase/client.ts'
import type { Tables, TablesInsert, TablesUpdate } from '../supabase/types.ts'
import { attachCoordinates } from '../geo/geocode.ts'

export type MarketplaceListingRow = Tables<'marketplace_listings'>
export type MarketplaceListingInsert = TablesInsert<'marketplace_listings'>
export type MarketplaceListingUpdate = TablesUpdate<'marketplace_listings'>
type MarketplaceListingCreateInput = Omit<MarketplaceListingInsert, 'workspace_id' | 'id' | 'created_at' | 'updated_at'>

export type MarketplaceListingWithAsset = MarketplaceListingRow & { assets?: { status: string } | null }

export async function listMarketplaceListings(workspaceId: string): Promise<MarketplaceListingWithAsset[]> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('*, assets:asset_id(status)')
    .or(`workspace_id.eq.${workspaceId},is_global.eq.true`)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to list marketplace listings: ${error.message}`)
  }
  return (data as unknown) as MarketplaceListingWithAsset[] ?? []
}

export async function getMarketplaceListingByAssetId(assetId: string): Promise<MarketplaceListingRow | null> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('asset_id', assetId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to get marketplace listing by asset ID: ${error.message}`)
  }
  return data
}


export async function createMarketplaceListing(workspaceId: string, payload: MarketplaceListingCreateInput): Promise<MarketplaceListingRow> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .insert({ ...(await attachCoordinates(payload)), workspace_id: workspaceId })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create marketplace listing: ${error.message}`)
  }
  return data
}

export async function updateMarketplaceListing(
  id: string,
  patch: MarketplaceListingUpdate,
): Promise<MarketplaceListingRow> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .update({ ...(await attachCoordinates(patch)), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update marketplace listing: ${error.message}`)
  }
  return data as MarketplaceListingRow
}

export async function deleteMarketplaceListing(id: string): Promise<void> {
  const { error } = await supabase
    .from('marketplace_listings')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to delete marketplace listing: ${error.message}`)
  }
}
