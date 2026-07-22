// HRMS — Payroll (M4): salary component master, structures, effective-dated employee salary
// assignment and revisions. Money = bigint paise (stored/transported as numeric strings to
// avoid JS float). Nothing hardcoded — components + structures live in the DB.
// Migration 093 tables aren't in the generated Database types yet → `const db = supabase as any`.
import { supabase } from '@/lib/supabase'
import type { ComponentDef, ComponentType, CalcType } from './payroll'

const db = supabase as any

export type { ComponentDef, ComponentType, CalcType }

// ── Component master ──────────────────────────────────────────────────────────
export interface ComponentMasterRow extends ComponentDef {
  id: string
  depends_on: string | null
  is_part_of_ctc: boolean
  is_active: boolean
}
export interface ComponentInput {
  code: string
  name: string
  type: ComponentType
  calc_type: CalcType
  base_code?: string | null
  depends_on?: string | null
  is_taxable?: boolean
  is_pf_wage?: boolean
  is_esi_wage?: boolean
  is_part_of_ctc?: boolean
  is_part_of_gross?: boolean
  prorate_on_lop?: boolean
  sort_order?: number
  is_active?: boolean
}

export async function fetchComponents(): Promise<ComponentMasterRow[]> {
  const { data, error } = await db.from('hr_component_master').select('*').order('sort_order')
  if (error) throw error
  return (data ?? []) as ComponentMasterRow[]
}

export async function createComponent(input: ComponentInput): Promise<void> {
  const { error } = await db.from('hr_component_master').insert(input)
  if (error) throw error
}

