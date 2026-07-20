// Core Platform — Billing framework: provider-agnostic ERP-side domain types.
//
// This module is FRONTEND-SAFE: it contains NO secrets, NO provider code, and
// makes NO external/provider calls. It defines the ERP's own billing domain
// (all money in bigint paise) and the swappable `BillingProvider` contract.
//
// The concrete provider implementations (GetSwipe, Internal, …) live ONLY in
// Supabase Edge Functions under `supabase/functions/_shared/billing/`, where a
// Deno-local copy of the `BillingProvider` interface mirrors the one below.
// See docs/architecture/modules/finance-billing-adapter.md for the binding design.

// ── Provider identity ──────────────────────────────────────────────────────
export type ProviderKey = 'getswipe' | 'zoho' | 'tally' | 'busy' | 'internal'

// ERP entity kinds that can be linked to a provider record.
export type ErpEntity = 'customer' | 'invoice' | 'credit_note' | 'payment'

// Outbox operations enqueued for the sync worker.
export type BillingOp =
  | 'upsert_customer'
  | 'create_invoice'
  | 'update_invoice'
  | 'cancel_invoice'
  | 'create_credit_note'
  | 'record_payment'

// ── ERP domain types (money = bigint paise throughout) ─────────────────────
export interface ErpCustomer {
  erpId: string // clients.id
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
  /** Unit price in paise. */
  unitPrice: bigint
  discountPercent?: number
  gstRate: number
  hsnSac?: string | null
  /** Computed CGST/SGST/IGST in paise (ERP is authoritative for amounts). */
  cgst?: bigint
  sgst?: bigint
  igst?: bigint
  /** Line total in paise. */
  lineTotal: bigint
}

export interface ErpInvoice {
  erpId: string // finance_invoices.id
  invoiceNo?: string | null
  customerErpId?: string | null
  clientGstin?: string | null
  placeOfSupply?: string | null
  invoiceDate: string // ISO date (YYYY-MM-DD)
  dueDate?: string | null
  /** Amounts in paise. */
  subtotal: bigint
  discountTotal: bigint
  taxTotal: bigint
  grandTotal: bigint
  amountPaid?: bigint
  notes?: string | null
  /** Request an e-invoice (IRN + QR) from the provider. */
  eInvoice?: boolean
  lines: ErpInvoiceLine[]
}

export interface ErpCreditNote {
  erpId: string // finance_credit_notes.id
  creditNoteNo?: string | null
  invoiceErpId?: string | null
  customerErpId?: string | null
  reason?: string | null
  /** Amount in paise. */
  amount: bigint
  cnDate: string // ISO date
}

export interface ErpPayment {
  erpId: string // payments.id
  invoiceErpId?: string | null
  /** Amount in paise. */
  amount: bigint
  method?: string | null
  reference?: string | null
  paidAt: string // ISO date/time
}

// ── Provider results (returned by adapters, mapped back to ERP) ────────────
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
  /** Amount settled in paise, if reported by the provider. */
  amountPaid?: bigint
}

// ── Inbound webhook (provider-agnostic, normalized) ────────────────────────
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
  /** Provider document/party id the event refers to, if any. */
  providerId?: string | null
  providerSerial?: string | null
  irn?: string | null
  qr?: string | null
  pdfUrl?: string | null
  paymentStatus?: PaymentStatusValue | null
  /** Original payload for audit (never trusted for statutory writes without mapping). */
  raw?: unknown
}

// ── The swappable contract ─────────────────────────────────────────────────
// Every provider implements EXACTLY this. Inputs/outputs are ERP-domain and
// provider-agnostic. The Deno adapters mirror this interface locally.
export interface BillingProvider {
  readonly key: ProviderKey

  // Master data
  upsertCustomer(c: ErpCustomer): Promise<ProviderRef>

  // Documents
  createInvoice(inv: ErpInvoice): Promise<ProviderInvoiceResult>
  updateInvoice(ref: ProviderRef, inv: ErpInvoice): Promise<ProviderInvoiceResult>
  cancelInvoice(ref: ProviderRef, reason: string): Promise<void>
  createCreditNote(cn: ErpCreditNote): Promise<ProviderInvoiceResult>

  // Money
  recordPayment(p: ErpPayment): Promise<ProviderRef>
  getPaymentStatus(ref: ProviderRef): Promise<PaymentStatus>

  // Artifacts
  getInvoicePdf(ref: ProviderRef): Promise<{ url?: string; bytes?: Uint8Array }>
  getShareLink(ref: ProviderRef): Promise<string>

  // Inbound
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean
  parseWebhook(rawBody: string): WebhookEvent

  // Health
  ping(): Promise<boolean>
}
