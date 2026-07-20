// Finance — payment React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchPayments,
  fetchInvoicePayments,
  recordStandalonePayment,
  recordInvoicePayment,
  type PaymentInput,
} from '../api/payments'
import type { InvoiceRow } from '../api/invoices'

const PAYMENTS_KEY = ['finance', 'payments']

export function usePayments() {
  return useQuery({ queryKey: PAYMENTS_KEY, queryFn: fetchPayments })
}

export function useInvoicePayments(invoiceId: string | undefined) {
  return useQuery({
    queryKey: [...PAYMENTS_KEY, 'invoice', invoiceId],
    enabled: !!invoiceId,
    queryFn: () => fetchInvoicePayments(invoiceId!),
  })
}

export function useRecordStandalonePayment() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: (input: PaymentInput) => recordStandalonePayment(input, profile?.id ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY })
      toast.success('Payment recorded')
    },
    onError: (e: Error) => toast.error('Failed to record payment', e.message),
  })
}

export function useRecordInvoicePayment() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: (args: { invoice: InvoiceRow; input: PaymentInput }) =>
      recordInvoicePayment(args.invoice, args.input, profile?.id ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY })
      qc.invalidateQueries({ queryKey: ['finance', 'invoices'] })
      toast.success('Payment recorded')
    },
    onError: (e: Error) => toast.error('Failed to record payment', e.message),
  })
}
