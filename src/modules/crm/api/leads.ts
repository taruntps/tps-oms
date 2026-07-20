// CRM — leads data access (thin supabase wrappers).
// Tables `crm_leads` / `crm_lead_stage_history` (migration 082) are not in the
// generated Database types yet, so we cast `from(...)` to `any`.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type LeadStatus = 'open' | 'won' | 'lost'

export interface Lead {
  id: string
  company_name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  source: string | null
  stage_key: string
  status: LeadStatus
  owner_id: string | null
  estimated_value: number | null // bigint paise
  service_interest: string | null
  notes: string | null
  referral_id: string | null
  client_id: string | null
  lost_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LeadInput {
  company_name: string
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  source?: string | null
  stage_key?: string
  status?: LeadStatus
  owner_id?: string | null
  estimated_value?: number | null
  service_interest?: string | null
  notes?: string | null
  referral_id?: string | null
  lost_reason?: string | null
}

export async function fetchLeads(): Promise<Lead[]> {
  const { data, error } = await db
    .from('crm_leads')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Lead[]
}

export async function fetchLead(id: string): Promise<Lead> {
  const { data, error } = await db.from('crm_leads').select('*').eq('id', id).single()
  if (error) throw error
  return data as Lead
}

export async function createLead(input: LeadInput, createdBy?: string): Promise<Lead> {
  const payload = { stage_key: 'new', status: 'open', ...input, created_by: createdBy ?? null }
  const { data, error } = await db.from('crm_leads').insert(payload).select().single()
  if (error) throw error
  return data as Lead
}

export async function updateLead(id: string, input: Partial<LeadInput>): Promise<Lead> {
  const { data, error } = await db.from('crm_leads').update(input).eq('id', id).select().single()
  if (error) throw error
  return data as Lead
}

/**
 * Move a lead to a new stage: updates crm_leads.stage_key (and status when the
 * stage is terminal won/lost) and records a crm_lead_stage_history row.
 */
export async function moveLeadStage(args: {
  lead: Lead
  toStage: string
  isWon: boolean
  isLost: boolean
  changedBy?: string
}): Promise<void> {
  const { lead, toStage, isWon, isLost, changedBy } = args
  if (lead.stage_key === toStage) return

  const patch: Partial<Lead> = { stage_key: toStage }
  if (isWon) patch.status = 'won'
  else if (isLost) patch.status = 'lost'
  else patch.status = 'open'

  const { error: upErr } = await db.from('crm_leads').update(patch).eq('id', lead.id)
  if (upErr) throw upErr

  const { error: histErr } = await db.from('crm_lead_stage_history').insert({
    lead_id: lead.id,
    from_stage: lead.stage_key,
    to_stage: toStage,
    changed_by: changedBy ?? null,
  })
  if (histErr) throw histErr
}

// A 15-char placeholder GSTIN so converted clients don't collide on the unique
// GSTIN index (mirrors src/pages/clients/ClientForm.tsx).
function placeholderGstin(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let suffix = ''
  for (let i = 0; i < 9; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
  return 'NOGSTN' + suffix
}

export interface ConvertResult {
  clientId: string
}

/**
 * Convert a lead into a client: inserts a `clients` row from the lead's details
 * and links it back (crm_leads.client_id) with status/stage = won.
 * `state` is NOT NULL on clients, so a placeholder is used when unknown.
 */
export async function convertLeadToClient(lead: Lead, createdBy?: string): Promise<ConvertResult> {
  const clientPayload = {
    company_name: lead.company_name.toUpperCase(),
    contact_person: lead.contact_person ?? lead.company_name,
    contact_phone: lead.phone ?? '',
    contact_email: lead.email ?? null,
    state: 'Punjab',
    gstin: placeholderGstin(),
    gstin_is_placeholder: true,
    referral_id: lead.referral_id ?? null,
    created_by: createdBy ?? null,
  }

  const { data: client, error: clientErr } = await db
    .from('clients')
    .insert(clientPayload)
    .select('id')
    .single()
  if (clientErr) throw clientErr

  const { error: linkErr } = await db
    .from('crm_leads')
    .update({ client_id: client.id, status: 'won', stage_key: 'won' })
    .eq('id', lead.id)
  if (linkErr) throw linkErr

  // Record the terminal stage transition for the audit trail.
  await db.from('crm_lead_stage_history').insert({
    lead_id: lead.id,
    from_stage: lead.stage_key,
    to_stage: 'won',
    changed_by: createdBy ?? null,
  })

  return { clientId: client.id as string }
}
