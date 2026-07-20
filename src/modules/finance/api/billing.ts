// Finance — billing provider decoupling shim.
// The ERP NEVER talks to GetSwipe (or any provider) directly. The only thing the
// UI does is enqueue an op into `billing_sync_queue`; the provider adapter worker
// (owned by a separate agent, under src/core/billing / supabase/functions) drains
// the queue and populates the provider fields (provider_id, irn, qr_code, pdf_url).
//
// The canonical entry point is `enqueueInvoiceIssue` from `@/core/billing`. That
// module may not exist yet in this branch, so we re-export a local implementation
// with the same shape. If/when `@/core/billing` lands, callers can switch the
// import without touching this module's behaviour.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type BillingProvider = 'getswipe'

/**
 * Enqueue an invoice for issuance at the billing provider. Inserts a queued row
 * into `billing_sync_queue`; the adapter worker picks it up asynchronously.
 * Returns nothing meaningful — provider artifacts arrive later via webhook/sync.
 */
export async function enqueueInvoiceIssue(
  invoiceId: string,
  provider: BillingProvider = 'getswipe',
): Promise<void> {
  const { error } = await db.from('billing_sync_queue').insert({
    op: 'create_invoice',
    erp_entity: 'invoice',
    erp_id: invoiceId,
    provider,
    status: 'queued',
  })
  if (error) throw error
}
