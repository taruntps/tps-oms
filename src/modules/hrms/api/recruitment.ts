// HRMS — Recruitment (M5) data access: requisitions, postings, candidates,
// applications, interviews, feedback, offers. Internal-only recruitment.
// Migration 094 tables aren't in the generated Database types yet, so `from(...)`/
// `rpc(...)` are cast to `any`. Money (budget_ctc / current_ctc / expected_ctc / ctc)
// is stored in paise (bigint) — format via fmtPaise (÷100) in the UI.
import { supabase } from '@/lib/supabase'

const db = supabase as any

// ── Requisitions ─────────────────────────────────────────────────────────────
export type RequisitionStatus =
  | 'draft' | 'pending' | 'approved' | 'on_hold' | 'closed' | 'rejected'

export interface JobRequisition {
  id: string
  department_id: string | null
  designation_id: string | null
  grade_id: string | null
  headcount: number
  budget_ctc: number | null
  justification: string | null
  status: RequisitionStatus
  raised_by: string | null
  approved_by: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}
export interface RequisitionInput {
  department_id?: string | null
  designation_id?: string | null
  grade_id?: string | null
  headcount: number
  budget_ctc?: number | null
  justification?: string | null
}

export async function fetchRequisitions(status?: RequisitionStatus): Promise<JobRequisition[]> {
  let q = db.from('hr_job_requisitions').select('*')
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as JobRequisition[]
}

