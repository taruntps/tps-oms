// Finance — government-fee React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchGovtFees,
  createGovtFee,
  updateGovtFee,
  type GovtFeeInput,
} from '../api/govtFees'

const GOVT_FEES_KEY = ['finance', 'govt-fees']

export function useGovtFees() {
  return useQuery({ queryKey: GOVT_FEES_KEY, queryFn: fetchGovtFees })
}

export function useCreateGovtFee() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: (input: GovtFeeInput) => createGovtFee(input, profile?.id ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GOVT_FEES_KEY })
      toast.success('Government fee recorded')
    },
    onError: (e: Error) => toast.error('Failed to record fee', e.message),
  })
}

export function useUpdateGovtFee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; input: Partial<GovtFeeInput> }) =>
      updateGovtFee(args.id, args.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GOVT_FEES_KEY })
      toast.success('Government fee updated')
    },
    onError: (e: Error) => toast.error('Failed to update fee', e.message),
  })
}
