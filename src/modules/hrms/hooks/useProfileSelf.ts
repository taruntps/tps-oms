// HRMS — React-Query hooks for employee self-service profile change requests.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchProfileCurrent, fetchMyLatestRequest, submitProfileChange,
  fetchPendingRequests, reviewProfileChange, type ProfilePayload,
} from '../api/profileSelf'

const KEY = ['hrms', 'profile-self']

export function useProfileCurrent(userId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'current', userId],
    queryFn: () => fetchProfileCurrent(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  })
}

export function useMyLatestRequest(userId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'mine', userId],
    queryFn: () => fetchMyLatestRequest(userId!),
    enabled: !!userId,
  })
}

export function useSubmitProfileChange(userId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ProfilePayload) => submitProfileChange(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'mine', userId] })
      toast.success('Submitted for approval', 'Your details are now pending admin approval.')
    },
    onError: (e: any) => toast.error('Could not submit', e?.message ?? 'Try again.'),
  })
}

export function usePendingRequests() {
  return useQuery({ queryKey: [...KEY, 'pending'], queryFn: fetchPendingRequests })
}

export function useReviewProfileChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string | null }) =>
      reviewProfileChange(id, approve, note),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: [...KEY, 'pending'] })
      toast.success(v.approve ? 'Approved' : 'Rejected',
        v.approve ? 'The employee record has been updated.' : 'The employee can edit and resubmit.')
    },
    onError: (e: any) => toast.error('Action failed', e?.message ?? 'Try again.'),
  })
}
