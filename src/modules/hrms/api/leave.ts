// HRMS — Leave Management (M3) data access.
// Ledger-based balances (get_leave_balance RPC sums signed hr_leave_ledger), leave
// requests, restricted-holiday picks, comp-off and encashments. Migration 090 tables
// aren't in the generated Database types yet, so `from(...)`/`rpc(...)` are cast to `any`.
// Rules are resolved via get_hr_policy — never hardcoded here.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

// ── Leave types (read; CRUD lives in leaveConfig) ─────────────────────────────
export interface LeaveType {
  id: string
  code: string
  name: string
  is_paid: boolean
  is_encashable: boolean
  requires_proof: boolean
  unit: 'day' | 'half_day'
  applies_to: 'all' | 'male' | 'female'
  annual_quota: number
  carry_forward_cap: number
  config: Record<string, unknown>
  is_active: boolean
}

export async function fetchActiveLeaveTypes(): Promise<LeaveType[]> {
  const { data, error } = await db
    .from('hr_leave_types')
    .select('*')
    .eq('is_active', true)
    .order('code')
  if (error) throw error
  return (data ?? []) as LeaveType[]
}

// ── Balances (ledger via RPC) ────────────────────────────────────────────────
/** Signed sum of the ledger for one employee × leave type (optionally scoped to a year). */
export async function fetchLeaveBalance(
  employeeId: string,
  leaveTypeId: string,
  year?: number | null,
): Promise<number> {
  const { data, error } = await db.rpc('get_leave_balance', {
    p_employee: employeeId,
    p_leave_type: leaveTypeId,
    p_year: year ?? null,
  })
  if (error) throw error
  return Number(data ?? 0)
}

export interface LeaveTypeBalance {
  type: LeaveType
  balance: number
}

/** Balance for every active leave type for one employee (parallel RPC calls). */
export async function fetchLeaveBalances(
  employeeId: string,
  year?: number | null,
): Promise<LeaveTypeBalance[]> {
  const types = await fetchActiveLeaveTypes()
  const balances = await Promise.all(
    types.map(async t => ({ type: t, balance: await fetchLeaveBalance(employeeId, t.id, year) })),
  )
  return balances
}

// ── Ledger entries ────────────────────────────────────────────────────────────
export type LedgerEntryType =
  | 'opening' | 'accrual' | 'carry_forward' | 'applied'
  | 'reversal' | 'encashment' | 'adjustment' | 'lapse'

export interface LeaveLedgerEntry {
  id: string
  employee_id: string
  leave_type_id: string
  entry_type: LedgerEntryType
  quantity: number
  entry_date: string
  ref_type: string | null
  ref_id: string | null
  note: string | null
  created_at: string
}
export interface LedgerEntryInput {
  employee_id: string
  leave_type_id: string
  entry_type: LedgerEntryType
  quantity: number
  entry_date?: string | null
  ref_type?: string | null
  ref_id?: string | null
  note?: string | null
}

