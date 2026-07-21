// HRMS — employee master data access (profiles + employee_details).
// New FK columns on `profiles` and the extended `employee_details` (migration 088)
// aren't in the generated Database types yet, so we cast `from(...)` to `any`.
import { supabase } from '@/lib/supabase'

const db = supabase as any

/** Row in the employees directory: profile core + status/DOJ from details. */
export interface EmployeeProfile {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  employee_code: string | null
  designation: string | null // legacy free-text
  department: string | null // legacy free-text
  is_active: boolean | null
  role: string | null
  department_id: string | null
  designation_id: string | null
  grade_id: string | null
  employment_type_id: string | null
  branch_location_id: string | null
  reports_to: string | null
}

/** Extended PII / employment record (1:1 with a profile). */
export interface EmployeeDetails {
  user_id: string
  father_name: string | null
  mother_name: string | null
  date_of_birth: string | null
  date_of_joining: string | null
  higher_qualification: string | null
  aadhar_no: string | null
  pan_no: string | null
  personal_email: string | null
  home_phone: string | null
  permanent_address: string | null
  local_address: string | null
  emergency_contact: string | null
  gender: string | null
  marital_status: string | null
  blood_group: string | null
  nationality: string | null
  photo_url: string | null
  signature_url: string | null
  probation_end_date: string | null
  confirmation_date: string | null
  employee_status: string | null
}

export interface EmployeeListItem extends EmployeeProfile {
  employee_status: string | null
  date_of_joining: string | null
}

const PROFILE_COLS =
  'id, name, email, phone, employee_code, designation, department, is_active, role, department_id, designation_id, grade_id, employment_type_id, branch_location_id, reports_to'

/** Directory: all profiles + status/DOJ joined from employee_details. */
export async function fetchEmployees(): Promise<EmployeeListItem[]> {
  const [{ data: profiles, error: pErr }, { data: details, error: dErr }] = await Promise.all([
    db.from('profiles').select(PROFILE_COLS).order('name', { ascending: true }),
    db.from('employee_details').select('user_id, employee_status, date_of_joining'),
  ])
  if (pErr) throw pErr
  if (dErr) throw dErr

  const detailMap = new Map<string, { employee_status: string | null; date_of_joining: string | null }>()
  for (const d of (details ?? []) as any[]) {
    detailMap.set(d.user_id, { employee_status: d.employee_status ?? null, date_of_joining: d.date_of_joining ?? null })
  }

  return ((profiles ?? []) as EmployeeProfile[]).map(p => ({
    ...p,
    employee_status: detailMap.get(p.id)?.employee_status ?? null,
    date_of_joining: detailMap.get(p.id)?.date_of_joining ?? null,
  }))
}

/** Active profiles for reports-to / head pickers. */
export async function fetchActiveProfiles(): Promise<Pick<EmployeeProfile, 'id' | 'name' | 'role'>[]> {
  const { data, error } = await db
    .from('profiles')
    .select('id, name, role')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Pick<EmployeeProfile, 'id' | 'name' | 'role'>[]
}

export async function fetchEmployee(id: string): Promise<EmployeeProfile> {
  const { data, error } = await db.from('profiles').select(PROFILE_COLS).eq('id', id).single()
  if (error) throw error
  return data as EmployeeProfile
}

export async function fetchEmployeeDetails(id: string): Promise<EmployeeDetails | null> {
  const { data, error } = await db
    .from('employee_details')
    .select('*')
    .eq('user_id', id)
    .maybeSingle()
  if (error) throw error
  return (data as EmployeeDetails) ?? null
}

// ── Create / update ─────────────────────────────────────────────────────────
export interface EmployeeProfileInput {
  name: string
  email?: string | null
  phone?: string | null
  employee_code?: string | null
  department_id?: string | null
  designation_id?: string | null
  grade_id?: string | null
  employment_type_id?: string | null
  branch_location_id?: string | null
  reports_to?: string | null
}

export type EmployeeDetailsInput = Partial<Omit<EmployeeDetails, 'user_id'>>

export async function updateEmployeeProfile(id: string, input: EmployeeProfileInput): Promise<void> {
  const { error } = await db.from('profiles').update(input).eq('id', id)
  if (error) throw error
}

/** Upsert the 1:1 employee_details row (user_id is the PK → profiles.id). */
export async function upsertEmployeeDetails(id: string, input: EmployeeDetailsInput): Promise<void> {
  const { error } = await db
    .from('employee_details')
    .upsert({ user_id: id, ...input }, { onConflict: 'user_id' })
  if (error) throw error
}

export interface EmployeeCreateInput extends EmployeeProfileInput {
  email: string
  password: string
  role: string
  whatsapp?: string | null
}

/**
 * Create a new employee. REUSES the existing `admin_create_user` RPC (reuse-before-create)
 * to provision the auth user + base profile (email/password/name/role/employee_code/phone/
 * whatsapp), then applies the HRMS org FK refs (department/designation/grade/etc.). A single
 * source of truth for identity — no duplicate profile insert.
 */
export async function createEmployee(input: EmployeeCreateInput): Promise<string> {
  const { data, error } = await db.rpc('admin_create_user', {
    p_email: input.email,
    p_password: input.password,
    p_name: input.name,
    p_role: input.role,
    p_employee_code: input.employee_code ?? null,
    p_phone: input.phone ?? null,
    p_whatsapp: input.whatsapp ?? null,
  })
  if (error) throw error
  const id = data as string
  await updateEmployeeProfile(id, {
    name: input.name,
    department_id: input.department_id ?? null,
    designation_id: input.designation_id ?? null,
    grade_id: input.grade_id ?? null,
    employment_type_id: input.employment_type_id ?? null,
    branch_location_id: input.branch_location_id ?? null,
    reports_to: input.reports_to ?? null,
  })
  return id
}
