// Edge (Deno) — billing-worker: drains billing_sync_queue and pushes to the
// selected provider via the adapter. Server-side ONLY. Reads secrets from env.
//
// Flow per row (status 'queued'|'failed' & next_attempt_at<=now):
//   1. mark 'processing'
//   2. idempotency: if a linked provider_id already exists, mark 'done' (skip)
//   3. load the ERP entity, build the Erp domain object
//   4. call the provider method
//   5. success → upsert billing_provider_links + update finance row + queue 'done'
//      + billing_sync_log(outbound)
//   6. failure → attempts++, exponential next_attempt_at, 'failed' after MAX,
//      sanitized last_error + billing_sync_log(outbound)
//
// Logs NEVER include secrets/headers/tokens — only request/response SUMMARIES.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getProvider } from '../_shared/billing/factory.ts'
import {
  BillingNotConfiguredError,
  BillingProviderError,
  ErpCreditNote,
  ErpCustomer,
  ErpInvoice,
  ErpPayment,
  ProviderRef,
} from '../_shared/billing/interface.ts'
import { readBillingEnv } from '../_shared/billing/config.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_ATTEMPTS = 6
const BATCH = 25

type Db = ReturnType<typeof createClient>

/** Redact any accidental token-like content from an error string for logs. */
function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer <redacted>')
    .replace(/[A-Za-z0-9._\-]{40,}/g, '<redacted>')
    .slice(0, 500)
}

function backoffSeconds(attempts: number): number {
  // 30s, 60s, 120s, 240s, 480s, 960s …
  return Math.min(30 * 2 ** attempts, 3600)
}

async function logSync(
  db: Db,
  row: { queue_id: string; provider: string; request_summary: string; response_summary?: string; http_status?: number; error_code?: string },
) {
  const dbAny = db as any
  await dbAny.from('billing_sync_log').insert({
    queue_id: row.queue_id,
    provider: row.provider,
    direction: 'outbound',
    request_summary: row.request_summary,
    response_summary: row.response_summary ?? null,
    http_status: row.http_status ?? null,
    error_code: row.error_code ?? null,
  })
}

// ── ERP entity loaders → Erp domain objects (money = bigint paise) ──
async function loadCustomer(db: Db, erpId: string): Promise<ErpCustomer> {
  const dbAny = db as any
  const { data, error } = await dbAny.from('clients').select('*').eq('id', erpId).single()
  if (error || !data) throw new BillingProviderError(`Customer ${erpId} not found`, { retryable: false })
  return {
    erpId: data.id,
    name: data.name ?? data.company_name ?? 'Customer',
    companyName: data.company_name ?? null,
    email: data.email ?? null,
    phone: data.phone ?? data.contact_phone ?? null,
    gstin: data.gstin ?? null,
    billingAddress: data.address ?? null,
    shippingAddress: data.address ?? null,
  }
}

async function loadInvoice(db: Db, erpId: string): Promise<ErpInvoice> {
  const dbAny = db as any
  const { data, error } = await dbAny.from('finance_invoices').select('*').eq('id', erpId).single()
  if (error || !data) throw new BillingProviderError(`Invoice ${erpId} not found`, { retryable: false })
  const { data: lines } = await dbAny.from('finance_invoice_lines').select('*').eq('invoice_id', erpId)
  // Enrich the provider party block with the client's display name + phone.
  // Reuse the SAME phone field precedence as loadCustomer (phone ?? contact_phone).
  let client: any = null
  if (data.client_id) {
    const { data: c } = await dbAny.from('clients').select('*').eq('id', data.client_id).single()
    client = c ?? null
  }
  return {
    erpId: data.id,
    invoiceNo: data.invoice_no ?? null,
    customerErpId: data.client_id ?? null,
    clientGstin: data.client_gstin ?? null,
    placeOfSupply: data.place_of_supply ?? null,
    invoiceDate: data.invoice_date,
    dueDate: data.due_date ?? null,
    subtotal: BigInt(data.subtotal ?? 0),
    discountTotal: BigInt(data.discount_total ?? 0),
    taxTotal: BigInt(data.tax_total ?? 0),
    grandTotal: BigInt(data.grand_total ?? 0),
    amountPaid: BigInt(data.amount_paid ?? 0),
    notes: data.notes ?? null,
    customerName: client?.name ?? client?.company_name ?? 'Customer',
    customerPhone: client?.phone ?? client?.contact_phone ?? null,
    customerEmail: data.contact_email ?? client?.contact_email ?? null,
    billingAddress: data.billing_address ?? null,
    shippingAddress: data.shipping_address ?? null,
    lines: (lines ?? []).map((l: any) => ({
      description: l.description,
      quantity: Number(l.quantity ?? 1),
      unitPrice: BigInt(l.unit_price ?? 0),
      discountPercent: Number(l.discount_percent ?? 0),
      gstRate: Number(l.gst_rate ?? 18),
      hsnSac: l.hsn_sac ?? null,
      cgst: BigInt(l.cgst ?? 0),
      sgst: BigInt(l.sgst ?? 0),
      igst: BigInt(l.igst ?? 0),
      lineTotal: BigInt(l.line_total ?? 0),
      itemId: l.service_id ?? null,
      itemType: 'Service' as const,
    })),
  }
}

