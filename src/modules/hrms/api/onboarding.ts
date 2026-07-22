// HRMS — Onboarding (M5) data access: templates, onboarding runs, checklist tasks.
// Migration 094 tables aren't in the generated Database types yet, so `from(...)` is
// cast to `any`.
import { supabase } from '@/lib/supabase'

const db = supabase as any

// ── Templates ────────────────────────────────────────────────────────────────
export interface OnboardingTemplate {
  id: string
  name: string
  tasks: string[]
  is_active: boolean
  created_at: string
}

export async function fetchOnboardingTemplates(): Promise<OnboardingTemplate[]> {
  const { data, error } = await db
    .from('hr_onboarding_templates')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((t: any) => ({
    ...t,
    tasks: Array.isArray(t.tasks) ? (t.tasks as string[]) : [],
  })) as OnboardingTemplate[]
}

// ── Onboarding runs ──────────────────────────────────────────────────────────
export type OnboardingStatus = 'in_progress' | 'completed'
export interface Onboarding {
  id: string
  employee_id: string
  template_id: string | null
  status: OnboardingStatus
  started_at: string
  completed_at: string | null
  created_at: string
}

export async function fetchOnboardings(status?: OnboardingStatus): Promise<Onboarding[]> {
  let q = db.from('hr_onboarding').select('*')
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('started_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Onboarding[]
}

/** Start onboarding for an employee from a template, materialising its checklist tasks. */
export async function startOnboarding(employeeId: string, templateId: string | null): Promise<string> {
  let tasks: string[] = []
  if (templateId) {
    const { data: tmpl } = await db
      .from('hr_onboarding_templates')
      .select('tasks')
      .eq('id', templateId)
      .maybeSingle()
    tasks = Array.isArray(tmpl?.tasks) ? (tmpl!.tasks as string[]) : []
  }

  const { data: ob, error } = await db
    .from('hr_onboarding')
    .insert({ employee_id: employeeId, template_id: templateId, status: 'in_progress' })
    .select('id')
    .single()
  if (error) throw error
  const onboardingId = (ob as { id: string }).id

  if (tasks.length) {
    const rows = tasks.map(title => ({ onboarding_id: onboardingId, title, status: 'pending' }))
    const { error: tErr } = await db.from('hr_onboarding_tasks').insert(rows)
    if (tErr) throw tErr
  }
  return onboardingId
}

export async function completeOnboarding(id: string): Promise<void> {
  const { error } = await db
    .from('hr_onboarding')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── Checklist tasks ──────────────────────────────────────────────────────────
export type OnboardingTaskStatus = 'pending' | 'done' | 'waived'
export interface OnboardingTask {
  id: string
  onboarding_id: string
  title: string
  owner_id: string | null
  due_date: string | null
  status: OnboardingTaskStatus
  document_id: string | null
  created_at: string
}
export interface OnboardingTaskInput {
  onboarding_id: string
  title: string
  owner_id?: string | null
  due_date?: string | null
}

export async function fetchOnboardingTasks(onboardingId: string): Promise<OnboardingTask[]> {
  const { data, error } = await db
    .from('hr_onboarding_tasks')
    .select('*')
    .eq('onboarding_id', onboardingId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as OnboardingTask[]
}

export async function addOnboardingTask(input: OnboardingTaskInput): Promise<void> {
  const { error } = await db.from('hr_onboarding_tasks').insert({ ...input, status: 'pending' })
  if (error) throw error
}

export async function setOnboardingTaskStatus(id: string, status: OnboardingTaskStatus): Promise<void> {
  const { error } = await db.from('hr_onboarding_tasks').update({ status }).eq('id', id)
  if (error) throw error
}
