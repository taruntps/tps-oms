// HRMS — org masters + HR policy settings data access.
// Tables (migration 088) aren't in the generated Database types yet, so we cast
// `from(...)` to `any`.
import { supabase } from '@/lib/supabase'

const db = supabase as any

// ── Departments ─────────────────────────────────────────────────────────────
export interface Department {
  id: string
  org_id: string | null
  code: string | null
  name: string
  parent_id: string | null
  head_id: string | null
  is_active: boolean
}
export interface DepartmentInput {
  code?: string | null
  name: string
  parent_id?: string | null
  head_id?: string | null
  is_active?: boolean
}

// ── Designations ────────────────────────────────────────────────────────────
export interface Designation {
  id: string
  code: string | null
  name: string
  grade_id: string | null
  is_active: boolean
}
export interface DesignationInput {
  code?: string | null
  name: string
  grade_id?: string | null
  is_active?: boolean
}

// ── Grades ──────────────────────────────────────────────────────────────────
export interface Grade {
  id: string
  code: string | null
  name: string
  level: number | null
  is_active: boolean
}
export interface GradeInput {
  code?: string | null
  name: string
  level?: number | null
  is_active?: boolean
}

// ── Employment types ────────────────────────────────────────────────────────
export interface EmploymentType {
  id: string
  code: string | null
  name: string
  is_active: boolean
}
export interface EmploymentTypeInput {
  code?: string | null
  name: string
  is_active?: boolean
}

// ── Office locations (branches) — read-only lookup ──────────────────────────
export interface OfficeLocation {
  id: string
  name: string
}

export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await db.from('hr_departments').select('*').order('name')
  if (error) throw error
  return (data ?? []) as Department[]
}

export async function fetchDesignations(): Promise<Designation[]> {
  const { data, error } = await db.from('hr_designations').select('*').order('name')
  if (error) throw error
  return (data ?? []) as Designation[]
}

export async function fetchGrades(): Promise<Grade[]> {
  const { data, error } = await db.from('hr_grades').select('*').order('level')
  if (error) throw error
  return (data ?? []) as Grade[]
}

export async function fetchEmploymentTypes(): Promise<EmploymentType[]> {
  const { data, error } = await db.from('hr_employment_types').select('*').order('name')
  if (error) throw error
  return (data ?? []) as EmploymentType[]
}

export async function fetchOfficeLocations(): Promise<OfficeLocation[]> {
  const { data, error } = await db.from('office_locations').select('id, name').order('name')
  if (error) throw error
  return (data ?? []) as OfficeLocation[]
}

// Generic master upsert / delete keyed by table name.
export type MasterTable =
  | 'hr_departments'
  | 'hr_designations'
  | 'hr_grades'
  | 'hr_employment_types'

export async function upsertMaster(
  table: MasterTable,
  input: Record<string, unknown> & { id?: string },
): Promise<void> {
  if (input.id) {
    const { id, ...patch } = input
    const { error } = await db.from(table).update(patch).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await db.from(table).insert(input)
    if (error) throw error
  }
}

export async function deleteMaster(table: MasterTable, id: string): Promise<void> {
  // Soft-deactivate rather than hard delete to preserve FK references.
  const { error } = await db.from(table).update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// ── HR policy settings ──────────────────────────────────────────────────────
export interface PolicySetting {
  id: string
  scope_type: string
  scope_id: string | null
  key: string
  value: unknown
  effective_from: string | null
  effective_to: string | null
  note: string | null
}
export interface PolicySettingInput {
  scope_type: string
  scope_id?: string | null
  key: string
  value: unknown
  effective_from?: string | null
  effective_to?: string | null
  note?: string | null
}

export async function fetchPolicySettings(): Promise<PolicySetting[]> {
  const { data, error } = await db
    .from('hr_policy_settings')
    .select('*')
    .order('key', { ascending: true })
  if (error) throw error
  return (data ?? []) as PolicySetting[]
}

export async function upsertPolicySetting(
  input: PolicySettingInput & { id?: string },
): Promise<void> {
  if (input.id) {
    const { id, ...patch } = input
    const { error } = await db.from('hr_policy_settings').update(patch).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await db.from('hr_policy_settings').insert(input)
    if (error) throw error
  }
}
