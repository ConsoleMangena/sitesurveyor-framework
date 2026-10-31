import { supabase } from '../supabase/client.ts'
import { getCurrentUser } from '../auth/session.ts'
import type { Database, Tables } from '../supabase/types.ts'

/**
 * Reviews behind the public professional/firm ratings.
 *
 * The item views expose the aggregate (rating + count); these helpers read the
 * individual rows and let a signed-in visitor leave or update their own review.
 */

export type MarketReviewRow = Tables<'market_reviews'>
export type ReviewableKind = 'professional' | 'firm'
type DbPublicReview = Database['public']['Views']['public_market_reviews']['Row']

export interface MarketReview {
  id: string
  kind: ReviewableKind
  itemId: string
  rating: number
  body: string | null
  createdAt: string
}

const toReview = (row: DbPublicReview): MarketReview => ({
  id: row.id ?? '',
  kind: (row.kind as ReviewableKind) ?? 'professional',
  itemId: row.item_id ?? '',
  rating: Number(row.rating ?? 0),
  body: row.body,
  createdAt: row.created_at ?? '',
})

export async function listMarketReviews(
  kind: ReviewableKind,
  itemId: string,
  limit = 6,
): Promise<MarketReview[]> {
  const { data, error } = await supabase
    .from('public_market_reviews')
    .select('*')
    .eq('kind', kind)
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('Failed to load market reviews', error)
    return []
  }
  return (data ?? []).map(toReview)
}

export async function getMyMarketReview(
  kind: ReviewableKind,
  itemId: string,
): Promise<MarketReviewRow | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('market_reviews')
    .select('*')
    .eq('kind', kind)
    .eq('item_id', itemId)
    .eq('author_user_id', user.id)
    .maybeSingle()

  if (error) {
    console.warn('Failed to load your review', error)
    return null
  }
  return data
}

/** Insert or update the caller's review; the unique key keeps it one per item. */
export async function saveMarketReview(input: {
  kind: ReviewableKind
  itemId: string
  rating: number
  body?: string | null
}): Promise<MarketReviewRow> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Sign in to leave a review.')

  const { data, error } = await supabase
    .from('market_reviews')
    .upsert(
      {
        kind: input.kind,
        item_id: input.itemId,
        author_user_id: user.id,
        rating: Math.min(5, Math.max(1, Math.round(input.rating))),
        body: input.body?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'kind,item_id,author_user_id' },
    )
    .select('*')
    .single()

  if (error) throw new Error(`Could not save your review: ${error.message}`)
  return data
}

export async function deleteMarketReview(id: string): Promise<void> {
  const { error } = await supabase.from('market_reviews').delete().eq('id', id)
  if (error) throw new Error(`Could not delete your review: ${error.message}`)
}