async function loadCreditNote(db: Db, erpId: string): Promise<ErpCreditNote> {
  const dbAny = db as any
  const { data, error } = await dbAny.from('finance_credit_notes').select('*').eq('id', erpId).single()
  if (error || !data) throw new BillingProviderError(`Credit note ${erpId} not found`, { retryable: false })
  return {
    erpId: data.id,
    creditNoteNo: data.credit_note_no ?? null,
    invoiceErpId: data.invoice_id ?? null,
    customerErpId: data.client_id ?? null,
    reason: data.reason ?? null,
    amount: BigInt(data.amount ?? 0),
    cnDate: data.cn_date,
  }
}

async function loadPayment(db: Db, erpId: string): Promise<ErpPayment> {
  const dbAny = db as any
  const { data, error } = await dbAny.from('payments').select('*').eq('id', erpId).single()
  if (error || !data) throw new BillingProviderError(`Payment ${erpId} not found`, { retryable: false })
  return {
    erpId: data.id,
    invoiceErpId: data.invoice_id ?? null,
    amount: BigInt(data.amount ?? 0),
    method: data.method ?? data.mode ?? null,
    reference: data.reference ?? data.txn_id ?? null,
    paidAt: data.paid_at ?? data.created_at,
  }
}

/** Existing link (idempotency anchor) for an entity+provider. */
async function findLink(db: Db, erpEntity: string, erpId: string, provider: string) {
  const dbAny = db as any
  const { data } = await dbAny
    .from('billing_provider_links')
    .select('*')
    .eq('erp_entity', erpEntity)
    .eq('erp_id', erpId)
    .eq('provider', provider)
    .maybeSingle()
  return data
}

async function upsertLink(
  db: Db,
  link: {
    erp_entity: string
    erp_id: string
    provider: string
    provider_id?: string | null
    provider_serial?: string | null
    irn?: string | null
    qr?: string | null
    pdf_url?: string | null
    status: string
  },
) {
  const dbAny = db as any
  await dbAny.from('billing_provider_links').upsert(
    { ...link, last_synced_at: new Date().toISOString() },
    { onConflict: 'erp_entity,erp_id,provider' },
  )
}

interface OpResult {
  ref: ProviderRef
  irn?: string | null
  qr?: string | null
  pdfUrl?: string | null
  serial?: string | null
}

/**
 * Fetch the provider PDF (raw bytes) and store it in the `invoice-pdfs` bucket,
 * setting r.pdfUrl to a long-lived signed URL. Non-fatal: any failure (e.g.
 * InternalProvider.getInvoicePdf throwing) leaves pdfUrl untouched.
 */
async function storeInvoicePdf(
  db: Db,
  provider: ReturnType<typeof getProvider>,
  row: any,
  r: OpResult['ref'] & { pdfUrl?: string | null },
) {
  try {
    const { bytes } = await provider.getInvoicePdf(r)
    if (bytes) {
      const path = `${row.erp_id}.pdf`
      const dbAny = db as any
      await dbAny.storage.from('invoice-pdfs').upload(path, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      })
      const { data: signed } = await dbAny.storage.from('invoice-pdfs').createSignedUrl(path, 31536000)
      r.pdfUrl = signed?.signedUrl ?? r.pdfUrl
    }
  } catch (e) {
    // Non-fatal: leave pdfUrl as-is (may be null). Surface only in server logs.
    console.error('[billing-worker] pdf store skipped', { queueId: row.id, error: sanitizeError(e) })
  }
}

