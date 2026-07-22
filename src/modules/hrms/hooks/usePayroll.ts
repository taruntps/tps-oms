// HRMS — Payroll (M4): payroll runs, lines, validation, approve/lock, payslips,
// Finance handoff + bank advice React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchRuns,
  fetchRun,
  fetchRunLines,
  fetchComponentLines,
  createRun,
  computeRun,
  validateRun,
  approveRun,
  rejectRun,
  lockRun,
  generatePayslips,
  fetchPayslips,
  type CreateRunInput,
} from '../api/payroll'
import {
  fetchHandoff,
  setHandoffStatus,
  fetchBankAdvice,
  fetchBankAdviceLines,
  generateBankAdvice,
  markBankAdviceExported,
  type HandoffStatus,
} from '../api/payrollFinance'

const PR = ['hrms', 'payroll'] as const

// ── Runs ──────────────────────────────────────────────────────────────────────
export function useRuns() {
  return useQuery({ queryKey: [...PR, 'runs'], queryFn: fetchRuns })
}

export function useRun(id?: string) {
  return useQuery({ queryKey: [...PR, 'run', id], enabled: !!id, queryFn: () => fetchRun(id!) })
}

export function useRunLines(runId?: string) {
  return useQuery({ queryKey: [...PR, 'lines', runId], enabled: !!runId, queryFn: () => fetchRunLines(runId!) })
}

export function useComponentLines(lineIds: string[]) {
  const key = lineIds.slice().sort().join(',')
  return useQuery({
    queryKey: [...PR, 'component-lines', key],
    enabled: lineIds.length > 0,
    queryFn: () => fetchComponentLines(lineIds),
  })
}

export function useCreateRun(actorId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRunInput) => createRun(input, actorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...PR, 'runs'] })
      toast.success('Payroll run created')
    },
    onError: (e: Error) => toast.error('Create failed', e.message),
  })
}

export function useComputeRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => computeRun(runId),
    onSuccess: (count, runId) => {
      qc.invalidateQueries({ queryKey: [...PR, 'runs'] })
      qc.invalidateQueries({ queryKey: [...PR, 'run', runId] })
      qc.invalidateQueries({ queryKey: [...PR, 'lines', runId] })
      qc.invalidateQueries({ queryKey: [...PR, 'component-lines'] })
      toast.success(`Computed ${count} payroll line${count === 1 ? '' : 's'}`)
    },
    onError: (e: Error) => toast.error('Compute failed', e.message),
  })
}

export function useValidateRun(runId?: string) {
  return useQuery({
    queryKey: [...PR, 'validate', runId],
    enabled: !!runId,
    queryFn: () => validateRun(runId!),
  })
}

export function useApproveRun(approverId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => approveRun(runId, approverId ?? ''),
    onSuccess: (_d, runId) => {
      qc.invalidateQueries({ queryKey: [...PR, 'runs'] })
      qc.invalidateQueries({ queryKey: [...PR, 'run', runId] })
      toast.success('Run approved')
    },
    onError: (e: Error) => toast.error('Approval failed', e.message),
  })
}

export function useRejectRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { runId: string; note?: string | null }) => rejectRun(args.runId, args.note),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...PR, 'runs'] })
      qc.invalidateQueries({ queryKey: [...PR, 'run', v.runId] })
      toast.success('Run returned to draft')
    },
    onError: (e: Error) => toast.error('Reject failed', e.message),
  })
}

export function useLockRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => lockRun(runId),
    onSuccess: (_d, runId) => {
      qc.invalidateQueries({ queryKey: [...PR, 'runs'] })
      qc.invalidateQueries({ queryKey: [...PR, 'run', runId] })
      qc.invalidateQueries({ queryKey: [...PR, 'handoff', runId] })
      toast.success('Run locked — Finance handoff created')
    },
    onError: (e: Error) => toast.error('Lock failed', e.message),
  })
}

// ── Payslips ──────────────────────────────────────────────────────────────────
export function useGeneratePayslips() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => generatePayslips(runId),
    onSuccess: (count, runId) => {
      qc.invalidateQueries({ queryKey: [...PR, 'payslips'] })
      qc.invalidateQueries({ queryKey: [...PR, 'payslips-run', runId] })
      toast.success(`Published ${count} payslip${count === 1 ? '' : 's'}`)
    },
    onError: (e: Error) => toast.error('Publish failed', e.message),
  })
}

export function usePayslips(opts: { employeeId?: string | null; runId?: string | null }) {
  return useQuery({
    queryKey: [...PR, 'payslips', opts.employeeId ?? 'all', opts.runId ?? 'all'],
    queryFn: () => fetchPayslips(opts),
  })
}

// ── Finance handoff ─────────────────────────────────────────────────────────────
export function useHandoff(runId?: string) {
  return useQuery({ queryKey: [...PR, 'handoff', runId], enabled: !!runId, queryFn: () => fetchHandoff(runId!) })
}

export function useSetHandoffStatus(actorId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { runId: string; status: HandoffStatus; financeRef?: string | null; notes?: string | null }) =>
      setHandoffStatus(args.runId, args.status, { actorId, financeRef: args.financeRef, notes: args.notes }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...PR, 'handoff', v.runId] })
      qc.invalidateQueries({ queryKey: [...PR, 'run', v.runId] })
      toast.success(`Handoff → ${v.status}`)
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

// ── Bank advice ─────────────────────────────────────────────────────────────────
export function useBankAdvice(runId?: string) {
  return useQuery({ queryKey: [...PR, 'bank-advice', runId], enabled: !!runId, queryFn: () => fetchBankAdvice(runId!) })
}

export function useBankAdviceLines(adviceId?: string) {
  return useQuery({
    queryKey: [...PR, 'bank-advice-lines', adviceId],
    enabled: !!adviceId,
    queryFn: () => fetchBankAdviceLines(adviceId!),
  })
}

export function useGenerateBankAdvice(actorId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => generateBankAdvice(runId, actorId),
    onSuccess: (_d, runId) => {
      qc.invalidateQueries({ queryKey: [...PR, 'bank-advice', runId] })
      toast.success('Bank advice generated')
    },
    onError: (e: Error) => toast.error('Generation failed', e.message),
  })
}

export function useMarkBankAdviceExported() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (adviceId: string) => markBankAdviceExported(adviceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...PR, 'bank-advice'] })
      toast.success('Bank advice exported')
    },
    onError: (e: Error) => toast.error('Export failed', e.message),
  })
}
