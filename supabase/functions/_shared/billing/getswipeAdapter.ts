// Edge (Deno) — Billing framework: GetSwipeAdapter (server-side ONLY).
//
// Implements `BillingProvider` against the GetSwipe (Swipe) partner API. Reads
// ALL config from Deno.env via readBillingEnv() — NO secrets in code, git or logs.
// If GETSWIPE_API_KEY is empty it FAILS SAFE by throwing BillingNotConfiguredError,
// so staging without creds errors loudly instead of issuing bogus invoices.
//
// Auth: Bearer JWT (Authorization: Bearer <API_KEY>).
// Create doc: POST {baseUrl}/v2/doc  (document_type: invoice | sales_return).
// Webhooks: X-Signature = HMAC-SHA256(rawBody, GETSWIPE_WEBHOOK_SECRET).
//
// The CALLER (billing-worker) is responsible for writing billing_sync_log with a
// request/response SUMMARY only — this adapter never logs headers/keys/tokens.
// See docs/architecture/modules/finance-billing-adapter.md §4.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import {
  BillingNotConfiguredError,
  BillingProvider,
  BillingProviderError,
  ErpCreditNote,
  ErpCustomer,
  ErpInvoice,
  ErpInvoiceLine,
  ErpPayment,
  PaymentStatus,
  PaymentStatusValue,
  ProviderInvoiceResult,
  ProviderRef,
  WebhookEvent,
  WebhookEventType,
} from './interface.ts'
import { BillingEnv, readBillingEnv } from './config.ts'

/** paise (bigint) → rupees number for the provider payload. */
function paiseToRupees(paise: bigint): number {
  return Number(paise) / 100
}

/** ISO date (YYYY-MM-DD) → GetSwipe DD-MM-YYYY. */
function toSwipeDate(iso?: string | null): string | undefined {
  if (!iso) return undefined
  const d = iso.slice(0, 10).split('-')
  if (d.length !== 3) return undefined
  return `${d[2]}-${d[1]}-${d[0]}`
}

/** Lowercase, non-alphanumeric → '-', trim dashes; fallback 'item'. */
function slug(s?: string | null): string {
  const out = String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return out || 'item'
}