/** Execute a queue op against the provider; return the provider result. */
async function runOp(db: Db, provider: ReturnType<typeof getProvider>, row: any, existingLink: any): Promise<OpResult> {
  const existingRef: ProviderRef | null = existingLink?.provider_id
    ? { provider: row.provider, providerId: existingLink.provider_id, providerSerial: existingLink.provider_serial }
    : null

  switch (row.op) {
    case 'upsert_customer': {
      const ref = await provider.upsertCustomer(await loadCustomer(db, row.erp_id))
      return { ref, serial: ref.providerSerial }
    }
    case 'create_invoice': {
      const r = await provider.createInvoice(await loadInvoice(db, row.erp_id))
      await storeInvoicePdf(db, provider, row, r)
      return { ref: r, irn: r.irn, qr: r.qr, pdfUrl: r.pdfUrl, serial: r.providerSerial }
    }
    case 'update_invoice': {
      const inv = await loadInvoice(db, row.erp_id)
      const ref = existingRef ?? { provider: row.provider, providerId: '' }
      const r = await provider.updateInvoice(ref, inv)
      await storeInvoicePdf(db, provider, row, r)
      return { ref: r, irn: r.irn, qr: r.qr, pdfUrl: r.pdfUrl, serial: r.providerSerial }
    }
    case 'cancel_invoice': {
      const ref = existingRef ?? { provider: row.provider, providerId: '' }
      await provider.cancelInvoice(ref, row.last_error ?? 'cancelled')
      return { ref }
    }
    case 'create_credit_note': {
      const r = await provider.createCreditNote(await loadCreditNote(db, row.erp_id))
      return { ref: r, irn: r.irn, qr: r.qr, pdfUrl: r.pdfUrl, serial: r.providerSerial }
    }
    case 'record_payment': {
      const ref = await provider.recordPayment(await loadPayment(db, row.erp_id))
      return { ref, serial: ref.providerSerial }
    }
    default:
      throw new BillingProviderError(`Unknown op "${row.op}"`, { retryable: false })
  }
}

/** Write provider artifacts back into the finance row (provider wins for statutory fields). */
async function updateFinanceRow(db: Db, row: any, res: OpResult) {
  const dbAny = db as any
  const patch: Record<string, unknown> = {
    provider: row.provider,
    provider_id: res.ref.providerId || null,
  }
  if (row.erp_entity === 'invoice') {
    if (res.irn != null) patch.irn = res.irn
    if (res.qr != null) patch.qr_code = res.qr
    if (res.pdfUrl != null) patch.pdf_url = res.pdfUrl
    if (row.op === 'create_invoice') patch.updated_at = new Date().toISOString()
    await dbAny.from('finance_invoices').update(patch).eq('id', row.erp_id)
  } else if (row.erp_entity === 'credit_note') {
    await dbAny.from('finance_credit_notes').update(patch).eq('id', row.erp_id)
  }
  // customer/payment: link table is the record of the provider mapping.
}