export async function updateComponent(id: string, input: Partial<ComponentInput>): Promise<void> {
  const { error } = await db.from('hr_component_master').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ── Salary structures + template lines ────────────────────────────────────────
export interface SalaryStructure {
  id: string
  code: string
  name: string
  grade_id: string | null
  is_active: boolean
}
export interface SalaryStructureInput {
  code: string
  name: string
  grade_id?: string | null
  is_active?: boolean
}
export interface StructureComponent {
  id: string
  structure_id: string
  component_code: string
  value_type: 'amount' | 'percent'
  value: number
  sort_order: number
}
export interface StructureComponentInput {
  component_code: string
  value_type: 'amount' | 'percent'
  /** amount → paise; percent → the percentage number */
  value: number
  sort_order?: number
}

export async function fetchStructures(): Promise<SalaryStructure[]> {
  const { data, error } = await db.from('hr_salary_structures').select('*').order('code')
  if (error) throw error
  return (data ?? []) as SalaryStructure[]
}

export async function fetchStructureComponents(structureId: string): Promise<StructureComponent[]> {
  const { data, error } = await db
    .from('hr_salary_components')
    .select('*')
    .eq('structure_id', structureId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as StructureComponent[]
}

export async function createStructure(input: SalaryStructureInput): Promise<SalaryStructure> {
  const { data, error } = await db.from('hr_salary_structures').insert(input).select('*').single()
  if (error) throw error
  return data as SalaryStructure
}

export async function updateStructure(id: string, input: Partial<SalaryStructureInput>): Promise<void> {
  const { error } = await db.from('hr_salary_structures').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

/** Replace a structure's template lines (delete + reinsert). */
export async function setStructureComponents(structureId: string, lines: StructureComponentInput[]): Promise<void> {
  const { error: delErr } = await db.from('hr_salary_components').delete().eq('structure_id', structureId)
  if (delErr) throw delErr
  if (lines.length === 0) return
  const { error } = await db.from('hr_salary_components').insert(
    lines.map((l, i) => ({
      structure_id: structureId,
      component_code: l.component_code,
      value_type: l.value_type,
      value: l.value,
      sort_order: l.sort_order ?? i,
    })),
  )
  if (error) throw error
}

// ── Effective-dated employee salary assignment ────────────────────────────────
export interface EmployeeSalary {
  id: string
  employee_id: string
  structure_id: string | null
  ctc: number
  effective_from: string
  effective_to: string | null
  status: 'active' | 'superseded'
  created_by: string | null
  created_at: string
}
export interface EmployeeSalaryComponent {
  id: string
  employee_salary_id: string
  component_code: string
  amount: number | null
  percent: number | null
}
export interface AssignSalaryInput {
  employee_id: string
  structure_id?: string | null
  /** annual CTC in paise */
  ctc: number
  effective_from: string
  /** resolved per-employee component values (amount in paise or percent) */
  components: { component_code: string; amount?: number | null; percent?: number | null }[]
  reason?: string | null
  source?: 'review' | 'promotion' | 'manual'
}

export async function fetchEmployeeSalaries(employeeId: string): Promise<EmployeeSalary[]> {
  const { data, error } = await db
    .from('hr_employee_salary')
    .select('*')
    .eq('employee_id', employeeId)
    .order('effective_from', { ascending: false })
  if (error) throw error
  return (data ?? []) as EmployeeSalary[]
}

export async function fetchCurrentSalary(employeeId: string): Promise<EmployeeSalary | null> {
  const { data, error } = await db
    .from('hr_employee_salary')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('status', 'active')
    .order('effective_from', { ascending: false })
    .limit(1)
  if (error) throw error
  return ((data ?? [])[0] as EmployeeSalary) ?? null
}

export async function fetchSalaryComponents(employeeSalaryId: string): Promise<EmployeeSalaryComponent[]> {
  const { data, error } = await db
    .from('hr_employee_salary_components')
    .select('*')
    .eq('employee_salary_id', employeeSalaryId)
  if (error) throw error
  return (data ?? []) as EmployeeSalaryComponent[]
}

/**
 * Assign (or revise) salary effective-dated. Supersedes the prior active row (sets its
 * effective_to = new effective_from − 1 day, status=superseded), inserts a new active row +
 * its resolved components, and records a `hr_salary_revisions` link. History is preserved —
 * nothing is overwritten; historical runs reproduce from the row effective at their period.
 */
export async function assignSalary(input: AssignSalaryInput, actorId?: string | null): Promise<EmployeeSalary> {
  const prior = await fetchCurrentSalary(input.employee_id)

  if (prior) {
    const priorEnd = isoDayBefore(input.effective_from)
    const { error: supErr } = await db
      .from('hr_employee_salary')
      .update({ status: 'superseded', effective_to: priorEnd })
      .eq('id', prior.id)
    if (supErr) throw supErr
  }

  const { data: created, error: insErr } = await db
    .from('hr_employee_salary')
    .insert({
      employee_id: input.employee_id,
      structure_id: input.structure_id ?? null,
      ctc: input.ctc,
      effective_from: input.effective_from,
      effective_to: null,
      status: 'active',
      created_by: actorId ?? null,
    })
    .select('*')
    .single()
  if (insErr) throw insErr
  const newSalary = created as EmployeeSalary

  if (input.components.length > 0) {
    const { error: compErr } = await db.from('hr_employee_salary_components').insert(
      input.components.map((c) => ({
        employee_salary_id: newSalary.id,
        component_code: c.component_code,
        amount: c.amount ?? null,
        percent: c.percent ?? null,
      })),
    )
    if (compErr) throw compErr
  }

  // Revision link (history).
  const { error: revErr } = await db.from('hr_salary_revisions').insert({
    employee_id: input.employee_id,
    from_salary_id: prior?.id ?? null,
    to_salary_id: newSalary.id,
    effective_date: input.effective_from,
    reason: input.reason ?? null,
    source: input.source ?? 'manual',
    approved_by: actorId ?? null,
  })
  if (revErr) throw revErr

  return newSalary
}

export interface SalaryRevision {
  id: string
  employee_id: string
  from_salary_id: string | null
  to_salary_id: string
  effective_date: string
  reason: string | null
  source: string | null
  approved_by: string | null
  created_at: string
}

export async function fetchRevisions(employeeId: string): Promise<SalaryRevision[]> {
  const { data, error } = await db
    .from('hr_salary_revisions')
    .select('*')
    .eq('employee_id', employeeId)
    .order('effective_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as SalaryRevision[]
}

// ── Organizations (run scope) ─────────────────────────────────────────────────
export interface OrgOption {
  id: string
  legal_name: string | null
}
export async function fetchOrganizations(): Promise<OrgOption[]> {
  const { data, error } = await db.from('organizations').select('id, legal_name').order('legal_name')
  if (error) throw error
  return (data ?? []) as OrgOption[]
}

// ── helpers ───────────────────────────────────────────────────────────────────
function isoDayBefore(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
