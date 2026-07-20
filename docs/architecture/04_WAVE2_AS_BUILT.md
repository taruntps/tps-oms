# Wave 2 — As-Built Record (Revenue Spine: CRM → Sales → Finance & Accounts)

**Status:** ✅ Built on `staging`, additive/EXPAND only, production untouched.
**Scope:** CRM, Sales, Finance & Accounts + the provider-agnostic **BillingProvider**
integration framework (GetSwipe adapter, server-side only). Single source of truth for
what Wave 2 actually ships. Companion to [`03_WAVE1_AS_BUILT.md`](03_WAVE1_AS_BUILT.md).

## 1. Database (Supabase staging `gytscakgtsbxgdkbqhbx`)

| Migration | Adds |
|---|---|
| `082_crm.sql` | `crm_pipeline_stages`, `crm_leads`, `crm_contacts`, `crm_activities`, `crm_lead_stage_history`; nullable cols on `clients` (owner_id, lifecycle_stage, industry) and `referrals` (referral_code, commission_percent) |
| `083_sales.sql` | `sales_deal_stages`, `sales_services`, `sales_deals`, `sales_deal_stage_history`, `sales_quotations`, `sales_quotation_lines`, `sales_orders`, `sales_handoff_log` |
| `084_finance.sql` | `finance_invoices`, `finance_invoice_lines`, `finance_credit_notes`, `finance_govt_fees`, `finance_bank_accounts`, `finance_accounting_periods`; `payments.invoice_id` (additive); billing framework: `billing_provider_links`, `billing_sync_queue`, `billing_sync_log`, `billing_webhook_events` |
| `085_wave2_audit_triggers.sql` | `fn_audit_wave2()` generic trigger → `audit_log` on all 14 Wave-2 business tables |

- **Money:** every amount is `bigint` **paise** (÷100 to display via `formatRupees`).
- **RLS:** enabled on all new tables via the existing `auth_role()` pattern.
- **Permissions:** 27 new keys (`crm.*`, `sales.*`, `finance.*`) + 90 role grants seeded into `permissions`/`role_permissions`.
- **Expand-contract:** every touch of an existing table (`clients`, `referrals`, `payments`) is additive; no destructive change.

## 2. Application modules (all lazy-loaded, registered in `core/registry.ts`)

- **CRM** `src/modules/crm/` — Leads pipeline (Kanban + stage history), Lead detail with activities timeline + **Convert-to-Client**, Referrals. Routes `/crm/leads`, `/crm/leads/:id`, `/crm/referrals`.
- **Sales** `src/modules/sales/` — Deals pipeline, Deal detail with Quotations (line items from service catalogue, GST computed), **Mark-Won → Sales Order + finance handoff log**, Service catalogue. Routes `/sales/deals`, `/sales/deals/:id`, `/sales/services`.
- **Finance & Accounts** `src/modules/finance/` — Dashboard (outstanding / collections / govt-fees), Invoices (draft → issue), Invoice detail (lines + payments + credit notes), Payments, Government fees. Routes `/finance`, `/finance/invoices`, `/finance/invoices/:id`, `/finance/payments`, `/finance/govt-fees`.
- **Sidebar:** three entries added — CRM, Sales, Finance (role-gated).

## 3. Billing integration framework (Integration Adapter pattern)

**The ERP never talks to GetSwipe directly.** Flow: Finance UI → `billing_sync_queue` (enqueue) → **billing-worker** edge function → `BillingProvider` adapter → GetSwipe API; inbound via **billing-webhook** edge function.

- **Frontend** `src/core/billing/` — pure TS, no secrets, no external calls: domain types, the `BillingProvider` interface, and `invoiceService.ts` (enqueue only).
- **Edge (Deno, server-side)** `supabase/functions/` — `_shared/billing/{interface,config,factory,getswipeAdapter,internalProvider}.ts`, `billing-worker/`, `billing-webhook/`.
- `BillingProvider` methods: `upsertCustomer, createInvoice, updateInvoice, cancelInvoice, createCreditNote, recordPayment, getPaymentStatus, getInvoicePdf, getShareLink, verifyWebhook, parseWebhook, ping`.
- **Default provider = `InternalProvider`** (local numbering, no external calls). `GetSwipeAdapter` is selected only when `BILLING_PROVIDER=getswipe` **and** `GETSWIPE_API_KEY` is present.
- **Secrets** (`GETSWIPE_BASE_URL`, `GETSWIPE_API_KEY`, `GETSWIPE_BUSINESS_ID`, `GETSWIPE_WEBHOOK_SECRET`) read from `Deno.env` only; logs carry request/response summaries with tokens redacted. **None committed anywhere.**

## 4. Final architecture verification (pre-commit)

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | CRM, Sales, Finance, Operations share one business flow | ✅ | FK chain `crm_leads → sales_deals → sales_orders → finance_invoices → payments`, plus `sales_deals.project_id → projects` |
| 2 | One Customer record throughout | ✅ | `crm_leads`, `crm_contacts`, `sales_deals`, `sales_orders`, `finance_invoices`, `finance_credit_notes` all FK `client_id → clients` |
| 3 | Sales Orders trace to Projects | ✅ | `sales_orders.deal_id → sales_deals.project_id → projects` |
| 4 | Projects trace to Invoices | ✅ | `finance_invoices.project_id → projects` |
| 5 | Invoices trace to GetSwipe sync records | ✅ | `billing_provider_links(erp_entity='invoice', erp_id)` + `finance_invoices.provider_id/irn/pdf_url` + `billing_sync_queue` |
| 6 | Payments trace back to originating Invoice | ✅ | `payments.invoice_id → finance_invoices` |
| 7 | Every step linked through immutable IDs | ✅ | all PKs are `uuid` |
| 8 | Every business event written to Audit Log | ✅ | migration 085 attaches `fn_audit_wave2()` to 14 tables; INSERT/UPDATE/DELETE smoke-tested → 3 `audit_log` rows |
| 9 | BillingProvider is the ONLY GetSwipe caller | ✅ | grep: no `getswipe`/`fetch` outside `supabase/functions/_shared/billing` (frontend refs are enqueue defaults/comments only) |
| 10 | No Finance UI / component / edge fn / module bypasses BillingProvider | ✅ | no HTTP client in `src/core/billing`; UI only writes finance tables + enqueues |
| 11 | No API keys/secrets/tokens anywhere in the repo | ✅ | grep for hardcoded secret values → none; all env-only |
| 12 | InternalProvider remains default until live GetSwipe creds supplied | ✅ | `factory.getProvider()` returns InternalProvider unless key present |

**Fix applied during verification:** point 8 initially failed (Wave-2 tables had no audit triggers) → resolved by migration `085_wave2_audit_triggers.sql`.

## 5. Build gate

- `tsc -b` (strict, typed Supabase client) — ✅ no errors
- `vite build` — ✅ built; Wave-2 pages lazy-loaded as separate chunks; initial bundle ~483.7 KB (≈ Wave 1's 478 KB)
- `vitest run` — ✅ 5/5
- Runtime boot — ✅ app loads with zero console errors; `/finance` deep-route loads its lazy chunk and redirects to login (ProtectedRoute) without crash

## 6. GetSwipe go-live gate (NOT yet crossed)

Everything above is built with **no live credentials**. When live API testing is required, the user must supply **GetSwipe API Key, Business ID, and Webhook Secret** (as Supabase secrets, never committed). Until then, `InternalProvider` keeps Finance fully functional on staging.
