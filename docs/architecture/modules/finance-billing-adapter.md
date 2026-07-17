# Finance — Billing Provider Adapter & GetSwipe Integration (design)

Companion to `finance.md`. Defines how the Finance module issues GST invoices through an
**external billing engine (GetSwipe)** without the ERP ever coupling to it. Design-only — no code.
This is a Wave-2 design; **GetSwipe is an external paid service, so wiring live credentials is a
Constitution STOP condition** (the user provisions the account/API key before integration runs).

---

## 1. Principle — the ERP never talks to GetSwipe directly

```
Finance module (UI + business logic, ERP-owned data)
        │  (knows only the Invoice Service)
        ▼
Invoice Service            ← ERP-internal boundary; the ONLY billing API the rest of the ERP sees
        │
        ▼
BillingProvider (interface) ← the swappable contract
        │
        ▼
GetSwipeAdapter (one implementation)  →  GetSwipe API  (server-side only)
```

- **The ERP is the system of record for business data** (customers, invoices, payments, ledger).
- **GetSwipe is the billing *engine*** — it produces the GST-compliant invoice, IRN/e-invoice, QR, and PDF, and holds the statutory numbering. It is **not** the ERP's business database.
- No Finance business logic, UI, or other module ever imports a GetSwipe type or calls a GetSwipe URL. They call the **Invoice Service** with ERP-domain objects. Swapping GetSwipe for Zoho Books / Tally / Busy later means writing one new adapter class — nothing in Finance changes.

---

## 2. The `BillingProvider` interface (the swappable contract)

Every provider implements exactly this. Inputs/outputs are ERP-domain, provider-agnostic.

```ts
interface BillingProvider {
  readonly key: 'getswipe' | 'zoho' | 'tally' | 'busy' | 'internal'
  // Master data
  upsertCustomer(c: ErpCustomer): Promise<ProviderRef>          // create/update party
  // Documents
  createInvoice(inv: ErpInvoice): Promise<ProviderInvoiceResult> // → provider id + serial + IRN/QR
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
  verifyWebhook(headers, rawBody): boolean                       // HMAC signature check
  parseWebhook(rawBody): NormalizedBillingEvent                  // → provider-agnostic event
  // Health
  ping(): Promise<boolean>
}
```

`ErpInvoice`, `ErpCustomer`, etc. are the ERP's own domain types (money in **bigint paise**, matching
the live `payments`/`projects` tables). The adapter maps them to/from the provider's shape.

---

## 3. The Invoice Service (ERP-internal boundary)

