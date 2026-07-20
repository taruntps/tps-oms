// Finance — invoice React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchInvoices,
  fetchInvoice,
  fetchInvoiceLines,
  createInvoice,
  updateDraftInvoice,
  markInvoiceIssued,
  cancelInvoice,
  fetchCreditNotes,
  createCreditNote,
  type InvoiceStatus,
  type InvoiceHeaderInput,
} from '../api/invoices'
import type { LineInput } from '../api/tax'
import { enqueueInvoiceIssue } from '@/core/billing'

const INVOICES_KEY = ['finance', 'invoices']

export function useInvoices(status?: InvoiceStatus | 'all') {
  return useQuery({
    queryKey: [...INVOICES_KEY, status ?? 'all'],
    queryFn: () => fetchInvoices(status),
  })
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: [...INVOICES_KEY, 'detail', id],
    enabled: !!id,
    queryFn: () => fetchInvoice(id!),
  })
}

export function useInvoiceLines(id: string | undefined) {
  return useQuery({
    queryKey: [...INVOICES_KEY, 'lines', id],
    enabled: !!id,
    queryFn: () => fetchInvoiceLines(id!),
  })
}

export function useCreateInvoice() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: (args: { header: InvoiceHeaderInput; lines: LineInput[] }) =>
      createInvoice(args.header, args.lines, profile?.id ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICES_KEY })
      toast.success('Draft invoice created')
    },
    onError: (e: Error) => toast.error('Failed to create invoice', e.message),
  })
}

export function useUpdateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; header: InvoiceHeaderInput; lines: LineInput[] }) =>
      updateDraftInvoice(args.id, args.header, args.lines),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICES_KEY })
      toast.success('Invoice updated')
    },
    onError: (e: Error) => toast.error('Failed to update invoice', e.message),
  })
}

/**
 * Issue a draft invoice: flips the ERP status to `issued` and enqueues the
 * provider sync op. Provider artifacts (IRN/QR/PDF) arrive later via the worker.
 */
export function useIssueInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      await markInvoiceIssued(invoiceId)
      await enqueueInvoiceIssue(invoiceId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICES_KEY })
      toast.success('Invoice issued', 'Queued for the billing provider — IRN/PDF will sync shortly.')
    },
    onError: (e: Error) => toast.error('Failed to issue invoice', e.message),
  })
}

export function useCancelInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cancelInvoice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICES_KEY })
      toast.success('Invoice cancelled')
    },
    onError: (e: Error) => toast.error('Failed to cancel invoice', e.message),
  })
}

// ── Credit notes ──
export function useCreditNotes(invoiceId: string | undefined) {
  return useQuery({
    queryKey: [...INVOICES_KEY, 'credit-notes', invoiceId],
    enabled: !!invoiceId,
    queryFn: () => fetchCreditNotes(invoiceId!),
  })
}

export function useCreateCreditNote() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: (input: { invoice_id: string; client_id: string | null; amount: number; reason: string | null }) =>
      createCreditNote(input, profile?.id ?? null),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...INVOICES_KEY, 'credit-notes', v.invoice_id] })
      toast.success('Credit note created')
    },
    onError: (e: Error) => toast.error('Failed to create credit note', e.message),
  })
}
