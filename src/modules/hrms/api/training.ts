// HRMS — Training & Development (M7) data access: trainings (calendar/list), enrolments
// (nominate / attended / completed / no_show + score), and certification tracking with
// expiry reminders. Internal-only, mirrors the M6 performance pattern.
// Migration 096 tables aren't in the generated Database types yet, so `from(...)` is cast
// to `any`. `cost` is stored in paise (bigint) — format via fmtPaise (÷100) in the UI.
import { supabase } from '@/lib/supabase'

const db = supabase as any

// ── Trainings ──────────────────────────────────────────────────────────────────
export type TrainingType = 'internal' | 'external'
export type TrainingStatus = 'planned' | 'ongoing' | 'completed' | 'cancelled'

export interface Training {
  id: string
  title: string
  type: TrainingType
  trainer: string | null
  start_date: string | null
  end_date: string | null
  cost: number
  status: TrainingStatus
  created_by: string | null
  created_at: string
  updated_at: string
}
export interface TrainingInput {
  title: string
  type: TrainingType
  trainer?: string | null
  start_date?: string | null
  end_date?: string | null
  cost?: number
}

export async function fetchTrainings(status?: TrainingStatus): Promise<Training[]> {
  let q = db.from('hr_trainings').select('*')
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('start_date', { ascending: false, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as Training[]
}

export async function fetchTraining(id: string): Promise<Training> {
  const { data, error } = await db.from('hr_trainings').select('*').eq('id', id).single()
  if (error) throw error
  return data as Training
}

export async function createTraining(input: TrainingInput): Promise<string> {
  const { data, error } = await db
    .from('hr_trainings')
    .insert({ ...input, status: 'planned' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function updateTraining(id: string, input: Partial<TrainingInput>): Promise<void> {
  const { error } = await db
    .from('hr_trainings')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Advance a training through planned → ongoing → completed / cancelled (any transition). */
export async function setTrainingStatus(id: string, status: TrainingStatus): Promise<void> {
  const { error } = await db
    .from('hr_trainings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── Enrolments ─────────────────────────────────────────────────────────────────
export type EnrolmentStatus = 'nominated' | 'attended' | 'completed' | 'no_show'

export interface Enrolment {
  id: string
  training_id: string
  employee_id: string
  status: EnrolmentStatus
  score: number | null
  created_at: string
}
export interface EnrolmentInput {
  training_id: string
  employee_id: string
}

/** Enrolments for one training (across employees) — for the manage view. */
export async function fetchEnrolments(trainingId: string): Promise<Enrolment[]> {
  const { data, error } = await db
    .from('hr_training_enrolments')
    .select('*')
    .eq('training_id', trainingId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Enrolment[]
}

/** Enrolments for one employee (across trainings) — for the self-service view. */
export async function fetchMyEnrolments(employeeId: string): Promise<Enrolment[]> {
  const { data, error } = await db
    .from('hr_training_enrolments')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Enrolment[]
}

/** Nominate an employee onto a training (status = nominated). */
export async function nominate(input: EnrolmentInput): Promise<string> {
  const { data, error } = await db
    .from('hr_training_enrolments')
    .insert({ ...input, status: 'nominated' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

/** Update an enrolment's status (mark attended / no_show), optionally with a score. */
export async function setEnrolmentStatus(
  id: string,
  status: EnrolmentStatus,
  score?: number | null,
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (score !== undefined) patch.score = score
  const { error } = await db.from('hr_training_enrolments').update(patch).eq('id', id)
  if (error) throw error
}

/** Mark an enrolment completed, recording a completion score. */
export async function completeEnrolment(id: string, score: number | null): Promise<void> {
  const { error } = await db
    .from('hr_training_enrolments')
    .update({ status: 'completed', score })
    .eq('id', id)
  if (error) throw error
}

export async function removeEnrolment(id: string): Promise<void> {
  const { error } = await db.from('hr_training_enrolments').delete().eq('id', id)
  if (error) throw error
}

// ── Certifications ─────────────────────────────────────────────────────────────
export interface Certification {
  id: string
  employee_id: string
  name: string
  authority: string | null
  issued_on: string | null
  expires_on: string | null
  document_id: string | null
  created_by: string | null
  created_at: string
}
export interface CertificationInput {
  employee_id: string
  name: string
  authority?: string | null
  issued_on?: string | null
  expires_on?: string | null
  document_id?: string | null
}

/** All certifications (across employees) — for the HR certifications register. */
export async function fetchCertifications(): Promise<Certification[]> {
  const { data, error } = await db
    .from('hr_certifications')
    .select('*')
    .order('expires_on', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as Certification[]
}

/** Certifications for one employee — for the self-service view. */
export async function fetchMyCertifications(employeeId: string): Promise<Certification[]> {
  const { data, error } = await db
    .from('hr_certifications')
    .select('*')
    .eq('employee_id', employeeId)
    .order('expires_on', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as Certification[]
}

export async function createCertification(input: CertificationInput): Promise<string> {
  const { data, error } = await db
    .from('hr_certifications')
    .insert({ ...input })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function updateCertification(id: string, input: Partial<CertificationInput>): Promise<void> {
  const { error } = await db.from('hr_certifications').update({ ...input }).eq('id', id)
  if (error) throw error
}

export async function deleteCertification(id: string): Promise<void> {
  const { error } = await db.from('hr_certifications').delete().eq('id', id)
  if (error) throw error
}

/**
 * Certifications expiring within the next `days` days (inclusive of already-expired).
 * Filters on expires_on ≤ today+days; useful for compliance/expiry reminders.
 */
export async function expiringCertifications(days: number): Promise<Certification[]> {
  const cutoff = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await db
    .from('hr_certifications')
    .select('*')
    .not('expires_on', 'is', null)
    .lte('expires_on', cutoff)
    .order('expires_on', { ascending: true })
  if (error) throw error
  return (data ?? []) as Certification[]
}
