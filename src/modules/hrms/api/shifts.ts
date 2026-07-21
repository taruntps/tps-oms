// HRMS — Attendance (M2): shift catalogue + effective-dated allocations.
// Migration 089 tables aren't in the generated Database types yet → `from(...)` cast to `any`.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export interface Shift {
  id: string
  code: string
  name: string
  start_time: string
  end_time: string
  break_minutes: number
  is_night: boolean
  is_active: boolean
}
export interface ShiftInput {
  code: string
  name: string
  start_time: string
  end_time: string
  break_minutes?: number
  is_night?: boolean
  is_active?: boolean
}

export interface ShiftAllocation {
  id: string
  employee_id: string
  shift_id: string
  effective_from: string
  effective_to: string | null
}
export interface ShiftAllocationInput {
  employee_id: string
  shift_id: string
  effective_from: string
  effective_to?: string | null
}

export async function fetchShifts(): Promise<Shift[]> {
  const { data, error } = await db.from('hr_shifts').select('*').order('name')
  if (error) throw error
  return (data ?? []) as Shift[]
}

export async function upsertShift(input: ShiftInput & { id?: string }): Promise<void> {
  if (input.id) {
    const { id, ...patch } = input
    const { error } = await db.from('hr_shifts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await db.from('hr_shifts').insert(input)
    if (error) throw error
  }
}

export async function deactivateShift(id: string): Promise<void> {
  // Soft-deactivate to preserve allocation FK references.
  const { error } = await db.from('hr_shifts').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

export async function fetchShiftAllocations(): Promise<ShiftAllocation[]> {
  const { data, error } = await db
    .from('hr_shift_allocations')
    .select('*')
    .order('effective_from', { ascending: false })
  if (error) throw error
  return (data ?? []) as ShiftAllocation[]
}

export async function createShiftAllocation(input: ShiftAllocationInput): Promise<void> {
  const { error } = await db.from('hr_shift_allocations').insert(input)
  if (error) throw error
}

export async function deleteShiftAllocation(id: string): Promise<void> {
  const { error } = await db.from('hr_shift_allocations').delete().eq('id', id)
  if (error) throw error
}
