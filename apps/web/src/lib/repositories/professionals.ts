import { supabase } from '../supabase/client.ts'
import type { Tables, TablesInsert, TablesUpdate } from '../supabase/types.ts'
import { attachCoordinates } from '../geo/geocode.ts'

export type ProfessionalRow = Tables<'professionals'>
export type ProfessionalInsert = TablesInsert<'professionals'>
export type ProfessionalUpdate = TablesUpdate<'professionals'>
type ProfessionalCreateInput = Omit<ProfessionalInsert, 'workspace_id' | 'id' | 'created_at' | 'updated_at'>

export async function listProfessionals(workspaceId: string): Promise<ProfessionalRow[]> {
  const { data, error } = await supabase
    .from('professionals')
    .select('*')
    .or(`workspace_id.eq.${workspaceId},is_global.eq.true`)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to list professionals: ${error.message}`)
  }
  return data ?? []
}

export async function createProfessional(workspaceId: string, payload: ProfessionalCreateInput): Promise<ProfessionalRow> {
  const { data, error } = await supabase
    .from('professionals')
    .insert({ ...(await attachCoordinates(payload)), workspace_id: workspaceId })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create professional: ${error.message}`)
  }
  return data
}

export async function getProfessionalByWorkspace(workspaceId: string): Promise<ProfessionalRow | null> {
  const { data, error } = await supabase
    .from('professionals')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load professional profile: ${error.message}`)
  }
  return data
}

export async function updateProfessional(
  id: string,
  patch: ProfessionalUpdate,
): Promise<ProfessionalRow> {
  const { data, error } = await supabase
    .from('professionals')
    .update({ ...(await attachCoordinates(patch)), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update professional: ${error.message}`)
  }
  return data as ProfessionalRow
}

export async function upsertProfessionalProfile(
  workspaceId: string,
  payload: Omit<ProfessionalCreateInput, 'is_global'>,
): Promise<ProfessionalRow> {
  const existing = await getProfessionalByWorkspace(workspaceId)

  if (existing) {
    return updateProfessional(existing.id, {
      ...payload,
      is_global: true,
    })
  }

  return createProfessional(workspaceId, {
    ...payload,
    is_global: true,
  })
}

export async function deleteProfessional(id: string): Promise<void> {
  const { error } = await supabase.from('professionals').delete().eq('id', id)

  if (error) {
    throw new Error(`Failed to delete professional: ${error.message}`)
  }
}

// ── Project showcase gallery ─────────────────────────────────────────────────

export type PortfolioItemRow = Tables<'portfolio_items'>
export type PortfolioItemInsert = TablesInsert<'portfolio_items'>

export async function listPortfolioItems(
  professionalId: string,
): Promise<PortfolioItemRow[]> {
  const { data, error } = await supabase
    .from('portfolio_items')
    .select('*')
    .eq('professional_id', professionalId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to load showcase items: ${error.message}`)
  }
  return data ?? []
}

export async function createPortfolioItem(
  payload: Omit<PortfolioItemInsert, 'id' | 'created_at'>,
): Promise<PortfolioItemRow> {
  const { data, error } = await supabase
    .from('portfolio_items')
    .insert(payload)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to add showcase item: ${error.message}`)
  }
  return data
}

export async function deletePortfolioItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('portfolio_items')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to remove showcase item: ${error.message}`)
  }
}