/** Round a rupee-space number to 2 dp (avoids float drift on fractional qty). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function mapLine(line: ErpInvoiceLine) {
  // net_amount is the pre-tax line value in rupees = unit_price(rupees) * quantity.
  // Compute in rupee-space and round to 2dp so fractional quantities are safe.
  const netAmount = round2(paiseToRupees(line.unitPrice) * line.quantity)
  return {
    id: line.itemId || slug(line.description),
    name: line.description,
    item_type: line.itemType || 'Service',
    quantity: line.quantity,
    unit_price: paiseToRupees(line.unitPrice),
    tax_rate: line.gstRate,
    hsn_code: line.hsnSac ?? undefined,
    discount_percent: line.discountPercent || undefined,
    net_amount: netAmount,
    price_with_tax: paiseToRupees(line.lineTotal),
    total_amount: paiseToRupees(line.lineTotal),
  }
}

function mapPaymentStatus(value: unknown): PaymentStatusValue {
  const s = String(value ?? '').toLowerCase()
  if (s.includes('paid') && !s.includes('partial')) return 'paid'
  if (s.includes('partial')) return 'partial'
  if (s.includes('fail')) return 'failed'
  if (s.includes('cancel')) return 'cancelled'
  return 'pending'
}

function mapWebhookType(value: unknown): WebhookEventType {
  const s = String(value ?? '').toLowerCase()
  if (s.includes('cancel')) return 'document.cancelled'
  if (s.includes('status')) return 'document.status_changed'
  if (s.includes('payment')) return 'payment.recorded'
  if (s.includes('update') || s.includes('edit')) return 'document.updated'
  if (s.includes('create')) return 'document.created'
  return 'unknown'
}

export class GetSwipeAdapter implements BillingProvider {
  readonly key = 'getswipe' as const
  private readonly env: BillingEnv

  constructor(env: BillingEnv = readBillingEnv()) {
    this.env = env
  }

  /** Guard: throw a clear fail-safe error if the API key is missing. */
  private requireConfigured() {
    if (!this.env.getswipe.apiKey) {
      throw new BillingNotConfiguredError(
        'GetSwipe is selected but GETSWIPE_API_KEY is not set — refusing to make external calls.',
      )
    }
  }

  private authHeaders(): Record<string, string> {
    // NOTE: never logged. The caller logs only summaries.
    return {
      'Authorization': `Bearer ${this.env.getswipe.apiKey}`,
      'Content-Type': 'application/json',
      ...(this.env.getswipe.businessId ? { 'X-Business-Id': this.env.getswipe.businessId } : {}),
    }
  }

  /** POST/GET the partner API. Maps transport + provider errors to typed errors. */
  private async call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    this.requireConfigured()
    const url = `${this.env.getswipe.baseUrl}${path}`
    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: this.authHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (err) {
      // Network/timeout → retryable.
      throw new BillingProviderError(
        `GetSwipe network error: ${err instanceof Error ? err.message : String(err)}`,
        { retryable: true },
      )
    }

    let json: any = null
    const text = await res.text()
    try { json = text ? JSON.parse(text) : null } catch { /* non-JSON body */ }

    if (!res.ok) {
      // 429 / 5xx → retryable; 4xx business errors → not retryable.
      const retryable = res.status === 429 || res.status >= 500
      throw new BillingProviderError(
        `GetSwipe ${method} ${path} failed: HTTP ${res.status}${json?.message ? ` — ${json.message}` : ''}`,
        { httpStatus: res.status, errorCode: json?.error_code ? String(json.error_code) : undefined, retryable },
      )
    }

    if (json && json.success === false) {
      throw new BillingProviderError(
        `GetSwipe ${method} ${path} returned success=false${json.message ? ` — ${json.message}` : ''}`,
        { httpStatus: res.status, errorCode: json.error_code ? String(json.error_code) : undefined, retryable: false },
      )
    }

    return json as T
  }

  // ── Master data ──
  async upsertCustomer(c: ErpCustomer): Promise<ProviderRef> {
    const payload = {
      reference: c.erpId,
      name: c.name,
      company_name: c.companyName ?? undefined,
      email: c.email ?? undefined,
      phone_number: c.phone ?? undefined,
      gstin: c.gstin ?? undefined,
      // NOTE: GetSwipe expects billing/shipping address as structured OBJECTS, not
      // free-text strings; sending strings caused HTTP 400. Addresses are kept on the
      // ERP invoice/customer for our records + PDF. Sending structured addresses to
      // GetSwipe is a future enhancement once the address-object schema is confirmed.
    }
    const res = await this.call<any>('POST', '/customer', payload)
    const id = res?.data?.id ?? res?.data?.hash_id
    if (!id) throw new BillingProviderError('GetSwipe upsertCustomer: no id in response', { retryable: false })
    return { provider: this.key, providerId: String(id) }
  }

  // ── Documents ──
  private buildDocBody(inv: ErpInvoice, documentType: 'invoice' | 'sales_return') {
    return {
      document_type: documentType,
      reference: inv.erpId, // our idempotency anchor
      document_date: toSwipeDate(inv.invoiceDate),
      due_date: toSwipeDate(inv.dueDate),
      einvoice: inv.eInvoice === true,
      place_of_supply: inv.placeOfSupply ?? undefined,
      party: {
        id: inv.customerErpId ?? inv.erpId,
        type: 'customer',
        name: inv.customerName ?? 'Customer',
        phone_number: inv.customerPhone ?? undefined,
        email: inv.customerEmail ?? undefined,
        gstin: inv.clientGstin ?? undefined,
        // billing/shipping address intentionally omitted — GetSwipe wants address
        // objects, not strings (HTTP 400). Kept on the ERP invoice for records/PDF.
      },
      items: inv.lines.map(mapLine),
    }
  }

  private mapDocResult(res: any): ProviderInvoiceResult {
    const data = res?.data ?? {}
    const id = data.hash_id ?? data.id
    if (!id) throw new BillingProviderError('GetSwipe document: no hash_id in response', { retryable: false })
    return {
      provider: this.key,
      providerId: String(id),
      providerSerial: data.serial_number ? String(data.serial_number) : null,
      irn: data.irn ? String(data.irn) : null,
      qr: data.qr_code ? String(data.qr_code) : null,
      pdfUrl: data.pdf_url ? String(data.pdf_url) : null,
    }
  }

  async createInvoice(inv: ErpInvoice): Promise<ProviderInvoiceResult> {
    const res = await this.call<any>('POST', '/v2/doc', this.buildDocBody(inv, 'invoice'))
    return this.mapDocResult(res)
  }

  async updateInvoice(ref: ProviderRef, inv: ErpInvoice): Promise<ProviderInvoiceResult> {
    // Verified: PUT /v2/doc/{hash_id} with the full document body.
    const res = await this.call<any>('PUT', `/v2/doc/${encodeURIComponent(ref.providerId)}`, this.buildDocBody(inv, 'invoice'))
    return this.mapDocResult(res)
  }

  async cancelInvoice(ref: ProviderRef, _reason: string): Promise<void> {
    // GetSwipe cancel = DELETE {base}/v2/doc/{hash_id}; no body. The reason is
    // recorded ERP-side (billing_sync_log) — the API takes no reason param.
    void _reason
    await this.call<any>('DELETE', `/v2/doc/${encodeURIComponent(ref.providerId)}`)
  }

  async createCreditNote(cn: ErpCreditNote): Promise<ProviderInvoiceResult> {
    // GetSwipe has no distinct credit_note type — sales_return is the mapping
    // (see design §4; to be confirmed against a test account).
    const body = {
      document_type: 'sales_return',
      reference: cn.erpId,
      document_date: toSwipeDate(cn.cnDate),
      party: cn.customerErpId ? { reference: cn.customerErpId } : undefined,
      linked_invoice_reference: cn.invoiceErpId ?? undefined,
      notes: cn.reason ?? undefined,
      items: [{
        name: cn.reason ?? 'Credit note',
        quantity: 1,
        unit_price: paiseToRupees(cn.amount),
        total_amount: paiseToRupees(cn.amount),
        item_type: 'product',
      }],
    }
    const res = await this.call<any>('POST', '/v2/doc', body)
    return this.mapDocResult(res)
  }

  // ── Money ──
  async recordPayment(p: ErpPayment): Promise<ProviderRef> {
    const payload = {
      reference: p.erpId,
      invoice_reference: p.invoiceErpId ?? undefined,
      amount: paiseToRupees(p.amount),
      method: p.method ?? undefined,
      payment_date: toSwipeDate(p.paidAt),
      transaction_reference: p.reference ?? undefined,
    }
    const res = await this.call<any>('POST', '/payment', payload)
    const id = res?.data?.id ?? res?.data?.hash_id
    if (!id) throw new BillingProviderError('GetSwipe recordPayment: no id in response', { retryable: false })
    return { provider: this.key, providerId: String(id) }
  }

  async getPaymentStatus(ref: ProviderRef): Promise<PaymentStatus> {
    // GET {base}/v2/doc/{hash_id} — hash in the PATH.
    const res = await this.call<any>('GET', `/v2/doc/${encodeURIComponent(ref.providerId)}`)
    const data = res?.data ?? {}
    // Map defensively: exact nesting of the get-document payload is to be
    // re-confirmed during live payment testing (may be data.* or data.document.*).
    const doc = data.document ?? {}
    const paymentStatus = data.payment_status ?? doc.payment_status ?? data.status
    const amountPaidRupees = data.amount_paid ?? doc.amount_paid
    return {
      status: mapPaymentStatus(paymentStatus),
      amountPaid: amountPaidRupees != null ? BigInt(Math.round(Number(amountPaidRupees) * 100)) : undefined,
    }
  }

  // ── Artifacts ──
  async getInvoicePdf(ref: ProviderRef): Promise<{ url?: string; bytes?: Uint8Array }> {
    // GET {base}/v2/doc/pdf/{hash_id} returns RAW PDF bytes (not JSON, no url).
    // Bypass the JSON call() helper — read the binary body directly.
    this.requireConfigured()
    const url = `${this.env.getswipe.baseUrl}/v2/doc/pdf/${encodeURIComponent(ref.providerId)}`
    let res: Response
    try {
      res = await fetch(url, { headers: this.authHeaders() })
    } catch (err) {
      throw new BillingProviderError(
        `GetSwipe network error: ${err instanceof Error ? err.message : String(err)}`,
        { retryable: true },
      )
    }
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500
      throw new BillingProviderError(
        `GetSwipe GET /v2/doc/pdf failed: HTTP ${res.status}`,
        { httpStatus: res.status, retryable },
      )
    }
    return { bytes: new Uint8Array(await res.arrayBuffer()) }
  }

  async getShareLink(ref: ProviderRef): Promise<string> {
    // TODO: share-link endpoint unverified against live GetSwipe.
    const res = await this.call<any>('GET', `/v2/doc/${encodeURIComponent(ref.providerId)}`)
    const link = res?.data?.share_link ?? res?.data?.public_url
    if (!link) throw new BillingProviderError('GetSwipe getShareLink: no link in response', { retryable: false })
    return String(link)
  }

  // ── Inbound ──
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean {
    const secret = this.env.getswipe.webhookSecret
    if (!secret) return false
    // Header names may arrive in varying case.
    const provided = headers['x-signature'] ?? headers['X-Signature'] ?? headers['X-SIGNATURE'] ?? ''
    if (!provided) return false
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    try {
      const a = Buffer.from(expected, 'utf8')
      const b = Buffer.from(provided.trim(), 'utf8')
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    } catch {
      return false
    }
  }

  parseWebhook(rawBody: string): WebhookEvent {
    let raw: any = null
    try { raw = JSON.parse(rawBody) } catch { /* keep null */ }
    const data = raw?.data ?? raw ?? {}
    return {
      provider: this.key,
      eventId: String(raw?.event_id ?? raw?.id ?? ''),
      eventType: mapWebhookType(raw?.event_type ?? raw?.type),
      providerId: data.hash_id ? String(data.hash_id) : (data.id ? String(data.id) : null),
      providerSerial: data.serial_number ? String(data.serial_number) : null,
      irn: data.irn ? String(data.irn) : null,
      qr: data.qr_code ? String(data.qr_code) : null,
      pdfUrl: data.pdf_url ? String(data.pdf_url) : null,
      paymentStatus: (data.payment_status ?? data.status) ? mapPaymentStatus(data.payment_status ?? data.status) : null,
      raw,
    }
  }

  // ── Health ──
  async ping(): Promise<boolean> {
    try {
      this.requireConfigured()
      // A lightweight authenticated GET; any 2xx means reachable + authorized.
      await this.call<any>('GET', '/customer/list?limit=1')
      return true
    } catch {
      return false
    }
  }
}
