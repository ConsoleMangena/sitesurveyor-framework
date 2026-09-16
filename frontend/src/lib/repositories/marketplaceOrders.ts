import { supabase } from '../supabase/client.ts'
import type { Tables, TablesInsert } from '../supabase/types.ts'

export type MarketplaceOrderRow = Tables<'marketplace_orders'>
export type MarketplaceOrderInsert = TablesInsert<'marketplace_orders'>

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