The only billing API the rest of the ERP knows. It:
1. **Writes ERP tables first** (source of truth) — `finance_invoices`, `finance_payments`, etc.
2. **Enqueues an outbox row** for the provider (never calls the provider inline on the user's request → the UI stays fast and resilient to provider downtime).
3. Returns the ERP record immediately; provider IDs (serial/IRN/PDF) arrive asynchronously and update the ERP record.

Selecting the provider is config: `billing_provider = 'getswipe' | 'internal' | …` (a setting in
Administration/Vault). With `internal`, Finance still functions (invoices numbered by the Core
numbering service, PDF rendered locally) — so **Finance is never blocked on GetSwipe** and is provider-independent by construction.

---

## 4. GetSwipe API — researched facts (Jul 2026)

| Aspect | Detail |
|---|---|
| Base URL | `https://app.getswipe.in/api/partner` |
| Auth | **Bearer JWT** — `Authorization: Bearer <API_KEY>`; key from the Swipe dashboard (`app.getswipe.in/user?tab=api_integration`) |
| Create invoice | `POST /v2/doc` with `document_type: "invoice"` |
| Document types | invoice · estimate · pro_forma_invoice · **sales_return** · delivery_challan · purchase |
| Other doc ops | edit, get, cancel, **get PDF**, list |
| Customers | add · get · list · update · delete · update-mapping · **payment ledger** |
| Vendors | add · get · list · update · delete · mapping · ledger |
| Products/items | add · get · list · update · delete · mapping |
| Payments | **record payment** · list of payments |
| Specialised | **E-invoice** (IRN + QR), **e-way bill** (+ PDF), subscriptions, inventory/warehouses, **GSTIN lookup** |
| Invoice body | `party{id,type,name,email,phone_number,gstin,company_name}`, `items[]{name,quantity,unit_price,tax_rate,price_with_tax,net_amount,total_amount,hsn_code,item_type,unit,discount_percent|discount_amount,custom_columns}`, `payments[]{amount,method}`, `charges_and_deductions{tax_rate,sac_code}`, `document_date`/`due_date` (DD-MM-YYYY), `einvoice` bool, `extra_discount`, `round_off`, billing/shipping address |
| Invoice response | `{success, message, error_code, errors, data:{ hash_id, serial_number, irn, qr_code }}` |
| Webhooks | events: document create/update/**status change**/cancel + stock in/out. Verify with **`X-Signature` (HMAC-SHA256)** + a webhook secret. Handler must return **200 within 30 s**; Swipe **retries** failures. |

### Mapping ERP → GetSwipe
| ERP concept | GetSwipe |
|---|---|
| Customer (from CRM `clients`) | `party` (type `customer`) via add/update customer |
| Invoice | `POST /v2/doc` document_type `invoice`; ERP invoice id → `reference` (for idempotency) |
| **Credit note** | `document_type: "sales_return"` ⚠️ (GetSwipe has no distinct `credit_note` type — sales_return is the closest; **to be confirmed with a test account**) |
| Payment | `record payment` (or inline `payments[]` at create) |
| GST / HSN-SAC / tax breakdown | `items[].hsn_code` / `tax_rate` / `price_with_tax`; `charges_and_deductions.sac_code` |
| Discounts | `discount_percent`/`discount_amount` per item + `extra_discount` |
| Due date / status | `due_date`; status via webhook + get-document |
| PDF / share | get-document-PDF endpoint / share link |
| E-invoice (IRN+QR) | `einvoice:true` → response `irn`,`qr_code` |

---

## 5. GetSwipe limitations & unknowns (must design around)

1. **No documented rate limits** → treat as unknown; the sync worker throttles conservatively (serialized queue, small concurrency) and backs off on `429`/`5xx`.
2. **No documented idempotency-key header** → **we enforce our own idempotency** (see §7): the ERP invoice id is sent as `reference`, and before any create the worker checks the ERP↔provider link table; a create is never retried if a `provider_id` already exists.
3. **Credit note = `sales_return`** (assumption) — verify semantics (GST credit-note fields, linkage to original invoice) against a **test account** before relying on it.
4. **No documented pagination contract** for list endpoints → use provider list ops only for reconciliation sweeps, page defensively, and prefer webhooks + per-record `get` for freshness.
5. **PDF is a separate call** (not inline) → fetch lazily and cache the URL/bytes on the ERP invoice.
6. **Auth is a single long-lived API key** (no OAuth/refresh documented) → store in **Supabase Vault**, rotate via Administration, never expose to the browser.
7. **Webhook 30 s / retry** → handler must be fast + **idempotent** (dedupe by event id) and only enqueue internal work, not do it inline.

---

## 6. Data model (ERP-owned; additive, bigint paise)

Finance keeps its own tables (per `finance.md`), plus the provider-integration layer:

- `billing_provider_links(erp_entity, erp_id, provider, provider_id, provider_serial, irn, qr, pdf_url, status, last_synced_at)` — the ERP↔provider id map (idempotency + reconciliation anchor).
- `billing_sync_queue(id, op, erp_entity, erp_id, payload_hash, attempts, next_attempt_at, status, created_at)` — the **outbox**.
- `billing_sync_log(id, queue_id, direction, request_summary, response_summary, http_status, error_code, created_at)` — full audit trail (append-only; feeds Finance → Audit Log).
- `billing_webhook_events(id, provider, event_id, event_type, signature_ok, raw jsonb, processed_at)` — inbound dedupe/idempotency.
GetSwipe API key + webhook secret live in **Vault**, referenced by an Administration integration record — never in these tables.

---

## 7. Synchronisation strategy (outbox + reconciliation + webhooks)

**ERP is authoritative for business data; the provider is authoritative for statutory artifacts
(serial number, IRN, QR, PDF).** Conflict resolution follows that split.

| Concern | Design |
|---|---|
| **Initial sync** | One-time backfill: push existing customers, then open invoices, into GetSwipe; record links. Run as a throttled batch job with progress + resumable checkpoints. |
| **Incremental sync** | Outbox: every Finance write enqueues a `billing_sync_queue` row; a worker (Edge Function on `pg_cron`, staggered) drains it FIFO per entity. |
| **Idempotency** | ERP invoice id as `reference`; worker checks `billing_provider_links` first — create only if no `provider_id`; updates are safe-by-id; each queue row carries a `payload_hash` so unchanged retries are no-ops. |
| **Retry queue** | On `429`/timeout/`5xx`: exponential backoff (`next_attempt_at`), max attempts, then park as `failed` for manual action. Business-rule errors (`4xx`) don't retry — surfaced to the user. |
| **Failure logging** | Every attempt → `billing_sync_log` (+ `billing_webhook_events` for inbound). Visible in Finance → GetSwipe Integration + Audit Log. |
| **Webhook processing** | An Edge Function verifies `X-Signature` (HMAC-SHA256, secret from Vault), dedupes by event id (`billing_webhook_events`), returns **200 immediately**, and enqueues internal handling → updates ERP invoice/payment status, IRN, PDF. |
| **Conflict resolution** | Business fields (amounts, party, lines): **ERP wins** (re-push). Statutory fields (serial, IRN, QR, PDF, provider status): **provider wins** (pull into ERP). Divergences logged for review. |
| **Manual re-sync** | Per-record and bulk "Re-sync" action (requires `finance.billing.sync` permission) that re-enqueues with a fresh payload; and a "Reconcile" sweep that diffs ERP vs provider `list` and flags mismatches. |

**Sync directions**
- ERP Customer ↔ GetSwipe party (push on change; pull ledger for balances).
- ERP Invoice ↔ GetSwipe document (push create/update/cancel; pull serial/IRN/QR/PDF/status).
- ERP Payment ↔ GetSwipe payment (push record; pull status via webhook + payment list).

---

## 8. Security & where code runs

- **All GetSwipe calls run server-side only** — in a Supabase **Edge Function** (`billing-provider`), never the browser. The frontend calls the Invoice Service (an ERP RPC/edge endpoint) which enqueues work; the worker + webhook functions hold the adapter.
- **API key + webhook secret in Supabase Vault**; the Edge Function reads them at runtime (same pattern as the existing `get_google_sa_json` vault approach). The key is never in the DB tables, the repo, or the client bundle.
- **Least-privilege automation identity** for the sync worker (per the validation's X5 decision), not the blanket service role where avoidable.
- **Staging isolation**: a `billing_provider = 'internal'` (or a GetSwipe *test* key) on staging so no real invoices are issued during development — consistent with the notifications-sandbox rule.

---

## 9. Finance module scope (from the Constitution) — where each piece lives

| Area | Source of truth | GetSwipe role |
|---|---|---|
| Dashboard, Receivables, Collections, Customer Statements, Financial Reports, Tax Summary, GST Reports | ERP (Finance tables + reporting views) | pull balances/status for accuracy |
| Invoices, Credit Notes | ERP invoice tables (authoritative) | billing engine: serial/IRN/QR/PDF |
| Payments | ERP | record + status sync |
| Expenses, Travel Expenses | ERP (HRMS+Finance T&E sub-domain) | not sent to GetSwipe (internal) |
| GetSwipe Integration (page) | ERP | sync status, queue, logs, re-sync, key config |
| Settings, Audit Log | ERP/Administration | provider config + `billing_sync_log` |

---

## 10. Recommended safest implementation approach (phased)

1. **Design frozen (this doc) → user provisions a GetSwipe account + API key (STOP-condition; external paid service).** Nothing live until the key exists.
2. **Build provider-independent Finance first** (ERP tables, Invoice Service, `internal` provider that numbers + renders PDFs locally). Finance is fully usable with no GetSwipe.
3. **Add `GetSwipeAdapter` behind the interface**, wired to a **GetSwipe test key on staging**. Validate: customer upsert → invoice create → PDF → payment record → status webhook → cancel; confirm the `sales_return`/credit-note mapping.
4. **Outbox + retry + webhook + reconciliation**, with full logging and a manual re-sync UI.
5. **Reconcile & harden** (rate-limit backoff tuned to observed behavior, conflict dashboard).
6. **Production**: only after staging validation + explicit approval; the live GetSwipe key is set in production Vault at cutover (a production/billing decision the user makes).

**Provider-replaceability is guaranteed**: Zoho Books / Tally / Busy each become a new class
implementing `BillingProvider` (§2) with its own auth + mapping; the Invoice Service, Finance UI,
outbox, and all other modules are untouched.

---

**Sources (GetSwipe API research):**
- [Swipe Developers — Introduction](https://developers.getswipe.in/introduction)
- [Swipe — Create a Document (API reference)](https://developers.getswipe.in/api-reference/document-v2/create-a-document)
- [Swipe — API index (llms.txt)](https://developers.getswipe.in/llms.txt)
- [Swipe — API Integration overview](https://getswipe.in/sa/apis)
