import { supabase } from '../supabase/client.ts'
import { getCurrentUser } from '../auth/session.ts'
import type { Tables } from '../supabase/types.ts'

/**
 * One inquiry rail for every public market category.
 *
 * Listings keep their richer `marketplace_requests` flow (accept/decline with a
 * seller inbox); jobs, events, firms and professionals use this table so the
 * public market never dead-ends on "read only" detail cards.
 */

export type MarketInquiryRow = Tables<'market_inquiries'>
export type MarketInquiryKind = 'listing' | 'professional' | 'job' | 'firm' | 'event'
export type MarketInquiryIntent = 'enquiry' | 'apply' | 'register' | 'hire' | 'contact'

export interface CreateMarketInquiryInput {
  kind: MarketInquiryKind
  itemId: string
  intent?: MarketInquiryIntent
  message?: string | null
  requesterName?: string | null
  requesterEmail?: string | null
  requesterWorkspaceId?: string | null
  desiredStartDate?: string | null
  seats?: number | null
}

export async function createMarketInquiry(
  input: CreateMarketInquiryInput,
): Promise<MarketInquiryRow> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Sign in to send an inquiry.')

  const { data, error } = await supabase
    .from('market_inquiries')
    .insert({
      kind: input.kind,
      item_id: input.itemId,
      intent: input.intent ?? 'enquiry',
      requester_user_id: user.id,
      requester_workspace_id: input.requesterWorkspaceId ?? null,
      requester_name: input.requesterName?.trim() || null,
      requester_email: input.requesterEmail?.trim() || null,
      message: input.message?.trim() || null,
      desired_start_date: input.desiredStartDate || null,
      seats: input.seats ?? null,
      status: 'pending',
    })
    .select('*')
    .single()

  if (error) throw new Error(`Could not send your inquiry: ${error.message}`)
  return data
}

/** The caller's latest inquiry for one item, so the card can show its status. */
export async function getMyInquiryForItem(
  kind: MarketInquiryKind,
  itemId: string,
): Promise<MarketInquiryRow | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('market_inquiries')
    .select('*')
    .eq('kind', kind)
    .eq('item_id', itemId)
    .eq('requester_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.warn('Failed to load inquiry for item', error)
    return null
  }
  return data?.[0] ?? null
}

export async function listMyMarketInquiries(): Promise<MarketInquiryRow[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('market_inquiries')
    .select('*')
    .eq('requester_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Could not load your inquiries: ${error.message}`)
  return data ?? []
}

/** Publisher view: inquiries addressed to an item owned by one of your workspaces. */
export async function listInquiriesForItem(
  kind: MarketInquiryKind,
  itemId: string,
): Promise<MarketInquiryRow[]> {
  const { data, error } = await supabase
    .from('market_inquiries')
    .select('*')
    .eq('kind', kind)
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Could not load inquiries: ${error.message}`)
  return data ?? []
}

export async function cancelMarketInquiry(id: string): Promise<MarketInquiryRow> {
  const { data, error } = await supabase
    .from('market_inquiries')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw new Error(`Could not cancel the inquiry: ${error.message}`)
  return data
}
