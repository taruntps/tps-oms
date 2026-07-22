// HRMS — Employee Lifecycle + Onboarding (M5) React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchStatusEvents,
  recordStatusEvent,
  fetchSeparations,
  createSeparation,
  approveSeparation,
  setSeparationStatus,
  fetchExitInterview,
  saveExitInterview,
  fetchFnf,
  draftFnf,
  approveFnf,
  setFnfStatus,
  type StatusEventInput,
  type SeparationInput,
  type SeparationStatus,
  type ExitInterviewInput,
  type FnfInput,
  type FnfStatus,
} from '../api/lifecycle'
import {
  fetchOnboardingTemplates,
  fetchOnboardings,
  startOnboarding,
  completeOnboarding,
  fetchOnboardingTasks,
  addOnboardingTask,
  setOnboardingTaskStatus,
  type OnboardingStatus,
  type OnboardingTaskInput,
  type OnboardingTaskStatus,
} from '../api/onboarding'

const LC = ['hrms', 'lifecycle'] as const
const OB = ['hrms', 'onboarding'] as const

// ── Lifecycle status events (reuse M1 hr_employee_status_events) ──────────────
export function useStatusEvents(employeeId: string) {
  return useQuery({
    queryKey: [...LC, 'events', employeeId],
    enabled: !!employeeId,
    queryFn: () => fetchStatusEvents(employeeId),
  })
}

export function useRecordStatusEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: StatusEventInput) => recordStatusEvent(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...LC, 'events', v.employee_id] })
      toast.success('Lifecycle event recorded')
    },
    onError: (e: Error) => toast.error('Failed to record event', e.message),
  })
}

// ── Separations ──────────────────────────────────────────────────────────────
export function useSeparations(status?: SeparationStatus) {
  return useQuery({
    queryKey: [...LC, 'separations', status ?? 'all'],
    queryFn: () => fetchSeparations(status),
  })
}

export function useCreateSeparation(createdBy?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SeparationInput) => createSeparation(input, createdBy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LC, 'separations'] })
      toast.success('Separation initiated')
    },
    onError: (e: Error) => toast.error('Failed to initiate separation', e.message),
  })
}

export function useApproveSeparation(approverId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => approveSeparation(id, approverId ?? ''),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LC, 'separations'] })
      toast.success('Separation approved')
    },
    onError: (e: Error) => toast.error('Approval failed', e.message),
  })
}

export function useSetSeparationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; status: SeparationStatus }) => setSeparationStatus(args.id, args.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LC, 'separations'] })
      toast.success('Status updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

// ── Exit interviews ──────────────────────────────────────────────────────────
export function useExitInterview(separationId: string) {
  return useQuery({
    queryKey: [...LC, 'exit', separationId],
    enabled: !!separationId,
    queryFn: () => fetchExitInterview(separationId),
  })
}

export function useSaveExitInterview(conductedBy?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ExitInterviewInput) => saveExitInterview(input, conductedBy),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...LC, 'exit', v.separation_id] })
      toast.success('Exit interview saved')
    },
    onError: (e: Error) => toast.error('Save failed', e.message),
  })
}

// ── F&F settlements ──────────────────────────────────────────────────────────
export function useFnf(separationId: string) {
  return useQuery({
    queryKey: [...LC, 'fnf', separationId],
    enabled: !!separationId,
    queryFn: () => fetchFnf(separationId),
  })
}

export function useDraftFnf(createdBy?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: FnfInput) => draftFnf(input, createdBy),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...LC, 'fnf', v.separation_id] })
      toast.success('F&F drafted')
    },
    onError: (e: Error) => toast.error('Failed to draft F&F', e.message),
  })
}

export function useApproveFnf(separationId: string, approverId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => approveFnf(id, approverId ?? ''),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LC, 'fnf', separationId] })
      toast.success('F&F approved')
    },
    onError: (e: Error) => toast.error('Approval failed', e.message),
  })
}

export function useSetFnfStatus(separationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; status: FnfStatus }) => setFnfStatus(args.id, args.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LC, 'fnf', separationId] })
      toast.success('F&F updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

// ── Onboarding ───────────────────────────────────────────────────────────────
export function useOnboardingTemplates() {
  return useQuery({
    queryKey: [...OB, 'templates'],
    queryFn: fetchOnboardingTemplates,
    staleTime: 5 * 60_000,
  })
}

export function useOnboardings(status?: OnboardingStatus) {
  return useQuery({
    queryKey: [...OB, 'runs', status ?? 'all'],
    queryFn: () => fetchOnboardings(status),
  })
}

export function useStartOnboarding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { employeeId: string; templateId: string | null }) =>
      startOnboarding(args.employeeId, args.templateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...OB, 'runs'] })
      toast.success('Onboarding started')
    },
    onError: (e: Error) => toast.error('Failed to start onboarding', e.message),
  })
}

export function useCompleteOnboarding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => completeOnboarding(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...OB, 'runs'] })
      toast.success('Onboarding completed')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

export function useOnboardingTasks(onboardingId: string) {
  return useQuery({
    queryKey: [...OB, 'tasks', onboardingId],
    enabled: !!onboardingId,
    queryFn: () => fetchOnboardingTasks(onboardingId),
  })
}

export function useAddOnboardingTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: OnboardingTaskInput) => addOnboardingTask(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...OB, 'tasks', v.onboarding_id] })
      toast.success('Task added')
    },
    onError: (e: Error) => toast.error('Failed to add task', e.message),
  })
}

export function useSetOnboardingTaskStatus(onboardingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; status: OnboardingTaskStatus }) =>
      setOnboardingTaskStatus(args.id, args.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...OB, 'tasks', onboardingId] })
      toast.success('Task updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}
