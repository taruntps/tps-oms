// HRMS — Performance Management (M6) data access: review cycles, goals (KRA/KPI/goal),
// single-level reviews (self / manager / calibration / final), and increment/promotion
// recommendations. Internal-only, mirrors the M5 recruitment pattern.
// Migration 095 tables aren't in the generated Database types yet, so `from(...)` is
// cast to `any`. `proposed_value` on a recommendation is a free-form string (a %/amount
// or a target designation) — Payroll (M4) links a salary_revision_id later.
import { supabase } from '@/lib/supabase'

const db = supabase as any

// ── Review cycles ─────────────────────────────────────────────────────────────
export type CycleType = 'quarterly' | 'annual' | 'probation'
export type CycleStatus = 'open' | 'in_review' | 'calibration' | 'closed'

export interface ReviewCycle {
  id: string
  name: string
  period_start: string | null
  period_end: string | null
  type: CycleType
  status: CycleStatus
  created_at: string
  updated_at: string
}
export interface CycleInput {
  name: string
  period_start?: string | null
  period_end?: string | null
  type: CycleType
}

export async function fetchCycles(status?: CycleStatus): Promise<ReviewCycle[]> {
  let q = db.from('hr_review_cycles').select('*')
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('period_start', { ascending: false, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as ReviewCycle[]
}

export async function fetchCycle(id: string): Promise<ReviewCycle> {
  const { data, error } = await db.from('hr_review_cycles').select('*').eq('id', id).single()
  if (error) throw error
  return data as ReviewCycle
}

export async function createCycle(input: CycleInput): Promise<string> {
  const { data, error } = await db
    .from('hr_review_cycles')
    .insert({ ...input, status: 'open' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function updateCycle(id: string, input: CycleInput): Promise<void> {
  const { error } = await db
    .from('hr_review_cycles')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Advance a cycle through open → in_review → calibration → closed (any transition). */
export async function setCycleStatus(id: string, status: CycleStatus): Promise<void> {
  const { error } = await db
    .from('hr_review_cycles')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── Goals (KRA / KPI / goal) ──────────────────────────────────────────────────
export type GoalCategory = 'KRA' | 'KPI' | 'goal'
export type GoalStatus = 'active' | 'achieved' | 'partial' | 'dropped'

export interface Goal {
  id: string
  employee_id: string
  cycle_id: string
  category: GoalCategory
  title: string
  weight: number | null
  target: string | null
  status: GoalStatus
  created_at: string
  updated_at: string
}
export interface GoalInput {
  employee_id: string
  cycle_id: string
  category: GoalCategory
  title: string
  weight?: number | null
  target?: string | null
}

/** Goals for one employee within one cycle. */
export async function fetchGoals(employeeId: string, cycleId: string): Promise<Goal[]> {
  const { data, error } = await db
    .from('hr_goals')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Goal[]
}

/** All goals in a cycle (across employees) — for the team/report views. */
export async function fetchCycleGoals(cycleId: string): Promise<Goal[]> {
  const { data, error } = await db
    .from('hr_goals')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Goal[]
}

export async function createGoal(input: GoalInput): Promise<string> {
  const { data, error } = await db
    .from('hr_goals')
    .insert({ ...input, status: 'active' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function updateGoal(id: string, input: Partial<GoalInput>): Promise<void> {
  const { error } = await db
    .from('hr_goals')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function setGoalStatus(id: string, status: GoalStatus): Promise<void> {
  const { error } = await db
    .from('hr_goals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await db.from('hr_goals').delete().eq('id', id)
  if (error) throw error
}

// ── Reviews (single-level: stage + reviewer_id + status) ──────────────────────
export type ReviewStage = 'self' | 'manager' | 'calibration' | 'final'
export type ReviewStatus = 'draft' | 'submitted'

export interface Review {
  id: string
  employee_id: string
  cycle_id: string
  stage: ReviewStage
  reviewer_id: string | null
  rating: number | null
  comments: string | null
  status: ReviewStatus
  created_at: string
  updated_at: string
}
export interface ReviewInput {
  employee_id: string
  cycle_id: string
  stage: ReviewStage
  rating?: number | null
  comments?: string | null
}

/** All reviews for one employee in a cycle (self/manager/calibration/final). */
export async function fetchReviews(employeeId: string, cycleId: string): Promise<Review[]> {
  const { data, error } = await db
    .from('hr_reviews')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Review[]
}

/** All reviews in a cycle (across employees) — for the team/report views. */
export async function fetchCycleReviews(cycleId: string): Promise<Review[]> {
  const { data, error } = await db
    .from('hr_reviews')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Review[]
}

/**
 * Upsert a review for a (employee, cycle, stage) — the table has a unique constraint on
 * that triple. `submit=false` saves a draft; `submit=true` marks it submitted. Stamps the
 * acting reviewer_id. Handles both first save and later edits.
 */
export async function saveReview(
  input: ReviewInput,
  reviewerId: string | null,
  submit: boolean,
): Promise<void> {
  const { error } = await db
    .from('hr_reviews')
    .upsert(
      {
        ...input,
        reviewer_id: reviewerId,
        status: submit ? 'submitted' : 'draft',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'employee_id,cycle_id,stage' },
    )
  if (error) throw error
}

// ── Recommendations (increment / promotion) ───────────────────────────────────
export type RecommendationType = 'increment' | 'promotion'
export type RecommendationStatus = 'proposed' | 'approved' | 'rejected'

export interface Recommendation {
  id: string
  employee_id: string
  cycle_id: string
  type: RecommendationType
  proposed_value: string | null
  status: RecommendationStatus
  approved_by: string | null
  salary_revision_id: string | null
  created_at: string
  updated_at: string
}
export interface RecommendationInput {
  employee_id: string
  cycle_id: string
  type: RecommendationType
  proposed_value?: string | null
}

/** Recommendations for one employee in a cycle. */
export async function fetchRecommendations(employeeId: string, cycleId: string): Promise<Recommendation[]> {
  const { data, error } = await db
    .from('hr_recommendations')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Recommendation[]
}

/** All recommendations in a cycle (across employees) — for the setup/report views. */
export async function fetchCycleRecommendations(cycleId: string): Promise<Recommendation[]> {
  const { data, error } = await db
    .from('hr_recommendations')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Recommendation[]
}

/** Raise a new increment/promotion recommendation (status = proposed). */
export async function createRecommendation(input: RecommendationInput): Promise<string> {
  const { data, error } = await db
    .from('hr_recommendations')
    .insert({ ...input, status: 'proposed' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

/**
 * Single-level decision on a recommendation: approve/reject (approved_by + status).
 * salary_revision_id is left null for Payroll (M4) to link a salary revision later.
 */
export async function decideRecommendation(
  id: string,
  approve: boolean,
  approverId: string,
): Promise<void> {
  const { error } = await db
    .from('hr_recommendations')
    .update({
      status: approve ? 'approved' : 'rejected',
      approved_by: approverId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

// ── Report helper ─────────────────────────────────────────────────────────────
export interface CycleReport {
  ratings: { bucket: string; count: number }[]
  goals: { total: number; achieved: number; partial: number; active: number; dropped: number }
  reviewsByStage: Record<ReviewStage, number>
  employeesFinalised: number
}

/**
 * Assemble the reporting matrix for a cycle: final-rating distribution (bucketed),
 * goals-progress totals, and per-stage submitted-review counts. Mirrors the
 * getBalanceMatrix-style aggregation used by the Leave reports.
 */
export async function getCycleReport(cycleId: string): Promise<CycleReport> {
  const [goals, reviews] = await Promise.all([
    fetchCycleGoals(cycleId),
    fetchCycleReviews(cycleId),
  ])

  const goalTotals = { total: goals.length, achieved: 0, partial: 0, active: 0, dropped: 0 }
  for (const g of goals) goalTotals[g.status] += 1

  const reviewsByStage: Record<ReviewStage, number> = { self: 0, manager: 0, calibration: 0, final: 0 }
  for (const r of reviews) if (r.status === 'submitted') reviewsByStage[r.stage] += 1

  // Ratings distribution — buckets over submitted FINAL reviews (the calibrated outcome).
  const buckets = [
    { bucket: '4.5–5', min: 4.5, max: 5.01 },
    { bucket: '3.5–4.5', min: 3.5, max: 4.5 },
    { bucket: '2.5–3.5', min: 2.5, max: 3.5 },
    { bucket: '1.5–2.5', min: 1.5, max: 2.5 },
    { bucket: '< 1.5', min: -Infinity, max: 1.5 },
  ]
  const finals = reviews.filter(r => r.stage === 'final' && r.status === 'submitted' && r.rating != null)
  const ratings = buckets.map(b => ({
    bucket: b.bucket,
    count: finals.filter(r => Number(r.rating) >= b.min && Number(r.rating) < b.max).length,
  }))

  return {
    ratings,
    goals: goalTotals,
    reviewsByStage,
    employeesFinalised: finals.length,
  }
}
