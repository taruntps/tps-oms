// Sales — Quotations, orders and handoff React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchQuotations,
  fetchQuotationLines,
  createQuotation,
  updateQuotationStatus,
  createOrderWithHandoff,
  type NewQuotationInput,
  type QuotationStatus,
  type MarkWonInput,
} from '../api/quotations'

const quotationsKey = (dealId: string) => ['sales', 'quotations', dealId]

export function useQuotations(dealId: string) {
  return useQuery({
    queryKey: quotationsKey(dealId),
    queryFn: () => fetchQuotations(dealId),
    enabled: !!dealId,
  })
}

export function useQuotationLines(quotationId: string | null) {
  return useQuery({
    queryKey: ['sales', 'quotation-lines', quotationId],
    queryFn: () => fetchQuotationLines(quotationId as string),
    enabled: !!quotationId,
  })
}

export function useCreateQuotation(dealId: string) {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (input: NewQuotationInput) => createQuotation(input, user?.id ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quotationsKey(dealId) })
      toast.success('Quotation created')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}

export function useUpdateQuotationStatus(dealId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuotationStatus }) =>
      updateQuotationStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quotationsKey(dealId) })
      toast.success('Quotation updated')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}

/** Mark Won → confirmed order + pending finance handoff. */
export function useMarkWon() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (input: MarkWonInput) => createOrderWithHandoff(input, user?.id ?? null),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['sales', 'orders', v.deal_id] })
      toast.success('Order created', 'Handed off to Finance for invoicing.')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}
