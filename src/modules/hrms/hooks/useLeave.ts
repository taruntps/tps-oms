// HRMS — Leave Management (M3) React Query hooks.
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchActiveLeaveTypes,
  fetchLeaveBalance,
  fetchLeaveBalances,
  fetchLedgerEntries,
  postLedgerEntry,
  fetchMyLeaveRequests,
  fetchLeaveRequests,
  createLeaveRequest,
  cancelLeaveRequest,
  decideLeaveRequest,
  reverseApprovedLeave,
  fetchMyRestrictedPicks,
  pickRestrictedHoliday,
  unpickRestrictedHoliday,
  fetchMyCompOff,
  fetchEncashments,
  createEncashment,
  decideEncashment,
  fetchLeavePolicy,
  type LeaveRequestInput,
  type LeaveRequest,
  type LeaveDecisionInput,
  type LedgerEntryInput,
  type EncashmentInput,
  type RequestStatus,
} from '../api/leave'

const LV = ['hrms', 'leave'] as const

export function useLeavePolicy(employeeId?: string | null) {
  return useQuery({
    queryKey: [...LV, 'policy', employeeId ?? 'company'],
    queryFn: () => fetchLeavePolicy(employeeId),
    staleTime: 5 * 60_000,
  })
}

// ── Leave types ────────────────────────────────────────────────────────────────
export function useActiveLeaveTypes() {
  return useQuery({
    queryKey: [...LV, 'types', 'active'],
    queryFn: fetchActiveLeaveTypes,
    staleTime: 5 * 60_000,
  })
}

// ── Balances ────────────────────────────────────────────────────────────────────
export function useLeaveBalances(employeeId?: string, year?: number | null) {
  return useQuery({
    queryKey: [...LV, 'balances', employeeId, year ?? 'all'],
    enabled: !!employeeId,
    queryFn: () => fetchLeaveBalances(employeeId!, year),
  })
}

/** Balance for a set of (employee, leaveType) pairs — used by the reports view. */
export function useLeaveBalanceMatrix(
  pairs: { employeeId: string; leaveTypeId: string }[],
  year?: number | null,
) {
  return useQueries({
    queries: pairs.map(p => ({
      queryKey: [...LV, 'balance', p.employeeId, p.leaveTypeId, year ?? 'all'],
      queryFn: () => fetchLeaveBalance(p.employeeId, p.leaveTypeId, year),
      staleTime: 60_000,
    })),
  })
}

export function useLedgerEntries(employeeId?: string, leaveTypeId?: string | null) {
  return useQuery({
    queryKey: [...LV, 'ledger', employeeId, leaveTypeId ?? 'all'],
    enabled: !!employeeId,
    queryFn: () => fetchLedgerEntries(employeeId!, leaveTypeId),
  })
}

export function usePostLedgerEntry(actorId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LedgerEntryInput) => postLedgerEntry(input, actorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LV, 'ledger'] })
      qc.invalidateQueries({ queryKey: [...LV, 'balances'] })
      qc.invalidateQueries({ queryKey: [...LV, 'balance'] })
      toast.success('Ledger entry posted')
    },
    onError: (e: Error) => toast.error('Failed to post entry', e.message),
  })
}

// ── Requests (self) ──────────────────────────────────────────────────────────────
export function useMyLeaveRequests(employeeId?: string) {
  return useQuery({
    queryKey: [...LV, 'my-requests', employeeId],
    enabled: !!employeeId,
    queryFn: () => fetchMyLeaveRequests(employeeId!),
  })
}

export function useCreateLeaveRequest(employeeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LeaveRequestInput) => createLeaveRequest(employeeId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LV, 'my-requests', employeeId] })
      qc.invalidateQueries({ queryKey: [...LV, 'requests'] })
      toast.success('Leave requested')
    },
    onError: (e: Error) => toast.error('Request failed', e.message),
  })
}

