// Sales — Deals pipeline data access (thin supabase wrappers).
// Tables: sales_deals, sales_deal_stages, sales_deal_stage_history (migration 083).
// Not in the generated Database types yet, so the client is cast to `any`.
// crm_leads / clients / profiles lookups back the create/edit affordances.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type DealStatus = 'open' | 'won' | 'lost'

export interface DealStage {
  stage_key: string
  label: string
  sort_order: number
  is_won: boolean
  is_lost: boolean
}

export interface SalesDeal {
  id: string
  lead_id: string | null
  client_id: string | null
  title: string
  stage_key: string
  status: DealStatus
  owner_id: string | null
  amount: number // paise
  expected_close_date: string | null
  lost_reason: string | null
  project_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface DealInput {
  title: string
  client_id: string | null
  lead_id: string | null
  owner_id: string | null
  amount: number // paise
  expected_close_date: string | null
  stage_key: string
  notes: string | null
}

export interface LookupClient {
  id: string
  company_name: string
}

export interface LookupLead {
  id: string
  company_name: string
}

export interface LookupProfile {
  id: string
  name: string
}

export interface StageHistoryRow {
  id: string
  deal_id: string
  from_stage: string | null
  to_stage: string
  changed_by: string | null
  changed_at: string
}

export async function fetchStages(): Promise<DealStage[]> {
  const { data, error } = await db
    .from('sales_deal_stages')
    .select('stage_key, label, sort_order, is_won, is_lost')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as DealStage[]
}

export async function fetchDeals(): Promise<SalesDeal[]> {
  const { data, error } = await db
    .from('sales_deals')
    .select(
      'id, lead_id, client_id, title, stage_key, status, owner_id, amount, expected_close_date, lost_reason, project_id, notes, created_by, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SalesDeal[]
}

export async function fetchDeal(id: string): Promise<SalesDeal> {
  const { data, error } = await db
    .from('sales_deals')
    .select(
      'id, lead_id, client_id, title, stage_key, status, owner_id, amount, expected_close_date, lost_reason, project_id, notes, created_by, created_at, updated_at',
    )
    .eq('id', id)
    .single()
  if (error) throw error
  return data as SalesDeal
}

export async function createDeal(input: DealInput, createdBy: string | null): Promise<SalesDeal> {
  const { data, error } = await db
    .from('sales_deals')
    .insert({
      title: input.title.trim(),
      client_id: input.client_id,
      lead_id: input.lead_id,
      owner_id: input.owner_id,
      amount: input.amount,
      expected_close_date: input.expected_close_date,
      stage_key: input.stage_key,
      notes: input.notes?.trim() || null,
      created_by: createdBy,
    })
    .select('id')
    .single()
  if (error) throw error
  return data as SalesDeal
}

export async function updateDeal(id: string, input: DealInput): Promise<void> {
  const { error } = await db
    .from('sales_deals')
    .update({
      title: input.title.trim(),
      client_id: input.client_id,
      lead_id: input.lead_id,
      owner_id: input.owner_id,
      amount: input.amount,
      expected_close_date: input.expected_close_date,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

/**
 * Move a deal to a new stage: updates stage_key (and status, derived from the
 * target stage's is_won/is_lost flags) and records a stage-history row.
 */
export async function moveDealStage(
  deal: SalesDeal,
  toStage: DealStage,
  changedBy: string | null,
  lostReason?: string | null,
): Promise<void> {
  if (deal.stage_key === toStage.stage_key) return
  const status: DealStatus = toStage.is_won ? 'won' : toStage.is_lost ? 'lost' : 'open'
  const { error } = await db
    .from('sales_deals')
    .update({
      stage_key: toStage.stage_key,
      status,
      lost_reason: toStage.is_lost ? lostReason?.trim() || null : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deal.id)
  if (error) throw error

  const { error: histErr } = await db.from('sales_deal_stage_history').insert({
    deal_id: deal.id,
    from_stage: deal.stage_key,
    to_stage: toStage.stage_key,
    changed_by: changedBy,
  })
  if (histErr) throw histErr
}

export async function fetchStageHistory(dealId: string): Promise<StageHistoryRow[]> {
  const { data, error } = await db
    .from('sales_deal_stage_history')
    .select('id, deal_id, from_stage, to_stage, changed_by, changed_at')
    .eq('deal_id', dealId)
    .order('changed_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as StageHistoryRow[]
}

// ── Lookups (backing create/edit selects) ───────────────────────────────────

export async function fetchClientLookup(): Promise<LookupClient[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, company_name')
    .eq('is_active', true)
    .order('company_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as LookupClient[]
}

export async function fetchLeadLookup(): Promise<LookupLead[]> {
  const { data, error } = await db
    .from('crm_leads')
    .select('id, company_name')
    .eq('status', 'open')
    .order('company_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as LookupLead[]
}

export async function fetchProfileLookup(): Promise<LookupProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as LookupProfile[]
}
