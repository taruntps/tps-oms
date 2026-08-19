// HRMS — React-Query hooks for short leave (migration 105).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchMyShortLeaves, fetchPendingShortLeaves, submitShortLeave, reviewShortLeave,
  cancelShortLeave, type ShortLeaveInput,
} from '../api/shortLeave'

const KEY = ['hrms', 'short-leave']

export function useMyShortLeaves(employeeId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'mine', employeeId],
    queryFn: () => fetchMyShortLeaves(employeeId!),
    enabled: !!employeeId,
  })
}

export function usePendingShortLeaves() {
  return useQuery({ queryKey: [...KEY, 'pending'], queryFn: fetchPendingShortLeaves })
}

export function useSubmitShortLeave(employeeId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ShortLeaveInput) => submitShortLeave(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'mine', employeeId] })
      toast.success('Short leave applied', 'Sent for approval.')
    },
    onError: (e: any) => toast.error('Could not apply', e?.message ?? 'Try again.'),
  })
}

export function useReviewShortLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string | null }) =>
      reviewShortLeave(id, approve, note),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: [...KEY, 'pending'] })
      qc.invalidateQueries({ queryKey: [...KEY, 'mine'] })
      toast.success(v.approve ? 'Approved' : 'Rejected')
    },
    onError: (e: any) => toast.error('Action failed', e?.message ?? 'Try again.'),
  })
}

export function useCancelShortLeave(employeeId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cancelShortLeave(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'mine', employeeId] })
      toast.success('Short leave cancelled')
    },
    onError: (e: any) => toast.error('Could not cancel', e?.message ?? 'Try again.'),
  })
}
