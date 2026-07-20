// CRM — referrals React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import { fetchReferrals, upsertReferral, type ReferralInput } from '../api/referrals'

const REFERRALS_KEY = ['crm', 'referrals']

export function useCrmReferrals() {
  return useQuery({ queryKey: REFERRALS_KEY, queryFn: fetchReferrals })
}

export function useUpsertReferral() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ReferralInput & { id?: string }) => upsertReferral(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: REFERRALS_KEY })
      // Keep the legacy referrals list (used by ClientForm) in sync too.
      qc.invalidateQueries({ queryKey: ['referrals'] })
      toast.success(v.id ? 'Referral updated' : 'Referral added')
    },
    onError: (e: Error) => toast.error('Failed to save referral', e.message),
  })
}
