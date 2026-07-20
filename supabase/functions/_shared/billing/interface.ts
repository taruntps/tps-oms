// Edge (Deno) — Billing framework: a Deno-local copy of the ERP-side domain
// types and the `BillingProvider` contract. Mirrors `src/core/billing/types.ts`
// so the edge functions typecheck standalone (no cross-import into the frontend).
//
// NO secrets here. Money is bigint paise throughout.

export type ProviderKey = 'getswipe' | 'zoho' | 'tally' | 'busy' | 'internal'
export type ErpEntity = 'customer' | 'invoice' | 'credit_note' | 'payment'

export interface ErpCustomer {
  erpId: string
  name: string
  companyName?: string | null
  email?: string | null
  phone?: string | null
  gstin?: string | null
  billingAddress?: string | null
  shippingAddress?: string | null
}

export interface ErpInvoiceLine {
  description: string
  quantity: number
  unitPrice: bigint
  discountPercent?: number
  gstRate: number
  hsnSac?: string | null
  cgst?: bigint
  sgst?: bigint
  igst?: bigint
  lineTotal: bigint
  /** Stable provider item id (falls back to a slug of description). */
  itemId?: string | null
  /** GetSwipe item_type; defaults to 'Service'. */
  itemType?: 'Service' | 'Product'
}

export interface ErpInvoice {
  erpId: string
  invoiceNo?: string | null
  customerErpId?: string | null
  clientGstin?: string | null
  placeOfSupply?: string | null
  invoiceDate: string
  dueDate?: string | null
  subtotal: bigint
  discountTotal: bigint
  taxTotal: bigint
  grandTotal: bigint
  amountPaid?: bigint
  notes?: string | null
  eInvoice?: boolean
  /** Customer display name for the provider party block. */
  customerName?: string | null
  /** Customer phone for the provider party block. */
  customerPhone?: string | null
  /** Customer email for the provider party block. */
  customerEmail?: string | null
  /** Billing address for the provider party block. */
  billingAddress?: string | null
  /** Shipping address for the provider party block. */
  shippingAddress?: string | null
  lines: ErpInvoiceLine[]
}

export interface ErpCreditNote {
  erpId: string
  creditNoteNo?: string | null
  invoiceErpId?: string | null
  customerErpId?: string | null
  reason?: string | null
  amount: bigint
  cnDate: string
}

export interface ErpPayment {
  erpId: string
  invoiceErpId?: string | null
  amount: bigint
  method?: string | null
  reference?: string | null
  paidAt: string
}

export interface ProviderRef {
  provider: ProviderKey
  providerId: string
  providerSerial?: string | null
}

export interface ProviderInvoiceResult extends ProviderRef {
  irn?: string | null
  qr?: string | null
  pdfUrl?: string | null
}

export type PaymentStatusValue = 'pending' | 'partial' | 'paid' | 'failed' | 'cancelled'

export interface PaymentStatus {
  status: PaymentStatusValue
  amountPaid?: bigint
}

export type WebhookEventType =
  | 'document.created'
  | 'document.updated'
  | 'document.status_changed'
  | 'document.cancelled'
  | 'payment.recorded'
  | 'payment.status_changed'
  | 'unknown'

export interface WebhookEvent {
  provider: ProviderKey
  eventId: string
  eventType: WebhookEventType
  providerId?: string | null
  providerSerial?: string | null
  irn?: string | null
  qr?: string | null
  pdfUrl?: string | null
  paymentStatus?: PaymentStatusValue | null
  raw?: unknown
}

export interface BillingProvider {
  readonly key: ProviderKey

  upsertCustomer(c: ErpCustomer): Promise<ProviderRef>

  createInvoice(inv: ErpInvoice): Promise<ProviderInvoiceResult>
  updateInvoice(ref: ProviderRef, inv: ErpInvoice): Promise<ProviderInvoiceResult>
  cancelInvoice(ref: ProviderRef, reason: string): Promise<void>
  createCreditNote(cn: ErpCreditNote): Promise<ProviderInvoiceResult>

  recordPayment(p: ErpPayment): Promise<ProviderRef>
  getPaymentStatus(ref: ProviderRef): Promise<PaymentStatus>

  getInvoicePdf(ref: ProviderRef): Promise<{ url?: string; bytes?: Uint8Array }>
  getShareLink(ref: ProviderRef): Promise<string>

  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean
  parseWebhook(rawBody: string): WebhookEvent

  ping(): Promise<boolean>
}

/** Thrown when a provider is selected but its credentials are missing (fail-safe). */
export class BillingNotConfiguredError extends Error {
  constructor(message = 'Billing provider is not configured') {
    super(message)
    this.name = 'BillingNotConfiguredError'
  }
}

/** Thrown for provider-side/business errors that should NOT be blindly retried. */
export class BillingProviderError extends Error {
  readonly httpStatus?: number
  readonly errorCode?: string
  /** True for transient failures (429/5xx/timeout) that are safe to retry. */
  readonly retryable: boolean
  constructor(message: string, opts: { httpStatus?: number; errorCode?: string; retryable?: boolean } = {}) {
    super(message)
    this.name = 'BillingProviderError'
    this.httpStatus = opts.httpStatus
    this.errorCode = opts.errorCode
    this.retryable = opts.retryable ?? false
  }
}