async function processRow(db: Db, provider: ReturnType<typeof getProvider>, row: any) {
  // 2. idempotency — skip creates that already have a provider_id.
  const existingLink = await findLink(db, row.erp_entity, row.erp_id, row.provider)
  const isCreate = row.op === 'create_invoice' || row.op === 'create_credit_note' || row.op === 'upsert_customer'
  if (isCreate && existingLink?.provider_id) {
    const dbAny = db as any
    await dbAny.from('billing_sync_queue').update({ status: 'done', last_error: null }).eq('id', row.id)
    await logSync(db, {
      queue_id: row.id,
      provider: row.provider,
      request_summary: `op=${row.op} entity=${row.erp_entity}:${row.erp_id} skipped=already_linked`,
      response_summary: `provider_id=${existingLink.provider_id}`,
    })
    return { id: row.id, status: 'skipped' }
  }

  try {
    const res = await runOp(db, provider, row, existingLink)

    // 5. success — link + finance row + queue done.
    if (row.op !== 'cancel_invoice') {
      await upsertLink(db, {
        erp_entity: row.erp_entity,
        erp_id: row.erp_id,
        provider: row.provider,
        provider_id: res.ref.providerId || null,
        provider_serial: res.serial ?? null,
        irn: res.irn ?? null,
        qr: res.qr ?? null,
        pdf_url: res.pdfUrl ?? null,
        status: 'linked',
      })
      await updateFinanceRow(db, row, res)
    } else {
      await upsertLink(db, {
        erp_entity: row.erp_entity,
        erp_id: row.erp_id,
        provider: row.provider,
        provider_id: existingLink?.provider_id ?? null,
        status: 'linked',
      })
    }

    const dbAny = db as any
    await dbAny.from('billing_sync_queue').update({ status: 'done', last_error: null }).eq('id', row.id)
    await logSync(db, {
      queue_id: row.id,
      provider: row.provider,
      request_summary: `op=${row.op} entity=${row.erp_entity}:${row.erp_id}`,
      response_summary: `ok provider_id=${res.ref.providerId || '-'} serial=${res.serial ?? '-'}`,
      http_status: 200,
    })
    return { id: row.id, status: 'done' }
  } catch (err) {
    // 6. failure — classify + backoff.
    const attempts = (row.attempts ?? 0) + 1
    const retryable = err instanceof BillingProviderError ? err.retryable : !(err instanceof BillingNotConfiguredError)
    const httpStatus = err instanceof BillingProviderError ? err.httpStatus : undefined
    const errorCode = err instanceof BillingProviderError ? err.errorCode : (err instanceof BillingNotConfiguredError ? 'not_configured' : undefined)
    const exhausted = !retryable || attempts >= MAX_ATTEMPTS
    const nextAt = new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString()
    const sanitized = sanitizeError(err)

    const dbAny = db as any
    await dbAny.from('billing_sync_queue').update({
      status: exhausted ? 'failed' : 'queued',
      attempts,
      next_attempt_at: nextAt,
      last_error: sanitized,
    }).eq('id', row.id)

    // Mark link errored for visibility (best-effort).
    await upsertLink(db, {
      erp_entity: row.erp_entity,
      erp_id: row.erp_id,
      provider: row.provider,
      provider_id: existingLink?.provider_id ?? null,
      status: 'error',
    })

    await logSync(db, {
      queue_id: row.id,
      provider: row.provider,
      request_summary: `op=${row.op} entity=${row.erp_entity}:${row.erp_id} attempt=${attempts}`,
      response_summary: `error: ${sanitized}`,
      http_status: httpStatus,
      error_code: errorCode,
    })
    console.error('[billing-worker] op failed', { queueId: row.id, op: row.op, attempts, exhausted, error: sanitized })
    return { id: row.id, status: exhausted ? 'failed' : 'retry' }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const env = readBillingEnv()
    const provider = getProvider(env)
    console.log('[billing-worker] draining queue', { provider: provider.key })

    const dbAny = db as any
    const nowIso = new Date().toISOString()
    const { data: rows, error } = await dbAny
      .from('billing_sync_queue')
      .select('*')
      .in('status', ['queued', 'failed'])
      .lte('next_attempt_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(BATCH)

    if (error) return json({ error: error.message }, 500)
    if (!rows?.length) return json({ drained: 0, provider: provider.key })

    const results: { id: string; status: string }[] = []
    for (const row of rows) {
      // 1. claim the row.
      const { data: claimed } = await dbAny
        .from('billing_sync_queue')
        .update({ status: 'processing' })
        .eq('id', row.id)
        .in('status', ['queued', 'failed'])
        .select('id')
        .maybeSingle()
      if (!claimed) continue // another worker grabbed it

      results.push(await processRow(db, provider, row))
    }

    return json({
      drained: results.length,
      provider: provider.key,
      done: results.filter((r) => r.status === 'done').length,
      failed: results.filter((r) => r.status === 'failed').length,
      retry: results.filter((r) => r.status === 'retry').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    })
  } catch (err) {
    console.error('[billing-worker] fatal', sanitizeError(err))
    return json({ error: sanitizeError(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
