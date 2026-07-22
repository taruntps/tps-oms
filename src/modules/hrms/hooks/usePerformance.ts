// HRMS — Performance Management (M6) React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchCycles,
  fetchCycle,
  createCycle,
  updateCycle,
  setCycleStatus,
  fetchGoals,
  fetchCycleGoals,
  createGoal,
  updateGoal,
  setGoalStatus,
  deleteGoal,
  fetchReviews,
  fetchCycleReviews,
  saveReview,
  fetchRecommendations,
  fetchCycleRecommendations,
  createRecommendation,
  decideRecommendation,
  getCycleReport,
  type CycleInput,
  type CycleStatus,
  type GoalInput,
  type GoalStatus,
  type ReviewInput,
  type RecommendationInput,
} from '../api/performance'

const PF = ['hrms', 'performance'] as const

// ── Cycles ─────────────────────────────────────────────────────────────────────
export function useCycles(status?: CycleStatus) {
  return useQuery({
    queryKey: [...PF, 'cycles', status ?? 'all'],
    queryFn: () => fetchCycles(status),
  })
}

export function useCycle(id: string) {
  return useQuery({
    queryKey: [...PF, 'cycle', id],
    enabled: !!id,
    queryFn: () => fetchCycle(id),
  })
}

export function useCreateCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CycleInput) => createCycle(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...PF, 'cycles'] })
      toast.success('Cycle created')
    },
    onError: (e: Error) => toast.error('Failed to create cycle', e.message),
  })
}

export function useUpdateCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; input: CycleInput }) => updateCycle(args.id, args.input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...PF, 'cycles'] })
      qc.invalidateQueries({ queryKey: [...PF, 'cycle', v.id] })
      toast.success('Cycle updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

export function useSetCycleStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; status: CycleStatus }) => setCycleStatus(args.id, args.status),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...PF, 'cycles'] })
      qc.invalidateQueries({ queryKey: [...PF, 'cycle', v.id] })
      toast.success('Cycle status updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

// ── Goals ────────────────────────────────────────────────────────────────────
export function useGoals(employeeId: string, cycleId: string) {
  return useQuery({
    queryKey: [...PF, 'goals', employeeId, cycleId],
    enabled: !!employeeId && !!cycleId,
    queryFn: () => fetchGoals(employeeId, cycleId),
  })
}

export function useCycleGoals(cycleId: string) {
  return useQuery({
    queryKey: [...PF, 'cycle-goals', cycleId],
    enabled: !!cycleId,
    queryFn: () => fetchCycleGoals(cycleId),
  })
}

export function useCreateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: GoalInput) => createGoal(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...PF, 'goals', v.employee_id, v.cycle_id] })
      qc.invalidateQueries({ queryKey: [...PF, 'cycle-goals', v.cycle_id] })
      toast.success('Goal added')
    },
    onError: (e: Error) => toast.error('Failed to add goal', e.message),
  })
}

export function useUpdateGoal(employeeId: string, cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; input: Partial<GoalInput> }) => updateGoal(args.id, args.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...PF, 'goals', employeeId, cycleId] })
      qc.invalidateQueries({ queryKey: [...PF, 'cycle-goals', cycleId] })
      toast.success('Goal updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

export function useSetGoalStatus(employeeId: string, cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; status: GoalStatus }) => setGoalStatus(args.id, args.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...PF, 'goals', employeeId, cycleId] })
      qc.invalidateQueries({ queryKey: [...PF, 'cycle-goals', cycleId] })
      toast.success('Goal status updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

export function useDeleteGoal(employeeId: string, cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteGoal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...PF, 'goals', employeeId, cycleId] })
      qc.invalidateQueries({ queryKey: [...PF, 'cycle-goals', cycleId] })
      toast.success('Goal removed')
    },
    onError: (e: Error) => toast.error('Delete failed', e.message),
  })
}

// ── Reviews ──────────────────────────────────────────────────────────────────
export function useReviews(employeeId: string, cycleId: string) {
  return useQuery({
    queryKey: [...PF, 'reviews', employeeId, cycleId],
    enabled: !!employeeId && !!cycleId,
    queryFn: () => fetchReviews(employeeId, cycleId),
  })
}

export function useCycleReviews(cycleId: string) {
  return useQuery({
    queryKey: [...PF, 'cycle-reviews', cycleId],
    enabled: !!cycleId,
    queryFn: () => fetchCycleReviews(cycleId),
  })
}

/** Save/submit a review. Invalidates both per-employee and cycle-wide review caches. */
export function useSaveReview(reviewerId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { input: ReviewInput; submit: boolean }) =>
      saveReview(args.input, reviewerId ?? null, args.submit),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...PF, 'reviews', v.input.employee_id, v.input.cycle_id] })
      qc.invalidateQueries({ queryKey: [...PF, 'cycle-reviews', v.input.cycle_id] })
      qc.invalidateQueries({ queryKey: [...PF, 'report', v.input.cycle_id] })
      toast.success(v.submit ? 'Review submitted' : 'Draft saved')
    },
    onError: (e: Error) => toast.error('Failed to save review', e.message),
  })
}

// ── Recommendations ───────────────────────────────────────────────────────────
export function useRecommendations(employeeId: string, cycleId: string) {
  return useQuery({
    queryKey: [...PF, 'recommendations', employeeId, cycleId],
    enabled: !!employeeId && !!cycleId,
    queryFn: () => fetchRecommendations(employeeId, cycleId),
  })
}

export function useCycleRecommendations(cycleId: string) {
  return useQuery({
    queryKey: [...PF, 'cycle-recommendations', cycleId],
    enabled: !!cycleId,
    queryFn: () => fetchCycleRecommendations(cycleId),
  })
}

export function useCreateRecommendation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RecommendationInput) => createRecommendation(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...PF, 'recommendations', v.employee_id, v.cycle_id] })
      qc.invalidateQueries({ queryKey: [...PF, 'cycle-recommendations', v.cycle_id] })
      toast.success('Recommendation raised')
    },
    onError: (e: Error) => toast.error('Failed to raise recommendation', e.message),
  })
}

export function useDecideRecommendation(cycleId: string, approverId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; approve: boolean }) =>
      decideRecommendation(args.id, args.approve, approverId ?? ''),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...PF, 'cycle-recommendations', cycleId] })
      qc.invalidateQueries({ queryKey: [...PF, 'recommendations'] })
      toast.success(v.approve ? 'Recommendation approved' : 'Recommendation rejected')
    },
    onError: (e: Error) => toast.error('Decision failed', e.message),
  })
}

// ── Report ─────────────────────────────────────────────────────────────────────
export function useCycleReport(cycleId: string) {
  return useQuery({
    queryKey: [...PF, 'report', cycleId],
    enabled: !!cycleId,
    queryFn: () => getCycleReport(cycleId),
  })
}