export function useCancelLeaveRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cancelLeaveRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LV, 'my-requests'] })
      qc.invalidateQueries({ queryKey: [...LV, 'requests'] })
      toast.success('Leave cancelled')
    },
    onError: (e: Error) => toast.error('Cancel failed', e.message),
  })
}

// ── Requests (team/all) + approvals ──────────────────────────────────────────────
export function useLeaveRequests(status?: RequestStatus) {
  return useQuery({
    queryKey: [...LV, 'requests', status ?? 'all'],
    queryFn: () => fetchLeaveRequests(status),
  })
}

export function useDecideLeaveRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LeaveDecisionInput) => decideLeaveRequest(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...LV, 'requests'] })
      qc.invalidateQueries({ queryKey: [...LV, 'my-requests'] })
      qc.invalidateQueries({ queryKey: [...LV, 'balances'] })
      qc.invalidateQueries({ queryKey: [...LV, 'balance'] })
      qc.invalidateQueries({ queryKey: [...LV, 'ledger'] })
      toast.success(v.approve ? 'Leave approved' : 'Leave rejected')
    },
    onError: (e: Error) => toast.error('Decision failed', e.message),
  })
}

export function useReverseApprovedLeave(actorId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (request: LeaveRequest) => reverseApprovedLeave(request, actorId ?? ''),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LV, 'requests'] })
      qc.invalidateQueries({ queryKey: [...LV, 'my-requests'] })
      qc.invalidateQueries({ queryKey: [...LV, 'balances'] })
      qc.invalidateQueries({ queryKey: [...LV, 'balance'] })
      qc.invalidateQueries({ queryKey: [...LV, 'ledger'] })
      toast.success('Approved leave cancelled & balance reversed')
    },
    onError: (e: Error) => toast.error('Reversal failed', e.message),
  })
}

// ── Restricted holidays ──────────────────────────────────────────────────────────
export function useMyRestrictedPicks(employeeId?: string, year?: number) {
  return useQuery({
    queryKey: [...LV, 'restricted-picks', employeeId, year],
    enabled: !!employeeId && !!year,
    queryFn: () => fetchMyRestrictedPicks(employeeId!, year!),
  })
}

export function usePickRestrictedHoliday(employeeId: string, year: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (holidayId: string) => pickRestrictedHoliday(employeeId, holidayId, year),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LV, 'restricted-picks', employeeId, year] })
      toast.success('Restricted holiday selected')
    },
    onError: (e: Error) => toast.error('Selection failed', e.message),
  })
}

export function useUnpickRestrictedHoliday(employeeId: string, year: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unpickRestrictedHoliday(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LV, 'restricted-picks', employeeId, year] })
      toast.success('Selection removed')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}

// ── Comp-off ─────────────────────────────────────────────────────────────────────
export function useMyCompOff(employeeId?: string, status?: 'available' | 'used' | 'expired') {
  return useQuery({
    queryKey: [...LV, 'comp-off', employeeId, status ?? 'all'],
    enabled: !!employeeId,
    queryFn: () => fetchMyCompOff(employeeId!, status),
  })
}

// ── Encashments ──────────────────────────────────────────────────────────────────
export function useEncashments(status?: 'requested' | 'approved' | 'paid' | 'rejected') {
  return useQuery({
    queryKey: [...LV, 'encashments', status ?? 'all'],
    queryFn: () => fetchEncashments(status),
  })
}

export function useCreateEncashment(actorId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: EncashmentInput) => createEncashment(input, actorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LV, 'encashments'] })
      toast.success('Encashment requested')
    },
    onError: (e: Error) => toast.error('Request failed', e.message),
  })
}

export function useDecideEncashment(approverId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; approve: boolean }) =>
      decideEncashment(args.id, args.approve, approverId ?? ''),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...LV, 'encashments'] })
      toast.success(v.approve ? 'Encashment approved' : 'Encashment rejected')
    },
    onError: (e: Error) => toast.error('Decision failed', e.message),
  })
}
