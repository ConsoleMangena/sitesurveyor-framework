import { supabase } from '../supabase/client.ts'
import { getCurrentUser } from '../auth/session.ts'
import type { Tables, TablesInsert, TablesUpdate } from '../supabase/types.ts'
import type { MarketplaceListingRow } from './marketplace.ts'

export type MarketplaceRequestRow = Tables<'marketplace_requests'>
export type MarketplaceRequestInsert = TablesInsert<'marketplace_requests'>
export type MarketplaceRequestUpdate = TablesUpdate<'marketplace_requests'>

export type RequestWithListing = MarketplaceRequestRow & {
  marketplace_listings: MarketplaceListingRow
}
export type RequestWithListingAndWorkspace = MarketplaceRequestRow & {
  marketplace_listings: MarketplaceListingRow
  workspaces: { name: string } | null
}

export interface CreateRequestInput {
  listingId: string
  requesterWorkspaceId: string
  message?: string | null
  desiredStartDate?: string | null
  desiredEndDate?: string | null
}

/**
 * Create a new marketplace request / inquiry.
 */
export async function createMarketplaceRequest(
  input: CreateRequestInput,
): Promise<MarketplaceRequestRow> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  const row: MarketplaceRequestInsert = {
    listing_id: input.listingId,
    requester_workspace_id: input.requesterWorkspaceId,
    requester_user_id: user.id,
    message: input.message ?? null,
    desired_start_date: input.desiredStartDate ?? null,
    desired_end_date: input.desiredEndDate ?? null,
    status: 'pending',
  }

  const { data, error } = await supabase
    .from('marketplace_requests')
    .insert(row)
    .select('*')
    .single()

  if (error) throw new Error(`Failed to create request: ${error.message}`)
  return data
}

/**
 * Check if the current user already has a pending request on a listing.
 */
export async function hasPendingRequest(
  listingId: string,
): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false

  const { data, error } = await supabase
    .from('marketplace_requests')
    .select('id')
    .eq('listing_id', listingId)
    .eq('requester_user_id', user.id)
    .eq('status', 'pending')
    .limit(1)

  if (error) {
    console.warn('Failed to check pending request', error)
    return false
  }
  return (data?.length ?? 0) > 0
}

/**
 * Check if the current user has an active request (pending or accepted) on a
 * listing. Used to gate the Solana payment button behind a request.
 */
export async function hasActiveRequest(listingId: string): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false

  const { data, error } = await supabase
    .from('marketplace_requests')
    .select('id')
    .eq('listing_id', listingId)
    .eq('requester_user_id', user.id)
    .in('status', ['pending', 'accepted'])
    .limit(1)

  if (error) {
    console.warn('Failed to check active request', error)
    return false
  }
  return (data?.length ?? 0) > 0
}

/**
 * List requests for a specific listing (seller view).
 */
export async function listRequestsForListing(
  listingId: string,
): Promise<MarketplaceRequestRow[]> {
  const { data, error } = await supabase
    .from('marketplace_requests')
    .select('*')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list requests: ${error.message}`)
  return data ?? []
}

/**
 * List outgoing requests made by the current user in a workspace.
 */
export async function listMyRequests(
  workspaceId: string,
): Promise<MarketplaceRequestRow[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('marketplace_requests')
    .select('*')
    .eq('requester_workspace_id', workspaceId)
    .eq('requester_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list my requests: ${error.message}`)
  return data ?? []
}

/**
 * List outgoing requests for the current user, including the linked listings.
 */
export async function listMyRequestsWithListings(
  workspaceId: string,
): Promise<RequestWithListing[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('marketplace_requests')
    .select('*, marketplace_listings(*)')
    .eq('requester_workspace_id', workspaceId)
    .eq('requester_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list my requests: ${error.message}`)
  return (data as RequestWithListing[] | null) ?? []
}

/**
 * List requests across all listings owned by the given workspace (seller view).
 */
export async function listSellerRequestsWithListings(
  workspaceId: string,
): Promise<RequestWithListingAndWorkspace[]> {
  const { data, error } = await supabase
    .from('marketplace_requests')
    .select('*, marketplace_listings!inner(*), workspaces:requester_workspace_id(name)')
    .eq('marketplace_listings.workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list seller requests: ${error.message}`)
  return (data as RequestWithListingAndWorkspace[] | null) ?? []
}

/**
 * Update request status (accept, decline, cancel).
 */
export async function updateRequestStatus(
  id: string,
  status: 'accepted' | 'declined' | 'cancelled',
): Promise<MarketplaceRequestRow> {
  const { data, error } = await supabase
    .from('marketplace_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw new Error(`Failed to update request: ${error.message}`)
  return data
}
