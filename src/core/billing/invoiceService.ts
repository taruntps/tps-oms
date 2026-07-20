// Core Platform — Billing framework: Invoice Service (ERP-facing boundary).
//
// This is the ONLY billing API the rest of the ERP (UI/hooks) sees. It writes
// the ERP finance tables (source of truth) and ENQUEUES outbox operations into
// `billing_sync_queue`. It NEVER calls a provider and holds NO secrets — all
// external/provider work happens server-side in the billing-worker edge fn.
//
// Provider defaults to 'getswipe' on the queue row (the worker's factory decides
// the actual provider at drain time based on server env); the queue row is only
// an intent to sync. See docs/architecture/modules/finance-billing-adapter.md §3.

import { supabase } from '@/lib/supabase'
import type { BillingOp, ErpEntity } from './types'

// The billing tables are additive (migration 084) and may not yet be in the
// generated Supabase types, so we use a loosely-typed handle for inserts.
const db = supabase as any

const DEFAULT_PROVIDER = 'getswipe'

interface EnqueueArgs {
  op: BillingOp
  erpEntity: ErpEntity
  erpId: string
  provider?: string
}

/**
 * Insert a single outbox row. No external calls. The worker picks it up when
 * `status='queued'` and `next_attempt_at <= now()`. Idempotency is enforced
 * downstream via `billing_provider_links` + `payload_hash`.
 */
async function enqueue({ op, erpEntity, erpId, provider = DEFAULT_PROVIDER }: EnqueueArgs) {
  try {
    const { data, error } = await db
      .from('billing_sync_queue')
      .insert({
        op,
        erp_entity: erpEntity,
        erp_id: erpId,
        provider,
        status: 'queued',
        next_attempt_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      // Unique-violation (23505) against billing_sync_queue_active_uq means an
      // identical op is already queued/processing for this entity — treat as an
      // idempotent no-op (review finding #1/#7: prevents duplicate provider sync).
      if ((error as any).code === '23505') {
        console.log('[billing/invoiceService] enqueue skipped — active op already queued', { op, erpEntity, erpId })
        return null
      }
      console.error('[billing/invoiceService] enqueue failed', { op, erpEntity, erpId, error: error.message })
      throw new Error(`Failed to enqueue billing op "${op}": ${error.message}`)
    }

    console.log('[billing/invoiceService] enqueued', { op, erpEntity, erpId, queueId: data?.id })
    return data?.id as string
  } catch (err) {
    // Re-throw with a meaningful message; callers surface this to the UI.
    if (err instanceof Error) throw err
    throw new Error(`Failed to enqueue billing op "${op}": ${String(err)}`)
  }
}

/** Enqueue issuing an invoice to the billing provider (create at provider). */
export function enqueueInvoiceIssue(invoiceId: string, provider?: string) {
  return enqueue({ op: 'create_invoice', erpEntity: 'invoice', erpId: invoiceId, provider })
}

/** Enqueue an update of an already-linked invoice. */
export function enqueueInvoiceUpdate(invoiceId: string, provider?: string) {
  return enqueue({ op: 'update_invoice', erpEntity: 'invoice', erpId: invoiceId, provider })
}

/** Enqueue cancellation of an invoice at the provider. */
export function enqueueInvoiceCancel(invoiceId: string, provider?: string) {
  return enqueue({ op: 'cancel_invoice', erpEntity: 'invoice', erpId: invoiceId, provider })
}

/** Enqueue creation of a credit note at the provider. */
export function enqueueCreditNote(creditNoteId: string, provider?: string) {
  return enqueue({ op: 'create_credit_note', erpEntity: 'credit_note', erpId: creditNoteId, provider })
}

/** Enqueue recording a payment at the provider. */
export function enqueuePayment(paymentId: string, provider?: string) {
  return enqueue({ op: 'record_payment', erpEntity: 'payment', erpId: paymentId, provider })
}

/** Enqueue create/update of a customer/party at the provider. */
export function enqueueCustomerUpsert(customerId: string, provider?: string) {
  return enqueue({ op: 'upsert_customer', erpEntity: 'customer', erpId: customerId, provider })
}