export async function createRequisition(input: RequisitionInput, raisedBy?: string | null): Promise<string> {
  const { data, error } = await db
    .from('hr_job_requisitions')
    .insert({ ...input, raised_by: raisedBy ?? null, status: 'draft' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function updateRequisition(id: string, input: RequisitionInput): Promise<void> {
  const { error } = await db
    .from('hr_job_requisitions')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Submit a draft for approval. */
export async function submitRequisition(id: string): Promise<void> {
  const { error } = await db
    .from('hr_job_requisitions')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Single-level approval: approve/reject a pending requisition (approver_id + status). */
export async function decideRequisition(
  id: string,
  approve: boolean,
  approverId: string,
): Promise<void> {
  const { error } = await db
    .from('hr_job_requisitions')
    .update({
      status: approve ? 'approved' : 'rejected',
      approved_by: approverId,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

/** Non-approval status transitions (on_hold / closed / re-open to approved). */
export async function setRequisitionStatus(id: string, status: RequisitionStatus): Promise<void> {
  const { error } = await db
    .from('hr_job_requisitions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── Postings ─────────────────────────────────────────────────────────────────
export type PostingStatus = 'open' | 'closed'
export interface JobPosting {
  id: string
  requisition_id: string | null
  title: string
  description: string | null
  channel: 'internal'
  status: PostingStatus
  valid_until: string | null
  created_at: string
}
export interface PostingInput {
  requisition_id?: string | null
  title: string
  description?: string | null
  valid_until?: string | null
}

export async function fetchPostings(status?: PostingStatus): Promise<JobPosting[]> {
  let q = db.from('hr_job_postings').select('*')
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as JobPosting[]
}

export async function createPosting(input: PostingInput): Promise<string> {
  const { data, error } = await db
    .from('hr_job_postings')
    .insert({ ...input, channel: 'internal', status: 'open' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function setPostingStatus(id: string, status: PostingStatus): Promise<void> {
  const { error } = await db.from('hr_job_postings').update({ status }).eq('id', id)
  if (error) throw error
}

// ── Candidates ───────────────────────────────────────────────────────────────
export type CandidateStatus =
  | 'new' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected'

export interface Candidate {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: string | null
  resume_document_id: string | null
  current_ctc: number | null
  expected_ctc: number | null
  status: CandidateStatus
  created_by: string | null
  created_at: string
  updated_at: string
}
export interface CandidateInput {
  name: string
  email?: string | null
  phone?: string | null
  source?: string | null
  resume_document_id?: string | null
  current_ctc?: number | null
  expected_ctc?: number | null
}

export async function fetchCandidates(status?: CandidateStatus): Promise<Candidate[]> {
  let q = db.from('hr_candidates').select('*')
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Candidate[]
}

export async function fetchCandidate(id: string): Promise<Candidate> {
  const { data, error } = await db.from('hr_candidates').select('*').eq('id', id).single()
  if (error) throw error
  return data as Candidate
}

export async function createCandidate(input: CandidateInput, createdBy?: string | null): Promise<string> {
  const { data, error } = await db
    .from('hr_candidates')
    .insert({ ...input, created_by: createdBy ?? null, status: 'new' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function updateCandidate(id: string, input: CandidateInput): Promise<void> {
  const { error } = await db
    .from('hr_candidates')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function setCandidateStatus(id: string, status: CandidateStatus): Promise<void> {
  const { error } = await db
    .from('hr_candidates')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── Applications ─────────────────────────────────────────────────────────────
export type ApplicationStatus = 'active' | 'rejected' | 'hired' | 'withdrawn'
export interface CandidateApplication {
  id: string
  candidate_id: string
  posting_id: string | null
  stage: string | null
  status: ApplicationStatus
  created_at: string
}
export interface ApplicationInput {
  candidate_id: string
  posting_id?: string | null
  stage?: string | null
}

export async function fetchApplications(candidateId: string): Promise<CandidateApplication[]> {
  const { data, error } = await db
    .from('hr_candidate_applications')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CandidateApplication[]
}

export async function createApplication(input: ApplicationInput): Promise<string> {
  const { data, error } = await db
    .from('hr_candidate_applications')
    .insert({ ...input, status: 'active' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function setApplicationStage(id: string, stage: string): Promise<void> {
  const { error } = await db.from('hr_candidate_applications').update({ stage }).eq('id', id)
  if (error) throw error
}

export async function setApplicationStatus(id: string, status: ApplicationStatus): Promise<void> {
  const { error } = await db.from('hr_candidate_applications').update({ status }).eq('id', id)
  if (error) throw error
}

// ── Interviews ───────────────────────────────────────────────────────────────
export type InterviewStatus = 'scheduled' | 'done' | 'cancelled' | 'no_show'
export interface Interview {
  id: string
  application_id: string
  stage: string | null
  scheduled_at: string | null
  interviewer_id: string | null
  status: InterviewStatus
  created_at: string
}
export interface InterviewInput {
  application_id: string
  stage?: string | null
  scheduled_at?: string | null
  interviewer_id?: string | null
}

export async function fetchInterviews(applicationId: string): Promise<Interview[]> {
  const { data, error } = await db
    .from('hr_interviews')
    .select('*')
    .eq('application_id', applicationId)
    .order('scheduled_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Interview[]
}

export async function createInterview(input: InterviewInput): Promise<string> {
  const { data, error } = await db
    .from('hr_interviews')
    .insert({ ...input, status: 'scheduled' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function setInterviewStatus(id: string, status: InterviewStatus): Promise<void> {
  const { error } = await db.from('hr_interviews').update({ status }).eq('id', id)
  if (error) throw error
}

// ── Interview feedback ───────────────────────────────────────────────────────
export type Recommendation = 'hire' | 'hold' | 'reject'
export interface InterviewFeedback {
  id: string
  interview_id: string
  interviewer_id: string | null
  score: number | null
  recommendation: Recommendation | null
  notes: string | null
  created_at: string
}
export interface FeedbackInput {
  interview_id: string
  score?: number | null
  recommendation?: Recommendation | null
  notes?: string | null
}

export async function fetchFeedback(interviewId: string): Promise<InterviewFeedback[]> {
  const { data, error } = await db
    .from('hr_interview_feedback')
    .select('*')
    .eq('interview_id', interviewId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InterviewFeedback[]
}

export async function submitFeedback(input: FeedbackInput, interviewerId?: string | null): Promise<void> {
  const { error } = await db
    .from('hr_interview_feedback')
    .insert({ ...input, interviewer_id: interviewerId ?? null })
  if (error) throw error
  // Mark the interview done once feedback is captured.
  await setInterviewStatus(input.interview_id, 'done')
}

// ── Offers ───────────────────────────────────────────────────────────────────
export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'
export interface Offer {
  id: string
  application_id: string
  ctc: number | null
  joining_date: string | null
  template_id: string | null
  document_id: string | null
  status: OfferStatus
  approved_by: string | null
  created_at: string
  updated_at: string
}
export interface OfferInput {
  application_id: string
  ctc?: number | null
  joining_date?: string | null
  document_id?: string | null
}

export async function fetchOffers(applicationId: string): Promise<Offer[]> {
  const { data, error } = await db
    .from('hr_offers')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Offer[]
}

export async function createOffer(input: OfferInput): Promise<string> {
  const { data, error } = await db
    .from('hr_offers')
    .insert({ ...input, status: 'draft' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

/** Single-level approval: mark an offer sent (approver_id + status). */
export async function sendOffer(id: string, approverId: string): Promise<void> {
  const { error } = await db
    .from('hr_offers')
    .update({ status: 'sent', approved_by: approverId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function setOfferStatus(id: string, status: OfferStatus): Promise<void> {
  const { error } = await db
    .from('hr_offers')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── Accept offer → provision employee + kick off onboarding ─────────────────
export interface AcceptOfferInput {
  offer: Offer
  application: CandidateApplication
  candidate: Candidate
  role: string
  password: string
  employee_code?: string | null
}

/**
 * Accept an offer and provision the hired person as an employee. REUSES the existing
 * `admin_create_user` RPC (same as M1's createEmployee — reuse-before-create) to create
 * the auth user + base profile, then spins up an `hr_onboarding` from the default
 * ('Standard Onboarding') template and materialises its checklist tasks. Also advances
 * the offer → accepted, application → hired, candidate → hired. Returns the new employee id.
 */
export async function acceptOffer(input: AcceptOfferInput): Promise<string> {
  const { offer, application, candidate, role, password, employee_code } = input

  // 1. Provision the employee (single source of truth for identity).
  const { data: empId, error: rpcErr } = await db.rpc('admin_create_user', {
    p_email: candidate.email,
    p_password: password,
    p_name: candidate.name,
    p_role: role,
    p_employee_code: employee_code ?? null,
    p_phone: candidate.phone ?? null,
    p_whatsapp: null,
  })
  if (rpcErr) throw rpcErr
  const employeeId = empId as string

  // 2. Advance recruitment records.
  await setOfferStatus(offer.id, 'accepted')
  await setApplicationStatus(application.id, 'hired')
  await setCandidateStatus(candidate.id, 'hired')

  // 3. Kick off onboarding from the default template.
  const { data: tmpl } = await db
    .from('hr_onboarding_templates')
    .select('id, tasks')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: ob, error: obErr } = await db
    .from('hr_onboarding')
    .insert({ employee_id: employeeId, template_id: tmpl?.id ?? null, status: 'in_progress' })
    .select('id')
    .single()
  if (obErr) throw obErr
  const onboardingId = (ob as { id: string }).id

  const tasks: string[] = Array.isArray(tmpl?.tasks) ? (tmpl!.tasks as string[]) : []
  if (tasks.length) {
    const rows = tasks.map(title => ({ onboarding_id: onboardingId, title, status: 'pending' }))
    const { error: tErr } = await db.from('hr_onboarding_tasks').insert(rows)
    if (tErr) throw tErr
  }

  return employeeId
}
