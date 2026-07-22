// HRMS — Leave/attendance configuration data access (M3).
// CRUD for hr_leave_types, hr_holidays, and the status masters (hr_attendance_statuses,
// hr_day_types). Migration 090 tables aren't in the generated Database types yet, so
// `from(...)` is cast to `any`.
import { supabase } from '@/lib/supabase'
import type { LeaveType } from './leave'

const db = supabase as any

// ── Leave types CRUD ──────────────────────────────────────────────────────────
export interface LeaveTypeInput {
  code: string
  name: string
  is_paid?: boolean
  is_encashable?: boolean
  requires_proof?: boolean
  unit?: 'day' | 'half_day'
  applies_to?: 'all' | 'male' | 'female'
  annual_quota?: number
  carry_forward_cap?: number
  is_active?: boolean
}

export async function fetchAllLeaveTypes(): Promise<LeaveType[]> {
  const { data, error } = await db.from('hr_leave_types').select('*').order('code')
  if (error) throw error
  return (data ?? []) as LeaveType[]
}

export async function upsertLeaveType(input: LeaveTypeInput & { id?: string }): Promise<void> {
  if (input.id) {
    const { id, ...patch } = input
    const { error } = await db.from('hr_leave_types').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await db.from('hr_leave_types').insert(input)
    if (error) throw error
  }
}

export async function deactivateLeaveType(id: string): Promise<void> {
  const { error } = await db.from('hr_leave_types').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// ── Holidays CRUD ───────────────────────────────────────────────────────────────
export interface Holiday {
  id: string
  holiday_date: string
  name: string
  holiday_type: 'gazetted' | 'restricted' | 'optional'
  branch_id: string | null
  calendar_year: number
  is_active: boolean
}
export interface HolidayInput {
  holiday_date: string
  name: string
  holiday_type?: 'gazetted' | 'restricted' | 'optional'
  branch_id?: string | null
  calendar_year: number
  is_active?: boolean
}

export async function fetchHolidays(year?: number | null): Promise<Holiday[]> {
  let q = db.from('hr_holidays').select('*')
  if (year) q = q.eq('calendar_year', year)
  const { data, error } = await q.order('holiday_date')
  if (error) throw error
  return (data ?? []) as Holiday[]
}

/** Active restricted-type holidays for a year (the pool an employee may pick from). */
export async function fetchRestrictedHolidays(year: number): Promise<Holiday[]> {
  const { data, error } = await db
    .from('hr_holidays')
    .select('*')
    .eq('calendar_year', year)
    .eq('holiday_type', 'restricted')
    .eq('is_active', true)
    .order('holiday_date')
  if (error) throw error
  return (data ?? []) as Holiday[]
}

export async function upsertHoliday(input: HolidayInput & { id?: string }): Promise<void> {
  if (input.id) {
    const { id, ...patch } = input
    const { error } = await db.from('hr_holidays').update(patch).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await db.from('hr_holidays').insert(input)
    if (error) throw error
  }
}

export async function deactivateHoliday(id: string): Promise<void> {
  const { error } = await db.from('hr_holidays').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// ── Status masters (M3 configurability) ───────────────────────────────────────────
export interface AttendanceStatusMaster {
  id: string
  code: string
  label: string
  category: 'present' | 'absent' | 'leave' | 'holiday' | 'off' | 'exception'
  is_paid: boolean
  sort_order: number
  is_active: boolean
}
export interface AttendanceStatusInput {
  code: string
  label: string
  category: AttendanceStatusMaster['category']
  is_paid?: boolean
  sort_order?: number
  is_active?: boolean
}

export interface DayTypeMaster {
  id: string
  code: string
  label: string
  is_working: boolean
  sort_order: number
  is_active: boolean
}
export interface DayTypeInput {
  code: string
  label: string
  is_working?: boolean
  sort_order?: number
  is_active?: boolean
}

export async function fetchAttendanceStatuses(): Promise<AttendanceStatusMaster[]> {
  const { data, error } = await db.from('hr_attendance_statuses').select('*').order('sort_order')
  if (error) throw error
  return (data ?? []) as AttendanceStatusMaster[]
}

export async function upsertAttendanceStatus(input: AttendanceStatusInput & { id?: string }): Promise<void> {
  if (input.id) {
    const { id, ...patch } = input
    const { error } = await db.from('hr_attendance_statuses').update(patch).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await db.from('hr_attendance_statuses').insert(input)
    if (error) throw error
  }
}

export async function deactivateAttendanceStatus(id: string): Promise<void> {
  const { error } = await db.from('hr_attendance_statuses').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

export async function fetchDayTypes(): Promise<DayTypeMaster[]> {
  const { data, error } = await db.from('hr_day_types').select('*').order('sort_order')
  if (error) throw error
  return (data ?? []) as DayTypeMaster[]
}

export async function upsertDayType(input: DayTypeInput & { id?: string }): Promise<void> {
  if (input.id) {
    const { id, ...patch } = input
    const { error } = await db.from('hr_day_types').update(patch).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await db.from('hr_day_types').insert(input)
    if (error) throw error
  }
}

export async function deactivateDayType(id: string): Promise<void> {
  const { error } = await db.from('hr_day_types').update({ is_active: false }).eq('id', id)
  if (error) throw error
}
