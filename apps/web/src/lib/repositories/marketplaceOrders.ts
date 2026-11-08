import { supabase } from '../supabase/client.ts'
import type { Tables, TablesInsert } from '../supabase/types.ts'

export type MarketplaceOrderRow = Tables<'marketplace_orders'>
export type MarketplaceOrderInsert = TablesInsert<'marketplace_orders'>

/** Where a listing should be paid *today*, resolved from the seller workspace. */
export interface ListingPayout {
  workspaceId: string | null
  walletAddress: string | null
}

/**
 * Ask the database who to pay. The address is resolved from the seller
 * workspace at pay time rather than read from the copy taken when the listing
 * was created, so a seller who rotates their wallet is still paid.
 *
 * The seller workspace row itself is not readable by a buyer under RLS, which
 * is why this goes through the `market_listing_payout` function.
 */
export async function resolveListingPayout(listingId: string): Promise<ListingPayout> {
  const { data, error } = await supabase.rpc('market_listing_payout', {
    p_listing_id: listingId,
  })

  if (error) {
    throw new Error(`Failed to resolve the seller payout address: ${error.message}`)
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    workspaceId: row?.workspace_id ?? null,
    walletAddress: row?.wallet_address ?? null,
  }}

export async function createMarketplaceOrder(
  insert: MarketplaceOrderInsert,
): Promise<MarketplaceOrderRow> {
  const { data, error } = await supabase
    .from('marketplace_orders')
    .insert(insert)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to record marketplace order: ${error.message}`)
  }
  return data as MarketplaceOrderRow
}

/**
 * Record the signature the wallet returned. The database sets the status to
 * `submitted` itself - the browser cannot claim a transfer is complete.
 */
export async function attachPaymentSignature(
  orderId: string,
  signature: string,
): Promise<void> {
  const { error } = await supabase.rpc('market_order_attach_signature', {
    p_order_id: orderId,
    p_signature: signature,
  })

  if (error) {
    throw new Error(`Failed to attach the transaction signature: ${error.message}`)
  }
}

/** Mark an order the buyer never signed as cancelled, keeping the audit trail. */
export async function cancelPendingOrder(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('market_order_cancel', { p_order_id: orderId })

  if (error) {
    throw new Error(`Failed to cancel the pending order: ${error.message}`)
  }
}

export type PaymentVerification =
  | { verified: true; status: string }
  | { verified: false; reason: string }

/**
 * Ask the server to check the transfer on chain. Confirmation happens in
 * `market-verify-payment` with the service role; a browser claiming "completed"
 * is rejected by the order-status trigger. An unreachable verifier is reported
 * as unverified rather than treated as success.
 */
export async function verifyMarketPayment(orderId: string): Promise<PaymentVerification> {
  try {
    const { data, error } = await supabase.functions.invoke('market-verify-payment', {
      body: { order_id: orderId },
    })
    if (error) {
      return { verified: false, reason: error.message }
    }
    const payload = data as { verified?: boolean; status?: string; reason?: string } | null
    if (payload?.verified) {
      return { verified: true, status: payload.status ?? 'completed' }
    }
    return { verified: false, reason: payload?.reason ?? 'The payment was not confirmed yet.' }
  } catch (err) {
    return {
      verified: false,
      reason: err instanceof Error ? err.message : 'The payment verifier is unreachable.',
    }
  }
}

export async function updateMarketplaceOrderPayment(
  id: string,
  patch: Pick<MarketplaceOrderRow, 'external_payment_ref' | 'payment_status' | 'metadata'>,
): Promise<void> {
  const { error } = await supabase
    .from('marketplace_orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to update marketplace order: ${error.message}`)
  }
}
