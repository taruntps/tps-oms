// Edge (Deno) — Billing framework: InternalProvider (fallback, no external calls).
//
// Used when BILLING_PROVIDER=internal (default on staging until GetSwipe creds
// arrive). It numbers documents locally and returns a local serial so Finance is
// never blocked on an external billing engine. NO secrets, NO network I/O.

import {
  BillingProvider,
  ErpCreditNote,
  ErpCustomer,
  ErpInvoice,
  ErpPayment,
  PaymentStatus,
  ProviderInvoiceResult,
  ProviderRef,
  WebhookEvent,
} from './interface.ts'

/** Deterministic local serial from an ERP id + prefix (idempotent per entity). */
function localSerial(prefix: string, erpId: string): string {
  // Short, stable suffix derived from the ERP uuid — no randomness so retries
  // produce the same serial (idempotency-friendly).
  const compact = erpId.replace(/-/g, '').slice(0, 12).toUpperCase()
  return `${prefix}-${compact}`
}

export class InternalProvider implements BillingProvider {
  readonly key = 'internal' as const

  async upsertCustomer(c: ErpCustomer): Promise<ProviderRef> {
    return { provider: this.key, providerId: c.erpId, providerSerial: localSerial('CUST', c.erpId) }
  }

  async createInvoice(inv: ErpInvoice): Promise<ProviderInvoiceResult> {
    const serial = inv.invoiceNo && inv.invoiceNo.trim().length > 0
      ? inv.invoiceNo
      : localSerial('INV', inv.erpId)
    return {
      provider: this.key,
      providerId: inv.erpId,
      providerSerial: serial,
      irn: null,
      qr: null,
      pdfUrl: null,
    }
  }

  async updateInvoice(ref: ProviderRef, inv: ErpInvoice): Promise<ProviderInvoiceResult> {
    return {
      provider: this.key,
      providerId: ref.providerId,
      providerSerial: ref.providerSerial ?? localSerial('INV', inv.erpId),
      irn: null,
      qr: null,
      pdfUrl: null,
    }
  }

  async cancelInvoice(_ref: ProviderRef, _reason: string): Promise<void> {
    // No-op locally; the ERP row is the source of truth for cancellation status.
  }

  async createCreditNote(cn: ErpCreditNote): Promise<ProviderInvoiceResult> {
    const serial = cn.creditNoteNo && cn.creditNoteNo.trim().length > 0
      ? cn.creditNoteNo
      : localSerial('CN', cn.erpId)
    return { provider: this.key, providerId: cn.erpId, providerSerial: serial, irn: null, qr: null, pdfUrl: null }
  }

  async recordPayment(p: ErpPayment): Promise<ProviderRef> {
    return { provider: this.key, providerId: p.erpId, providerSerial: localSerial('PAY', p.erpId) }
  }

  async getPaymentStatus(_ref: ProviderRef): Promise<PaymentStatus> {
    // The ERP already tracks payment status; internal provider defers to it.
    return { status: 'pending' }
  }

  async getInvoicePdf(_ref: ProviderRef): Promise<{ url?: string; bytes?: Uint8Array }> {
    // Local PDF rendering is a Finance concern; nothing to fetch externally.
    return {}
  }

  async getShareLink(ref: ProviderRef): Promise<string> {
    return `internal://invoice/${ref.providerId}`
  }

  verifyWebhook(_headers: Record<string, string>, _rawBody: string): boolean {
    // No inbound webhooks for the internal provider.
    return false
  }

  parseWebhook(rawBody: string): WebhookEvent {
    let raw: unknown = null
    try { raw = JSON.parse(rawBody) } catch { /* ignore */ }
    return { provider: this.key, eventId: '', eventType: 'unknown', raw }
  }

  async ping(): Promise<boolean> {
    return true
  }
}
