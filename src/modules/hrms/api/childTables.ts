// HRMS — generic CRUD for the employee child tables (migration 088).
// Every child table shares the shape (id, employee_id → profiles.id, ...columns).
// A single set of table-agnostic helpers backs the config-driven CRUD UI so we
// don't repeat ten near-identical modules.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type ChildTable =
  | 'hr_employee_bank'
  | 'hr_employee_statutory_ids'
  | 'hr_employee_nominees'
  | 'hr_emergency_contacts'
  | 'hr_employee_qualifications'
  | 'hr_employee_experience'
  | 'hr_employee_skills'
  | 'hr_employee_family'
  | 'hr_employee_medical'

export type ChildRow = { id: string; employee_id: string } & Record<string, any>

export async function fetchChildRows(table: ChildTable, employeeId: string): Promise<ChildRow[]> {
  const { data, error } = await db
    .from(table)
    .select('*')
    .eq('employee_id', employeeId)
    .order('id', { ascending: true })
  if (error) throw error
  return (data ?? []) as ChildRow[]
}

export async function insertChildRow(
  table: ChildTable,
  employeeId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from(table).insert({ ...payload, employee_id: employeeId })
  if (error) throw error
}

export async function updateChildRow(
  table: ChildTable,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from(table).update(payload).eq('id', id)
  if (error) throw error
}

export async function deleteChildRow(table: ChildTable, id: string): Promise<void> {
  const { error } = await db.from(table).delete().eq('id', id)
  if (error) throw error
}

// ── Lifecycle status events — append-only, read-only in M1 ───────────────────
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

export async function fetchStatusEvents(employeeId: string): Promise<StatusEvent[]> {
  const { data, error } = await db
    .from('hr_employee_status_events')
    .select('*')
    .eq('employee_id', employeeId)
    .order('effective_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as StatusEvent[]
}
