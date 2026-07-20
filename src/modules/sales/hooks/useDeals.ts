// Sales — Deals pipeline React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchStages,
  fetchDeals,
  fetchDeal,
  createDeal,
  updateDeal,
  moveDealStage,
  fetchStageHistory,
  fetchClientLookup,
  fetchLeadLookup,
  fetchProfileLookup,
  type DealInput,
  type SalesDeal,
  type DealStage,
} from '../api/deals'

const STAGES_KEY = ['sales', 'deal-stages']
const DEALS_KEY = ['sales', 'deals']
const CLIENTS_KEY = ['sales', 'client-lookup']
const LEADS_KEY = ['sales', 'lead-lookup']
const PROFILES_KEY = ['sales', 'profile-lookup']

export function useDealStages() {
  return useQuery({ queryKey: STAGES_KEY, queryFn: fetchStages, staleTime: 10 * 60_000 })
}

export function useDeals() {
  return useQuery({ queryKey: DEALS_KEY, queryFn: fetchDeals })
}

export function useDeal(id: string) {
  return useQuery({ queryKey: [...DEALS_KEY, id], queryFn: () => fetchDeal(id), enabled: !!id })
}

export function useStageHistory(dealId: string) {
  return useQuery({
    queryKey: ['sales', 'stage-history', dealId],
    queryFn: () => fetchStageHistory(dealId),
    enabled: !!dealId,
  })
}

export function useClientLookup() {
  return useQuery({ queryKey: CLIENTS_KEY, queryFn: fetchClientLookup, staleTime: 5 * 60_000 })
}

export function useLeadLookup() {
  return useQuery({ queryKey: LEADS_KEY, queryFn: fetchLeadLookup, staleTime: 5 * 60_000 })
}

export function useProfileLookup() {
  return useQuery({ queryKey: PROFILES_KEY, queryFn: fetchProfileLookup, staleTime: 5 * 60_000 })
}

export function useCreateDeal() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (input: DealInput) => createDeal(input, user?.id ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEALS_KEY })
      toast.success('Deal created')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}

export function useUpdateDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DealInput }) => updateDeal(id, input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: DEALS_KEY })
      qc.invalidateQueries({ queryKey: [...DEALS_KEY, v.id] })
      toast.success('Deal updated')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}

export function useMoveDealStage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ deal, toStage, lostReason }: { deal: SalesDeal; toStage: DealStage; lostReason?: string | null }) =>
      moveDealStage(deal, toStage, user?.id ?? null, lostReason),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: DEALS_KEY })
      qc.invalidateQueries({ queryKey: [...DEALS_KEY, v.deal.id] })
      qc.invalidateQueries({ queryKey: ['sales', 'stage-history', v.deal.id] })
      toast.success('Stage updated')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}
