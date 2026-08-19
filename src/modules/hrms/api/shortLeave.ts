// HRMS — Short leave (migration 105). 2h/month per employee, credited & lapsing
// monthly. Application → approval. Table/RPCs aren't in generated types → cast.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type ShortLeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type ShortLeaveSlot = 'late_in' | 'early_out' | 'general'

export interface ShortLeave {
  id: string
  employee_id: string
  leave_date: string
  hours: number
  slot: ShortLeaveSlot
  reason: string | null
  status: ShortLeaveStatus
  note: string | null
  reviewed_at: string | null
  created_at: string
  profiles?: { name: string | null; employee_code: string | null } | null
}

export interface ShortLeaveInput { leave_date: string; hours: 1 | 2; slot: ShortLeaveSlot; reason?: string | null }

export const SLOT_LABEL: Record<ShortLeaveSlot, string> = {
  late_in: 'Late arrival', early_out: 'Early departure', general: 'General',
}

/** One employee's short leaves (most recent first). */
export async function fetchMyShortLeaves(employeeId: string): Promise<ShortLeave[]> {
  const { data, error } = await db.from('hr_short_leaves')
    .select('*').eq('employee_id', employeeId).order('leave_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as ShortLeave[]
}

/** All pending short leaves with the employee name (admin queue). */
export async function fetchPendingShortLeaves(): Promise<ShortLeave[]> {
  const { data, error } = await db.from('hr_short_leaves')
    .select('*, profiles:employee_id(name, employee_code)')
    .eq('status', 'pending').order('leave_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as ShortLeave[]
}

export async function submitShortLeave(input: ShortLeaveInput): Promise<string> {
  const { data, error } = await db.rpc('submit_short_leave', {
    p_date: input.leave_date, p_hours: input.hours, p_slot: input.slot, p_reason: input.reason ?? null,
  })
  if (error) throw error
  return data as string
}

export async function reviewShortLeave(id: string, approve: boolean, note?: string | null): Promise<void> {
  const { error } = await db.rpc('review_short_leave', { p_id: id, p_approve: approve, p_note: note ?? null })
  if (error) throw error
}

export async function cancelShortLeave(id: string): Promise<void> {
  const { error } = await db.from('hr_short_leaves').update({ status: 'cancelled' }).eq('id', id)
  if (error) throw error
}

/** Hours committed (approved + pending) in the month containing `ymDate` (YYYY-MM). */
export function usedHoursForMonth(rows: ShortLeave[], ym: string): number {
  return rows
    .filter(r => (r.status === 'approved' || r.status === 'pending') && r.leave_date.slice(0, 7) === ym)
    .reduce((sum, r) => sum + Number(r.hours), 0)
}
