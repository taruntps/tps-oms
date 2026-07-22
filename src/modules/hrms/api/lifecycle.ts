// HRMS — Employee Lifecycle (M5) data access: separations, exit interviews,
// F&F settlements, and lifecycle status events. Lifecycle events (confirmation/
// transfer/promotion/warning/suspension) REUSE the existing M1
// `hr_employee_status_events` table — we only INSERT rows here.
// Migration 094 tables aren't in the generated Database types yet, so `from(...)` is
// cast to `any`. Money (payable/recoverable/net) is stored in paise (bigint).
import { supabase } from '@/lib/supabase'

const db = supabase as any

// ── Lifecycle status events (REUSE M1 hr_employee_status_events) ──────────────
export interface StatusEvent {
  id: string
  employee_id: string
  event_type: string | null
  effective_date: string | null
  from_value: string | null
  to_value: string | null
  approved_by: string | null
  notes: string | null
  created_at: string | null
}
export interface StatusEventInput {
  employee_id: string
  event_type: string
  effective_date: string
  from_value?: string | null
  to_value?: string | null
  approved_by?: string | null
  notes?: string | null
}

export async function fetchStatusEvents(employeeId: string): Promise<StatusEvent[]> {
  const { data, error } = await db
    .from('hr_employee_status_events')
    .select('*')
    .eq('employee_id', employeeId)
    .order('effective_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as StatusEvent[]
}

/** Append a lifecycle event (confirmation / transfer / promotion / warning / suspension). */
export async function recordStatusEvent(input: StatusEventInput): Promise<void> {
  const { error } = await db.from('hr_employee_status_events').insert(input)
  if (error) throw error
}

// ── Separations ──────────────────────────────────────────────────────────────
export type SeparationType = 'resignation' | 'termination' | 'retirement'
export type SeparationStatus =
  | 'initiated' | 'approved' | 'exit_interview' | 'clearance' | 'fnf' | 'completed' | 'cancelled'

export interface Separation {
  id: string
  employee_id: string
  type: SeparationType
  notice_date: string | null
  last_working_day: string | null
  reason: string | null
  status: SeparationStatus
  approved_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
export interface SeparationInput {
  employee_id: string
  type: SeparationType
  notice_date?: string | null
  last_working_day?: string | null
  reason?: string | null
}

export async function fetchSeparations(status?: SeparationStatus): Promise<Separation[]> {
  let q = db.from('hr_separations').select('*')
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Separation[]
}

export async function createSeparation(input: SeparationInput, createdBy?: string | null): Promise<string> {
  const { data, error } = await db
    .from('hr_separations')
    .insert({ ...input, created_by: createdBy ?? null, status: 'initiated' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

/** Single-level approval: approve an initiated separation (approver_id + status). */
export async function approveSeparation(id: string, approverId: string): Promise<void> {
  const { error } = await db
    .from('hr_separations')
    .update({ status: 'approved', approved_by: approverId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Advance a separation through its workflow stages (or cancel). */
export async function setSeparationStatus(id: string, status: SeparationStatus): Promise<void> {
  const { error } = await db
    .from('hr_separations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── Exit interviews ──────────────────────────────────────────────────────────
export interface ExitInterview {
  id: string
  separation_id: string
  questionnaire: Record<string, unknown> | null
  sentiment: string | null
  notes: string | null
  conducted_by: string | null
  created_at: string
}
export interface ExitInterviewInput {
  separation_id: string
  questionnaire?: Record<string, unknown> | null
  sentiment?: string | null
  notes?: string | null
}

export async function fetchExitInterview(separationId: string): Promise<ExitInterview | null> {
  const { data, error } = await db
    .from('hr_exit_interviews')
    .select('*')
    .eq('separation_id', separationId)
    .maybeSingle()
  if (error) throw error
  return (data as ExitInterview) ?? null
}

export async function saveExitInterview(input: ExitInterviewInput, conductedBy?: string | null): Promise<void> {
  const { error } = await db
    .from('hr_exit_interviews')
    .insert({ ...input, conducted_by: conductedBy ?? null })
  if (error) throw error
}

// ── F&F settlements ──────────────────────────────────────────────────────────
export type FnfStatus = 'draft' | 'approved' | 'paid'
export interface FnfSettlement {
  id: string
  separation_id: string
  payable: number
  recoverable: number
  net: number
  finance_handoff_ref: string | null
  status: FnfStatus
  approved_by: string | null
  created_by: string | null
  created_at: string
}
export interface FnfInput {
  separation_id: string
  payable: number
  recoverable: number
}

export async function fetchFnf(separationId: string): Promise<FnfSettlement | null> {
  const { data, error } = await db
    .from('hr_fnf_settlements')
    .select('*')
    .eq('separation_id', separationId)
    .maybeSingle()
  if (error) throw error
  return (data as FnfSettlement) ?? null
}

/** Draft an F&F settlement — net is derived (payable − recoverable). */
export async function draftFnf(input: FnfInput, createdBy?: string | null): Promise<void> {
  const net = (input.payable ?? 0) - (input.recoverable ?? 0)
  const { error } = await db.from('hr_fnf_settlements').insert({
    separation_id: input.separation_id,
    payable: input.payable,
    recoverable: input.recoverable,
    net,
    created_by: createdBy ?? null,
    status: 'draft',
  })
  if (error) throw error
}

/** Single-level approval: approve a drafted F&F (approver_id + status). Gate lifecycle.approve. */
export async function approveFnf(id: string, approverId: string): Promise<void> {
  const { error } = await db
    .from('hr_fnf_settlements')
    .update({ status: 'approved', approved_by: approverId })
    .eq('id', id)
  if (error) throw error
}

export async function setFnfStatus(id: string, status: FnfStatus): Promise<void> {
  const { error } = await db.from('hr_fnf_settlements').update({ status }).eq('id', id)
  if (error) throw error
}