export async function fetchLedgerEntries(
  employeeId: string,
  leaveTypeId?: string | null,
): Promise<LeaveLedgerEntry[]> {
  let q = db.from('hr_leave_ledger').select('*').eq('employee_id', employeeId)
  if (leaveTypeId) q = q.eq('leave_type_id', leaveTypeId)
  const { data, error } = await q.order('entry_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as LeaveLedgerEntry[]
}

export async function postLedgerEntry(input: LedgerEntryInput, createdBy?: string | null): Promise<void> {
  const { error } = await db.from('hr_leave_ledger').insert({ ...input, created_by: createdBy ?? null })
  if (error) throw error
}

// ── Leave requests ─────────────────────────────────────────────────────────────
export interface LeaveRequest {
  id: string
  employee_id: string
  leave_type_id: string
  from_date: string
  to_date: string
  days: number
  is_half_day: boolean
  half_session: 'first' | 'second' | null
  reason: string | null
  status: RequestStatus
  approver_id: string | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
}
export interface LeaveRequestInput {
  leave_type_id: string
  from_date: string
  to_date: string
  days: number
  is_half_day?: boolean
  half_session?: 'first' | 'second' | null
  reason?: string | null
  attachment_url?: string | null
  document_id?: string | null
}

export async function fetchMyLeaveRequests(employeeId: string): Promise<LeaveRequest[]> {
  const { data, error } = await db
    .from('hr_leave_requests')
    .select('*')
    .eq('employee_id', employeeId)
    .order('from_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as LeaveRequest[]
}

/** All requests visible to the caller (RLS scopes managers→team, HR/director→all). */
export async function fetchLeaveRequests(status?: RequestStatus): Promise<LeaveRequest[]> {
  let q = db.from('hr_leave_requests').select('*')
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('from_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as LeaveRequest[]
}

export async function createLeaveRequest(employeeId: string, input: LeaveRequestInput): Promise<void> {
  const { error } = await db.from('hr_leave_requests').insert({
    employee_id: employeeId,
    created_by: employeeId,
    ...input,
  })
  if (error) throw error
}

export async function cancelLeaveRequest(id: string): Promise<void> {
  const { error } = await db.from('hr_leave_requests').update({ status: 'cancelled' }).eq('id', id)
  if (error) throw error
}

// ── Approvals ──────────────────────────────────────────────────────────────────
export interface LeaveDecisionInput {
  request: LeaveRequest
  approve: boolean
  approverId: string
  note?: string | null
}

/**
 * Approve → set status/approver/decided_at AND post an 'applied' ledger debit (−days).
 * Reject → status + note only. The ledger debit is what actually reduces the balance.
 */
export async function decideLeaveRequest(input: LeaveDecisionInput): Promise<void> {
  const { request, approve, approverId, note } = input
  const { error } = await db
    .from('hr_leave_requests')
    .update({
      status: approve ? 'approved' : 'rejected',
      approver_id: approverId,
      decided_at: new Date().toISOString(),
      decision_note: note ?? null,
    })
    .eq('id', request.id)
  if (error) throw error

  if (approve) {
    await postLedgerEntry(
      {
        employee_id: request.employee_id,
        leave_type_id: request.leave_type_id,
        entry_type: 'applied',
        quantity: -Math.abs(request.days),
        entry_date: request.from_date,
        ref_type: 'leave_request',
        ref_id: request.id,
        note: 'Leave applied',
      },
      approverId,
    )
  }
}

/** Cancel an already-approved leave: set status=cancelled AND post a reversal (+days). */
export async function reverseApprovedLeave(request: LeaveRequest, actorId: string): Promise<void> {
  const { error } = await db
    .from('hr_leave_requests')
    .update({ status: 'cancelled', decision_note: 'Cancelled after approval — balance reversed' })
    .eq('id', request.id)
  if (error) throw error

  await postLedgerEntry(
    {
      employee_id: request.employee_id,
      leave_type_id: request.leave_type_id,
      entry_type: 'reversal',
      quantity: Math.abs(request.days),
      entry_date: request.from_date,
      ref_type: 'leave_request',
      ref_id: request.id,
      note: 'Reversal of cancelled approved leave',
    },
    actorId,
  )
}

// ── Restricted holiday picks ────────────────────────────────────────────────────
export interface RestrictedHolidayPick {
  id: string
  employee_id: string
  holiday_id: string
  calendar_year: number
}

export async function fetchMyRestrictedPicks(employeeId: string, year: number): Promise<RestrictedHolidayPick[]> {
  const { data, error } = await db
    .from('hr_restricted_holiday_picks')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('calendar_year', year)
  if (error) throw error
  return (data ?? []) as RestrictedHolidayPick[]
}

export async function pickRestrictedHoliday(
  employeeId: string,
  holidayId: string,
  year: number,
): Promise<void> {
  const { error } = await db.from('hr_restricted_holiday_picks').insert({
    employee_id: employeeId,
    holiday_id: holidayId,
    calendar_year: year,
  })
  if (error) throw error
}

export async function unpickRestrictedHoliday(id: string): Promise<void> {
  const { error } = await db.from('hr_restricted_holiday_picks').delete().eq('id', id)
  if (error) throw error
}

// ── Comp-off ────────────────────────────────────────────────────────────────────
export interface CompOff {
  id: string
  employee_id: string
  earned_date: string
  source: 'overtime' | 'holiday_work' | 'weekly_off_work' | null
  expires_on: string | null
  status: 'available' | 'used' | 'expired'
}

export async function fetchMyCompOff(employeeId: string, status?: CompOff['status']): Promise<CompOff[]> {
  let q = db.from('hr_comp_off').select('*').eq('employee_id', employeeId)
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('earned_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as CompOff[]
}

// ── Encashments ──────────────────────────────────────────────────────────────────
export interface LeaveEncashment {
  id: string
  employee_id: string
  leave_type_id: string
  days: number
  status: 'requested' | 'approved' | 'paid' | 'rejected'
  amount: number | null
  requested_on: string
}
export interface EncashmentInput {
  employee_id: string
  leave_type_id: string
  days: number
}

export async function fetchEncashments(status?: LeaveEncashment['status']): Promise<LeaveEncashment[]> {
  let q = db.from('hr_leave_encashments').select('*')
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('requested_on', { ascending: false })
  if (error) throw error
  return (data ?? []) as LeaveEncashment[]
}

export async function createEncashment(input: EncashmentInput, createdBy?: string | null): Promise<void> {
  const { error } = await db.from('hr_leave_encashments').insert({ ...input, created_by: createdBy ?? null })
  if (error) throw error
}

/** Approve/reject an encashment. amount stays null — Payroll computes it later. */
export async function decideEncashment(
  id: string,
  approve: boolean,
  approverId: string,
): Promise<void> {
  const { error } = await db
    .from('hr_leave_encashments')
    .update({
      status: approve ? 'approved' : 'rejected',
      approver_id: approverId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

// ── Policy helper (never hardcode leave/holiday rules) ────────────────────────────
export async function fetchHrPolicy(key: string, employeeId?: string | null): Promise<unknown> {
  const { data, error } = await db.rpc('get_hr_policy', {
    p_key: key,
    p_employee_id: employeeId ?? null,
  })
  if (error) throw error
  return data ?? null
}

const LEAVE_POLICY_KEYS = [
  'leave.year_basis',
  'leave.min_unit',
  'leave.notice_days',
  'leave.sandwich',
  'leave.allow_negative',
  'holiday.restricted_quota',
] as const

export type LeavePolicy = Record<string, unknown>

export async function fetchLeavePolicy(employeeId?: string | null): Promise<LeavePolicy> {
  const entries = await Promise.all(
    LEAVE_POLICY_KEYS.map(async k => [k, await fetchHrPolicy(k, employeeId)] as const),
  )
  return Object.fromEntries(entries)
}

/** Inclusive day span between two ISO dates (used to compute request days). */
export function daySpan(fromDate: string, toDate: string): number {
  const a = new Date(fromDate + 'T00:00:00Z').getTime()
  const b = new Date(toDate + 'T00:00:00Z').getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0
  return Math.floor((b - a) / 86_400_000) + 1
}
