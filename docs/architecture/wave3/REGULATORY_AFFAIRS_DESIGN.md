# Wave 3 — Regulatory Affairs Module (Design Specification)

> **STATUS: DESIGN ONLY — NOT IMPLEMENTED.** No code, SQL, migrations, React, or API code
> is produced here. This document is the FRS / TDS / DB / UI / Workflow / Permission / API
> **specification** for the Regulatory Affairs module. Implementation begins only after
> explicit user approval. Wave 1 + Wave 2 are frozen (`v2.0-wave2-complete`); production is
> untouched; all work targets staging.
>
> **Binding principles (ERP Constitution):** reuse before create; extend before replace;
> ERP is the single system of record; additive / expand-contract only (no destructive DB
> change); everything (templates, fees, rules, calendars) configurable via **Administration**,
> nothing hardcoded; money is **`bigint` paise**; cross-cutting services (Documents, Knowledge
> Base, Notifications, Audit, Reports, Finance) are reused, never duplicated.
>
> **Relationship to `modules/regulatory.md`:** that file is the architectural blueprint (ER
> model, RLS intent, automations). This Wave-3 document is the delivery-facing specification,
> expanding the twelve capability areas into Functional Requirements, screens, workflows,
> permissions, and API contracts. Table / enum / permission names are kept identical to
> `modules/regulatory.md` so the two documents describe one system.

---

## 0. Contents

1. Domain framing & regulatory glossary
2. Reuse & extension inventory (what already exists)
3. Functional Requirements (FRS) — twelve capability areas
4. Technical Design (TDS)
5. Database Design (specification tables — additive)
6. UI Design (menu, screens, forms, calendar, dashboards, mobile)
7. Workflow Design (label review, query resolution, licence renewal, NSF approval)
8. Permission Matrix
9. API Design (endpoints / RPCs / edge functions)
10. Configurability specification (Administration)
11. Integration specification
12. Reports, analytics & workflow automation
13. Non-functional requirements, acceptance criteria, open questions

---

## 1. Domain framing & regulatory glossary

TPS Xperts Group is a pharma / nutraceutical **regulatory affairs consultancy** (Mohali, India).
The Regulatory module is the system of record for each client's **FSSAI regulatory standing** and
the billable consulting work TPS performs to keep it compliant. It must mirror real FoSCoS/FSSAI
practice, not an abstraction of it.

| Term | Meaning (as used in this module) |
|---|---|
| **FSSAI** | Food Safety and Standards Authority of India — the regulator. |
| **FoSCoS** | Food Safety Compliance System — the online portal for licences, returns, product approval, annual returns. Successor to FLRS. |
| **FSSR 2011** | Food Safety and Standards Regulations, 2011 — the substantive rulebook (Food Product Standards, Contaminants, Additives, Licensing & Registration regulations). |
| **FSS (Labelling & Display) Regulations, 2020** | Governs mandatory label declarations, font/area rules, nutrition panel, allergen & veg/non-veg mark, claims. Replaced the labelling portions of the 2011 Packaging & Labelling regs. |
| **Health Supplements & Nutraceuticals Regulations, 2022** | Schedules (notably **Schedule VI–VIII**) listing permitted vitamins/minerals (RDA limits), botanicals, additives, and nutraceutical ingredients. |
| **Basic Registration** | Petty FBO, annual turnover ≤ ₹12 lakh — **Form A**. |
| **State Licence** | Turnover ₹12 lakh–₹20 crore or defined capacity — **Form B**. |
| **Central Licence** | Turnover > ₹20 crore, importers, e-commerce, 100% EOU, central-govt caterers, operators at ports/airports — **Form B**. |
| **Import Licence / IEC linkage** | Central licence with importer KOB; requires IEC (DGFT) reference. |
| **ARN** | Application Reference Number issued by FoSCoS on submission. |
| **KOB** | Kind of Business (manufacturer, repacker, importer, e-commerce, transporter, storage, etc.). |
| **SOI** | Statement of Ingredients — versioned ingredient composition sheet (domestic / export format). |
| **SOI ↔ Product** | An SOI holds ordered dynamic columns and per-product ingredient rows. |
| **Form II** | Inspection / improvement-related form in the FSSAI workflow (used here for inspection follow-up and specified authority submissions). |
| **Annual Return Form D-1** | Annual return for manufacturers/importers, **due 31 May** for the prior financial year. |
| **Form D-2** | Half-yearly return for units handling **milk / milk products**. |
| **NSF / Non-Specified Food** | Non-specified / novel food under FSS (Approval for Non-Specified Food and Food Ingredients) Regulations, 2017 — requires prior FSSAI approval before manufacture/sale. |
| **Product Approval** | FSSAI approval for a product not covered by an existing standard. |
| **Ingredient NOC** | No-objection certificate for a new/novel ingredient. |
| **SOI compliance verdict** | Computed `pass | conditional | fail` for a reviewed SOI/label against `regulatory_rules`. |
| **NABL** | National Accreditation Board for Testing and Calibration Laboratories — accredits the labs whose test reports feed the compliance engine. |
| **Standards of Identity (SOI-Std)** | FSSR product-standard definitions (compositional identity) a product must meet; distinct from the ingredient **Statement of Ingredients**. Modeled as `regulatory_rules(rule_domain='standard_of_identity')`. |

> **Naming note.** "SOI" is overloaded in the domain. In this module, **SOI = Statement of
> Ingredients** (the `soi_archive`/`soi_products` tables). The FSSR product **Standard of
> Identity** is captured as a rule domain (`standard_of_identity`) inside `regulatory_rules`,
> never as a second table. UI copy always disambiguates.

**In scope:** licence lifecycle; FoSCoS submission tracking; authority query loop; SOI, label &
claims review; product & ingredient masters; compliance calendar (renewals, annual returns,
Form II, obligations); product approval / ingredient NOC / NSF service line; export documentation;
structured lab-result ingestion; inspection / recall / adverse-event tracking; government-fee
obligations (to Finance); regulatory documents & templates (via DMS); compliance dashboard,
reports, analytics, and workflow automation.

**Explicitly NOT in scope (owned elsewhere):** project stages/timing/block requests → **Operations**;
invoices, fee accounting, payments → **Finance**; ISO/NABCB certification audits → separate platform;
document storage mechanics/Drive sync → **core/files + DMS**; client master/contacts → **CRM**;
legal interpretation (the module encodes rule *checks*; a human reviewer signs off).

---

## 2. Reuse & extension inventory

**Extend (do NOT recreate) — additive columns only:**

| Existing table | Role | Wave-3 additions |
|---|---|---|
| `clients` | Client master (CRM-owned) | read-only reference; add regulatory-scope link via new `client_regulatory_profiles` |
| `projects` | Operations engagement | read-only reference; queries/obligations link by `project_id` |
| `licenses` (23 cols) | Licence system of record + FoSCoS vault | add lifecycle/ARN/renewal/appeal columns (§5.1) |
| `authority_queries` (19 cols) | Query/deficiency loop | add licence/approval links, status enum, points rollup (§5.2) |
| `soi_archive` | Versioned SOI header | add `product_id`, `review_status` |
| `soi_products` | SOI rows (jsonb) | unchanged |

**Reuse cross-cutting platform services (no duplication):**

- **Administration** — roles/permissions, feature flags, settings, **regulatory templates, fee
  schedules, rule library, holiday calendar** (all configurable; nothing hardcoded).
- **Document Management (DMS)** — versioned storage of certificates, forms, SOI PDFs, query
  responses, lab reports, label artwork; Regulatory references `document_id`, never owns the bucket.
- **Knowledge Base** — FSSR clauses, labelling-rule notes, SOP articles surfaced contextually.
- **Notifications** — email (ZeptoMail) / in-app / WhatsApp (BSP, gated) / SMS.
- **Audit Log** — append-only trail for every state change and credential reveal.
- **Finance** — government fees emitted to `govt_fees` (a.k.a. `finance_govt_fees`); pass-through
  vs billable handled there; Regulatory only *emits an obligation* and back-links the fee id.
- **Reports/Analytics** — shared DataTable export + PDF/CSV/iCal helpers.
- **Supabase Vault** — `store_fssai_credential` / `reveal_fssai_credential` SECURITY DEFINER +
  `credential_access_log`; the **sole** FoSCoS credential path (unchanged).

---

## 3. Functional Requirements (FRS)

Each capability lists requirements as `FR-<area>-<n>`. Priority: **M** = must (milestone 1),
**S** = should, **C** = could (later milestone).

### 3.1 Client Regulatory Projects

| ID | Requirement | Pri |
|---|---|---|
| FR-CRP-1 | Every regulatory engagement links to an existing `clients` row and, where an Operations engagement exists, to a `projects` row. Regulatory never creates client masters. | M |
| FR-CRP-2 | A **client regulatory profile** records the client's regulatory scope: KOB set, premises count, applicable licence tiers, product categories handled, export markets, and assigned regulatory executive/manager. | M |
| FR-CRP-3 | A single client may hold multiple licences (multi-premises, multi-tier) and multiple products; the profile aggregates compliance health across all of them. | M |
| FR-CRP-4 | Profile shows a roll-up: active/expiring licences, open queries, overdue obligations, in-flight approvals, open recalls — a per-client compliance health score. | S |
| FR-CRP-5 | Reassignment of the responsible executive/manager is audited and re-points notification routing. | S |

### 3.2 Product Master & Ingredient Master

| ID | Requirement | Pri |
|---|---|---|
| FR-PM-1 | Canonical **product** records per client: name, brand, `product_kind` (nutraceutical / health_supplement / fsmp / general), FSSAI **category** mapping, pack sizes, `is_active`, free-form `attributes` jsonb. | M |
| FR-PM-2 | **FSSAI category tree** (`fssai_categories`, parent/child) with `regulation_ref`; the mapped category drives which SOI/label/standard-of-identity rules apply. | M |
| FR-PM-3 | **Ingredient master** (`ingredients`): canonical ingredient with synonyms, INS number (for additives), functional class, default unit, and links to the `regulatory_rules` that govern its permissible limits (RDA / additive schedule / botanical schedule). | M |
| FR-PM-4 | Each ingredient carries **permissible-limit references** per applicable schedule (e.g., Schedule VI vitamin/mineral RDA ceilings, Schedule VII botanicals, additive INS max levels) sourced from `regulatory_rules`, not hardcoded. | M |
| FR-PM-5 | SOI rows reference ingredient-master entries so the same ingredient resolves to consistent rules across all products/clients. | S |
| FR-PM-6 | Products and ingredients are the shared catalogue other modules (Sales, label-artwork tooling) may read. | C |

### 3.3 Licences (FSSAI Basic/State/Central, Import) — EXTEND `licenses`

| ID | Requirement | Pri |
|---|---|---|
| FR-LIC-1 | Determine licence **tier** from turnover / capacity / KOB / premises count (Registration ≤ ₹12L; State ₹12L–₹20Cr; Central > ₹20Cr, importers, e-commerce, EOU, central caterers). | M |
| FR-LIC-2 | Full lifecycle: `draft → submitted → query_raised → granted → active → renewal_due → expired → surrendered`, plus branches `rejected → appealed` and `refile`. | M |
| FR-LIC-3 | Capture FoSCoS **ARN** on submission, and `license_number`, `issue_date`, `expiry_date`, `validity_years` (1–5) on grant. | M |
| FR-LIC-4 | **Import licence** modeled as a Central licence with importer KOB + IEC reference field; export-market metadata captured on the client profile. | M |
| FR-LIC-5 | **Renewal window opens 180 days before expiry**; on-time ≤ expiry; **late fee ₹100/day** beyond expiry up to a configurable grace window, after which a fresh application is required. | M |
| FR-LIC-6 | **Modify** sub-flow (address, product, KOB, capacity change) and **surrender** sub-flow, each audited via `licence_events`. | M |
| FR-LIC-7 | **Rejection → appeal → re-file**: capture `rejection_reason`; appeal to Designated/Appellate Officer within statutory window with its own due clock (`appeal_status`, `appeal_due_date`); re-file chains via `parent_license_id`. | M |
| FR-LIC-8 | FoSCoS credentials revealed only through `reveal_fssai_credential` (audited); plaintext never leaves the DB function. | M |
| FR-LIC-9 | Every lifecycle transition writes an append-only `licence_events(before/after)` row and an `audit_log` entry. | M |
| FR-LIC-10 | On submission/renewal/grant, emit a government-fee obligation to Finance (bigint paise) and, for renewals, seed a Sales opportunity for the consulting fee. | S |

### 3.4 FoSCoS submission tracking · Export documentation · Form II · NSF approvals

| ID | Requirement | Pri |
|---|---|---|
| FR-SUB-1 | Track each FoSCoS submission (licence, renewal, modification, product approval, annual return) with ARN, submitted-by, submitted-date, portal status, and last-sync timestamp. | M |
| FR-SUB-2 | **Product Approval / Ingredient NOC / NSF** applications are a distinct service line (`product_approval_applications`) with their own lifecycle (`draft → submitted → under_review → clarification → recommended → approved | rejected → appealed`) and dossier checklist. | M |
| FR-SUB-3 | NSF applications require a dossier: composition/SOI, safety/toxicology data, stability, intended use & dosage, supporting lab results, literature/history-of-use; a checklist gates submission. | M |
| FR-SUB-4 | Approval review queries reuse the `authority_queries` loop, linked by `product_approval_id`. | M |
| FR-SUB-5 | On approval, capture approval number, validity, and conditions; the approved ingredient/product is unlocked for label use in compliance review. | M |
| FR-SUB-6 | **Export documentation** pack per product/consignment: SOI (export format), Certificate of Analysis (from `lab_results`), health/free-sale certificate references, importing-country requirement notes; assembled and exported as a document bundle. | S |
| FR-SUB-7 | **Form II** modeled as an obligation/submission type for inspection follow-ups and specified-authority submissions, tracked on the calendar with due date and document. | S |
| FR-SUB-8 | `foscos-sync` boundary (future, gated) polls ARN status and reconciles `lifecycle_status`; ships disabled behind a settings flag. | C |

### 3.5 Label Review & Claims Review (vs FSS Labelling & Display 2020)

| ID | Requirement | Pri |
|---|---|---|
| FR-LBL-1 | **Checklist-driven** label review against FSS (Labelling & Display) Regulations, 2020: name of food, ingredient list (descending order), nutritional information panel, net quantity, FSSAI logo + licence number, name/address of manufacturer, batch/lot, date of manufacture, best-before/expiry, veg/non-veg mark, allergen declaration, country of origin (imports), storage conditions, MRP. | M |
| FR-LBL-2 | Enforce **font-size / principal-display-area** rules relative to pack surface area, and nutrition-panel presence/format. | M |
| FR-LBL-3 | **Claims review**: nutrition claims, health claims, "no added sugar", "source of / high in", disease-risk-reduction claims — validated against permitted claim conditions and substantiation evidence; flag non-permitted or unsubstantiated claims. | M |
| FR-LBL-4 | Each check yields a **finding** with severity (`info | warning | blocker`) and a rule citation (`regulatory_rules.regulation_ref`). | M |
| FR-LBL-5 | Reviewer disposes each finding (`accept | waive-with-note | fix-required`) and signs off; a **compliance verdict** (`pass | conditional | fail`) + report PDF is produced and archived in DMS. | M |
| FR-LBL-6 | Reviews are **versioned** — re-review after a fix produces a new `compliance_reviews` row tied to the SOI/label version; prior verdicts are retained for audit. | M |
| FR-LBL-7 | Label artwork (image/PDF) is attached via DMS and referenced from the review. | S |

### 3.6 Regulatory Calendar

| ID | Requirement | Pri |
|---|---|---|
| FR-CAL-1 | Materialize recurring obligations per active licence: **renewal window**, **annual return Form D-1 (due 31 May)**, **half-yearly Form D-2** (milk products), **Form II**/inspection follow-ups, and per-licence custom obligations. | M |
| FR-CAL-2 | Obligation status pipeline `upcoming → due → submitted → overdue → waived`; overdue computed on **working days** against the shared gazetted-holiday calendar (next-working-day roll-over). | M |
| FR-CAL-3 | Calendar view (month/week/agenda) filterable by client, licence, obligation type, status, assignee; each entry deep-links to its source record. | M |
| FR-CAL-4 | iCal export and per-executive calendar subscription. | S |
| FR-CAL-5 | Obligation completion captures completed-by, completion date, submission ARN/document, and any government fee. | M |

### 3.7 Authority Queries — EXTEND `authority_queries`

| ID | Requirement | Pri |
|---|---|---|
| FR-QRY-1 | Record a query with `query_type` (deficiency letter / additional-info / inspection notice / show-cause), `received_date`, `round_no`, authority-set `response_due`, and optional link to a `license_id` or `product_approval_id`. | M |
| FR-QRY-2 | Break a query into discrete **points** (`authority_query_points`), each worked `open → drafting → answered → closed` with an assignee and evidence documents. | M |
| FR-QRY-3 | **SLA clock** runs against `response_due` on working days: **amber at T-3**, **red on breach**; dashboard + notifications reflect state. | M |
| FR-QRY-4 | Compile and submit a **response** (`authority_query_responses`) per round; capture `response_submitted_date`; round → `responded`. | M |
| FR-QRY-5 | Authority **resolves** (query → `resolved`) or **re-raises** (increment `round_no`, points carry forward or close individually). | M |
| FR-QRY-6 | Auto-rollup `points_total` / `points_resolved`; auto-close the query when all points close (DB trigger). | M |
| FR-QRY-7 | Existing project-scoped queries keep working (the `license_id`/`product_approval_id` links are additive/nullable); append-only delete rule preserved. | M |

### 3.8 Government Fees (integrate with `finance_govt_fees`)

| ID | Requirement | Pri |
|---|---|---|
| FR-FEE-1 | Regulatory **emits a government-fee obligation** (bigint paise) on submission/renewal/approval/return; Finance's `govt_fees` register records payer, payment, recovery. | M |
| FR-FEE-2 | Distinguish **pass-through** (client-paid or TPS-paid, reimbursable — NOT revenue) from the **billable consulting fee** (revenue via Sales/Finance); the government fee is always pass-through. | M |
| FR-FEE-3 | Fee amounts derive from a configurable **fee schedule** (Administration): licence tier × validity years × KOB, late-fee ₹100/day, product-approval/NSF fees; nothing hardcoded. | M |
| FR-FEE-4 | The Regulatory obligation back-links the Finance `govt_fee_id` for reconciliation; Regulatory never writes Finance tables directly (public API only). | M |
| FR-FEE-5 | A shared **Government-fee obligations report** reconciles regulatory-side obligations against Finance-side records. | S |

### 3.9 Submission Tracking · Approvals · Renewals (status pipelines)

| ID | Requirement | Pri |
|---|---|---|
| FR-PIPE-1 | Each pipeline (licence, approval, query, obligation) exposes an explicit, validated **state machine** (§7); illegal transitions are rejected in the DB. | M |
| FR-PIPE-2 | A **kanban / pipeline view** per pipeline shows records grouped by status with counts and SLA badges. | S |
| FR-PIPE-3 | Renewals reuse the licence state machine with `renewal_due → submitted → active`, chaining the new licence version via `parent_license_id`. | M |
| FR-PIPE-4 | Every transition is idempotent, audited, and (where relevant) emits notifications, fee obligations, and Sales opportunities. | M |

### 3.10 Compliance Dashboard

| ID | Requirement | Pri |
|---|---|---|
| FR-DSH-1 | KPI widgets: licences expiring (30/60/90d), renewal windows open, open queries, SLA at-risk/breached, obligations due this month, SOI reviews flagged, approvals in-flight, lab results OOS, open recalls, upcoming/adverse inspections, credential reveals (30d), licences by tier. | M |
| FR-DSH-2 | **Per-client compliance health** view: composite score + drill-down to the driving records. | S |
| FR-DSH-3 | Role-scoped: executives see their assignments; managers/directors see all; auditor read-only. | M |
| FR-DSH-4 | Widgets read via React Query with short staleTime; heavy buckets may be materialized views refreshed by the daily cron. | S |

### 3.11 Regulatory Documents · Document Versioning · Templates

| ID | Requirement | Pri |
|---|---|---|
| FR-DOC-1 | All regulatory documents (certificates, forms, SOI PDFs, query responses, lab reports, label artwork, compliance reports) are stored and **versioned via the DMS**; Regulatory references `document_id` only. | M |
| FR-DOC-2 | **Templates** (SOI formats domestic/export, query-response letter, compliance-report layout, cover letters, Form A/B checklists, NSF dossier checklist, CoA) are **configurable in Administration**; the module renders documents from the active template version. | M |
| FR-DOC-3 | Generated documents record which template version produced them (point-in-time reproducibility). | S |
| FR-DOC-4 | Document access inherits DMS permissions; credential documents are never generated into the DMS. | M |

### 3.12 Reports & Analytics · Workflow Automation

| ID | Requirement | Pri |
|---|---|---|
| FR-RPT-1 | Reports (§12.1): licence register, expiry/renewal forecast, authority-query log, SLA compliance, SOI/compliance review, compliance calendar, product-approval register, lab-results/OOS, inspection log, recall/adverse-event log, credential-access audit, government-fee obligations. | M |
| FR-RPT-2 | Exports: CSV, PDF, and iCal (calendar). Credential-access audit restricted to super_admin/director. | M |
| FR-AUT-1 | Scheduled automations (§12.2): expiry/renewal sweep, obligation materializer, SLA monitor, recurring-work→booked-revenue, licence-event log, query rollups, SOI review-on-save, FoSCoS reconcile (gated). | M |
| FR-AUT-2 | All scheduled work is gated by settings flags so staging stays sandboxed; reminders honour `reminder_settings`. | M |
| FR-AUT-3 | Working-day math uses the shared gazetted-holiday calendar for every SLA/window/due-date computation. | M |

---

## 4. Technical Design (TDS)

**Layering.** `modules/regulatory/` imports only `@/core/*` and its own folder. Layers:
`pages → hooks (React Query) → api (typed Supabase wrappers) → Postgres (RLS) + SECURITY DEFINER RPCs`.
No component reaches Supabase directly; every mutation is RLS-guarded server-side and mirrored by
`useCan()` for UI affordance only.

**State machines in the DB.** Licence, approval, query, and obligation transitions are validated by
`licence_transition` / `approval_transition` RPCs (or equivalent triggers) so lifecycle invariants
live in the database, not the client. Illegal transitions raise, keeping the audit trail truthful.

**Rule engine.** Compliance logic (additive limits, schedule RDA ceilings, label checklist, claims,
standards of identity) is **data, not code**: `regulatory_rules` holds jsonb rule definitions keyed
by `rule_domain` + `regulation_ref` + `rule_key`, versioned via `is_active`. `run_ingredient_check`
(SECURITY DEFINER) evaluates SOI rows / label attributes against active rules server-side, producing
`compliance_findings`. New FSSR schedules or amended labelling rules are configuration, enabling
point-in-time "which rules applied when reviewed" replay.

**Tested-vs-declared verdicts.** When a `lab_result_id` is supplied, the engine compares **NABL-tested**
analyte values (heavy metals, microbiology, assay/RDA actuals) against rule limits and stamps
`compliance_reviews.value_basis = 'tested'`; otherwise it evaluates declared values.

**Money.** Every money column is `bigint` **paise**. No `numeric`/rupee columns. Government fees post
to Finance in paise; the UI formats paise → ₹ only at the edge.

**Working-day math.** A shared gazetted-holiday calendar (Core/Admin reference data: national + state
holidays + weekends) drives all SLA/window/due-date computations; a due date landing on a
holiday/weekend rolls to the next working day; amber/red SLA thresholds skip non-working days.

**Credential boundary.** FoSCoS plaintext exists only inside `reveal_fssai_credential` /
`store_fssai_credential`; vault columns on `licenses` hold the secret **id**, never plaintext; every
reveal writes `credential_access_log` + `audit_log`.

**Expand-contract discipline.** All schema additions are `add column if not exists` with defaults; no
drops, no type changes on live columns; new child tables rather than reshaping parents;
`renewal_window_opens` maintained by a `before insert/update` trigger (not a generated column, per the
project's prior immutability lesson). `soi_products` permissive RLS is tightened to `auth_role()` in a
later contract step once the module owns writes.

**Cross-module boundaries.** Finance, Sales, Vendor Portal, FoSCoS, and mail/WhatsApp are reached only
through named adapters/public APIs; linkage across module ownership is by id only (no cross-module FKs).

---

## 5. Database Design (specification — additive; NOT migrations)

> Specification only: columns, types, keys, relationships, indexes, constraints. No `CREATE TABLE`.
> Existing tables are **extended** (additive columns); new tables are listed with full column specs.
> All tables carry `created_at timestamptz default now()`, `updated_at timestamptz`, and (where
> mutable) `created_by`/`updated_by uuid → profiles(id)` unless noted. `client_id` present on all
> client-owned tables for future multi-entity RLS.

### 5.1 `licenses` — EXTEND (existing 23 cols; additive only)

| Column | Type | Notes |
|---|---|---|
| `lifecycle_status` | enum `regulatory_licence_status` | `draft, submitted, query_raised, granted, active, renewal_due, expired, surrendered, rejected, appealed`; default `draft` |
| `application_ref` | text | FoSCoS ARN |
| `validity_years` | smallint | 1–5; `check (validity_years between 1 and 5)` |
| `renewal_window_opens` | date | trigger-maintained = `expiry_date − 180 days` |
| `parent_license_id` | uuid → `licenses(id)` | renewal / re-file chain; nullable |
| `rejection_reason` | text | nullable |
| `appeal_status` | text | `none | appealed | upheld | dismissed`; default `none` |
| `appeal_due_date` | date | nullable |
| `iec_reference` | text | nullable; import licences (DGFT IEC) |
| `kob` | text[] | Kind-of-Business set; nullable |

*Existing columns retained:* id, client_id, license_number, license_type, issue_date, expiry_date,
vault_credential_id, credential_username, last_credential_accessed_at, etc. Vault columns unchanged.
**Indexes (add if absent):** `licenses(lifecycle_status)`, `licenses(expiry_date)` (partial where
active), `licenses(client_id)`, `licenses(renewal_window_opens)`.

### 5.2 `authority_queries` — EXTEND (existing 19 cols; additive only)

| Column | Type | Notes |
|---|---|---|
| `license_id` | uuid → `licenses(id)` | nullable (queries may stand alone on a project) |
| `product_approval_id` | uuid → `product_approval_applications(id)` | nullable (approval review loop) |
| `query_status` | enum `query_status_stage` | `open, drafting, responded, resolved, reraised` |
| `points_total` | int | trigger-maintained rollup |
| `points_resolved` | int | trigger-maintained rollup |
| `resolved_date` | date | nullable |

**Indexes:** `authority_queries(query_status, response_due)`, `authority_queries(license_id)`,
`authority_queries(product_approval_id)`. Append-only delete rule preserved.

### 5.3 `soi_archive` — EXTEND

| Column | Type | Notes |
|---|---|---|
| `product_id` | uuid → `products(id)` | nullable during migration; populated going forward |
| `review_status` | text | `draft | in_review | reviewed`; default `draft` |

*Retained:* client_id, project_id, soi_type (`domestic|export`), columns (jsonb), version_no.
`soi_products` (id, soi_id, sr_no, data jsonb) **unchanged**.

### 5.4 New tables

**`client_regulatory_profiles`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| client_id | uuid → clients(id) | unique per client |
| kob_set | text[] | kinds of business |
| premises_count | int | |
| applicable_tiers | text[] | registration/state/central |
| export_markets | text[] | ISO country codes |
| responsible_executive_id | uuid → profiles(id) | |
| responsible_manager_id | uuid → profiles(id) | |
| health_score | int | 0–100, computed by daily job; nullable |
| notes | text | |

**`products`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| client_id | uuid → clients(id) | |
| category_id | uuid → fssai_categories(id) | |
| product_name | text | |
| brand | text | nullable |
| product_kind | text | `nutraceutical | health_supplement | fsmp | general` |
| pack_sizes | jsonb | array of {value, unit} |
| attributes | jsonb | free-form |
| is_active | boolean | default true |

**Indexes:** `products(client_id)`, `products(category_id)`, `products(product_kind)`.

**`fssai_categories`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| parent_id | uuid → fssai_categories(id) | nullable (tree) |
| code | text | unique |
| name | text | |
| regulation_ref | text | e.g., "HS&N 2022 Sch VI" |

**`ingredients`** (new — Ingredient Master)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| canonical_name | text | unique (case-insensitive) |
| synonyms | text[] | |
| ins_number | text | nullable (additives) |
| functional_class | text | e.g., vitamin, mineral, botanical, additive, excipient |
| default_unit | text | mg, µg, IU, % |
| rule_refs | uuid[] | → regulatory_rules(id) governing limits |
| is_active | boolean | default true |

**Index:** unique on `lower(canonical_name)`.

**`licence_events`** (append-only)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| license_id | uuid → licenses(id) | |
| event_type | text | `apply | grant | renew | modify | surrender | reject | appeal | refile | query | expire` |
| before_data | jsonb | |
| after_data | jsonb | |
| actor_id | uuid → profiles(id) | |
| created_at | timestamptz | insert-only; no update/delete |

**`authority_query_points`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| query_id | uuid → authority_queries(id) | |
| point_no | smallint | |
| description | text | |
| status | text | `open | drafting | answered | closed` |
| disposition | text | nullable |
| assigned_to | uuid → profiles(id) | nullable |

**`authority_query_responses`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| point_id | uuid → authority_query_points(id) | |
| round_no | smallint | |
| response_text | text | |
| document_ids | uuid[] | → DMS documents |
| submitted_date | date | |
| submitted_by | uuid → profiles(id) | |

**`compliance_reviews`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| soi_id | uuid → soi_archive(id) | nullable (label-only review) |
| product_id | uuid → products(id) | |
| lab_result_id | uuid → lab_results(id) | nullable (tested values) |
| review_kind | text | `ingredient | label | claims | combined` |
| verdict | text | `pass | conditional | fail` |
| value_basis | text | `declared | tested` |
| soi_version_no | int | version reviewed (point-in-time) |
| reviewed_by | uuid → profiles(id) | |
| report_document_id | uuid → DMS documents | nullable |
| created_at | timestamptz | |

**`compliance_findings`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| review_id | uuid → compliance_reviews(id) | |
| rule_id | uuid → regulatory_rules(id) | nullable |
| severity | text | `info | warning | blocker` |
| finding_text | text | |
| disposition | text | `open | accepted | waived | fixed` |
| disposition_note | text | nullable |
| disposed_by | uuid → profiles(id) | nullable |

**`regulatory_rules`** (rule library — Administration-configurable)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| rule_domain | text | `additive | schedule | rda | label | claim | standard_of_identity` |
| regulation_ref | text | e.g., "FSS L&D 2020 r.2.2" |
| rule_key | text | machine key |
| rule_data | jsonb | limits/conditions |
| effective_from | date | nullable (point-in-time) |
| effective_to | date | nullable |
| is_active | boolean | default true |

**Index:** `regulatory_rules(rule_domain, is_active)`.

**`compliance_obligations`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| license_id | uuid → licenses(id) | nullable |
| client_id | uuid → clients(id) | |
| obligation_type | text | `renewal | annual_return_d1 | half_yearly_d2 | form_ii | inspection | custom` |
| due_date | date | working-day adjusted |
| status | text | `upcoming | due | submitted | overdue | waived` |
| govt_fee_paise | bigint | nullable; paise |
| govt_fee_id | uuid | → Finance `govt_fees(id)` (by id, cross-module) |
| sales_opportunity_id | uuid | → Sales (by id); back-link |
| period_key | text | dedupe key per (licence, type, period) |
| submission_ref | text | ARN on completion |
| completed_by | uuid → profiles(id) | nullable |

**Indexes:** `compliance_obligations(status, due_date)`, unique `(license_id, obligation_type, period_key)`.

**`product_approval_applications`** (Product Approval / Ingredient NOC / NSF)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| client_id | uuid → clients(id) | |
| product_id | uuid → products(id) | nullable (ingredient NOC may precede product) |
| ingredient_id | uuid → ingredients(id) | nullable |
| approval_type | text | `product_approval | ingredient_noc | novel_food` |
| application_ref | text | FoSCoS ARN |
| status | enum `product_approval_status` | `draft, submitted, under_review, clarification, recommended, approved, rejected, appealed` |
| approval_number | text | nullable |
| approved_on | date | nullable |
| validity_to | date | nullable |
| conditions | text | nullable (approval conditions) |
| rejection_reason | text | nullable |
| govt_fee_paise | bigint | paise |
| govt_fee_id | uuid | → Finance |
| dossier | jsonb | checklist + attachments (document_ids) |
| reviewed_by | uuid → profiles(id) | nullable |

**Index:** `product_approval_applications(status)`, `(client_id)`.

**`lab_results`** (NABL report header — fed from Vendor Portal lab-test PO)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| client_id | uuid → clients(id) | |
| product_id | uuid → products(id) | |
| soi_id | uuid → soi_archive(id) | nullable |
| vendor_po_id | uuid | → Vendor Portal (by id) |
| lab_name | text | |
| nabl_scope | text | |
| report_no | text | |
| report_date | date | |
| ingest_source | text | `electronic | manual` |
| report_document_id | uuid → DMS | nullable |

**`lab_result_items`** (per-analyte rows)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| lab_result_id | uuid → lab_results(id) | |
| parameter | text | e.g., Lead (Pb), Total Plate Count, Vitamin C assay |
| method | text | test method |
| result_value | text | numeric-as-text + qualifier (e.g., "<0.1") |
| unit | text | |
| spec_limit | text | limit from rule / spec |
| out_of_spec | boolean | computed on save |

**`inspection_visits`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| license_id | uuid → licenses(id) | nullable |
| client_id | uuid → clients(id) | |
| visit_type | text | `scheduled | surprise` |
| visit_date | date | |
| officer | text | |
| scope | text | |
| observations | text | |
| outcome | text | `satisfactory | deficiency | adverse` |
| followup_obligation_id | uuid → compliance_obligations(id) | nullable |
| recorded_by | uuid → profiles(id) | |

**`recall_events`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| client_id | uuid → clients(id) | |
| product_id | uuid → products(id) | |
| lab_result_id | uuid → lab_results(id) | nullable trigger |
| trigger | text | `lab_oos | complaint | authority_order | adverse_event` |
| classification | text | `class_i | class_ii | class_iii` |
| affected_batches | jsonb | |
| action_taken | text | |
| authority_intimated_on | date | nullable |
| status | text | `open | action | intimated | closed` |
| closure_report_document_id | uuid → DMS | nullable |
| owner_id | uuid → profiles(id) | |

**`credential_access_log`** (existing pattern — insert-only)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| license_id | uuid → licenses(id) | |
| accessed_by | uuid → profiles(id) | |
| accessed_at | timestamptz | |
| reason | text | |

*(Reused as-is; no update/delete.)*

**`regulatory_templates`** (Administration-configurable; may live in Administration schema)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| template_key | text | `soi_domestic | soi_export | query_response | compliance_report | coa | form_a_checklist | form_b_checklist | nsf_dossier_checklist` |
| version_no | int | active version resolved by key |
| body | jsonb / text | template definition |
| is_active | boolean | one active per key |

### 5.5 New enums

- `regulatory_licence_status`: `draft, submitted, query_raised, granted, active, renewal_due, expired, surrendered, rejected, appealed`
- `query_status_stage`: `open, drafting, responded, resolved, reraised`
- `product_approval_status`: `draft, submitted, under_review, clarification, recommended, approved, rejected, appealed`

**Extend `notification_type` lookup** with: `licence_granted, licence_rejected, query_sla_breach,
obligation_due, soi_review_flagged, product_approval_decision, lab_result_oos, inspection_logged,
recall_opened` (plus reuse existing `license_expiring`, `query_received`).

### 5.6 RLS intent

| Table | Read | Write |
|---|---|---|
| `licenses` (expanded) | staff via `auth_role()`; credentials never selected client-side | `regulatory.license.manage`; vault columns only via SECURITY DEFINER RPCs |
| `licence_events` | staff read | insert-only via trigger/RPC (append-only) |
| `authority_queries`/`_points`/`_responses` | staff read | `regulatory.query.manage`; append-only on queries |
| `products`/`ingredients` | staff read | `regulatory.product.manage` |
| `fssai_categories`/`regulatory_rules`/`regulatory_templates` | staff read | `regulatory.rule.manage` (super_admin/director) |
| `soi_archive`/`soi_products` | staff read (tighten to `auth_role()` on promotion) | `regulatory.soi.edit` |
| `compliance_reviews`/`_findings` | staff read | `regulatory.label.review` |
| `compliance_obligations` | staff read | `regulatory.calendar.manage` |
| `product_approval_applications` | staff read | `regulatory.approval.manage` |
| `lab_results`/`lab_result_items` | staff read | `regulatory.labresult.manage` |
| `inspection_visits` | staff read | `regulatory.inspection.manage` |
| `recall_events` | staff read | `regulatory.recall.manage` |
| `client_regulatory_profiles` | staff read | `regulatory.project.manage` |
| `credential_access_log` | super_admin/director read | insert-only via RPC |

`auditor` is read-only across the board.

---

## 6. UI Design

### 6.1 Navigation / menu

Top-level **Regulatory** menu → sub-items:

```
Regulatory
├─ Dashboard            /regulatory
├─ Clients & Scope      /regulatory/clients
├─ Licences            /regulatory/licences
├─ Authority Queries    /regulatory/queries
├─ SOI & Labels         /regulatory/soi
├─ Product Approvals    /regulatory/approvals   (Product Approval / Ingredient NOC / NSF)
├─ Compliance Calendar  /regulatory/calendar
├─ Products             /regulatory/products
├─ Ingredients          /regulatory/ingredients
├─ Lab Results          /regulatory/lab-results
├─ Inspections          /regulatory/inspections
├─ Recalls & Adverse    /regulatory/recalls
├─ Reports              /regulatory/reports
└─ Rule Library (admin) /regulatory/rules
```

### 6.2 Screen catalogue

| Route | Screen | Purpose | Primary permission |
|---|---|---|---|
| `/regulatory` | Compliance Dashboard | KPI widgets; role-scoped | `regulatory.dashboard.view` |
| `/regulatory/clients` | Client Regulatory list | scope + health per client | `regulatory.project.view` |
| `/regulatory/clients/:id` | Client Regulatory Profile | KOB, tiers, markets, roll-up, assignments | `regulatory.project.view` |
| `/regulatory/licences` | Licence List | filter by tier/status/expiry/client | `regulatory.license.view` |
| `/regulatory/licences/:id` | Licence Detail | lifecycle, credentials, linked queries/obligations, events | `regulatory.license.view` |
| `/regulatory/licences/:id/lifecycle` | Lifecycle action | apply/grant/renew/modify/surrender/reject/appeal | `regulatory.license.manage` |
| `/regulatory/licences/:id/credential` | Credential reveal panel | FoSCoS creds via RPC (audited) | `regulatory.credential.reveal` |
| `/regulatory/queries` | Query queue | cross-project queue with SLA badges | `regulatory.query.view` |
| `/regulatory/queries/:id` | Query Detail | rounds, points, responses, documents | `regulatory.query.view` |
| `/regulatory/soi` | SOI List | versioned SOIs by client/product | `regulatory.soi.view` |
| `/regulatory/soi/:id` | SOI Editor | dynamic columns + product rows | `regulatory.soi.edit` |
| `/regulatory/soi/:id/review` | Compliance Review | ingredient/label/claims findings + disposition | `regulatory.label.review` |
| `/regulatory/approvals` | Approval List | product-approval / ingredient-NOC / NSF | `regulatory.approval.view` |
| `/regulatory/approvals/:id` | Approval Detail | dossier, review loop, decision, appeal | `regulatory.approval.view` |
| `/regulatory/calendar` | Compliance Calendar | renewals, returns, Form II, obligations | `regulatory.calendar.view` |
| `/regulatory/products` | Product Master | products + category mapping | `regulatory.product.view` |
| `/regulatory/ingredients` | Ingredient Master | ingredients + limit rules | `regulatory.product.view` |
| `/regulatory/lab-results` | Lab Results | NABL reports + analyte values | `regulatory.labresult.view` |
| `/regulatory/lab-results/:id` | Lab Result Detail | analytes vs spec; wire-back | `regulatory.labresult.view` |
| `/regulatory/inspections` | Inspection Visits | authority inspection log + follow-ups | `regulatory.inspection.view` |
| `/regulatory/recalls` | Recall / Adverse Events | recall & adverse-event cases | `regulatory.recall.view` |
| `/regulatory/reports` | Reports | register/forecast/SLA/etc. exports | `regulatory.report.view` |
| `/regulatory/rules` | Rule Library (admin) | permitted lists / schedules / label rules / templates | `regulatory.rule.manage` |

### 6.3 Key form specs

- **Licence form:** client, tier (auto-suggested from turnover/capacity/KOB), KOB multi-select,
  premises, validity years, IEC (imports), documents checklist (Form A/B set), ARN, dates. Lifecycle
  actions are stepper buttons gated by state + permission.
- **Query form:** query_type, received_date, response_due, round_no, link (licence/approval), points
  editor (add/assign/disposition). SLA badge (green/amber/red) computed live.
- **SOI Editor:** spreadsheet-style dynamic columns (add/reorder), product rows referencing Ingredient
  Master; "Run compliance review" action. Version banner shows `version_no` and review status.
- **Compliance Review panel:** findings grouped by severity; each finding shows rule citation + a
  disposition control (accept / waive-with-note / fix-required); a "value basis" chip (declared/tested);
  sign-off + generate report.
- **Approval form:** approval_type, product/ingredient, dossier checklist (each item → attach document),
  ARN, decision fields, conditions.
- **Obligation completion:** submission ARN, document, government fee (paise → ₹ display), completed-by.

### 6.4 Calendar UI

Month / week / agenda views; colour by obligation type; status chips (upcoming/due/overdue/submitted);
filters (client, licence, type, assignee); click → obligation detail → source record; iCal subscribe.

### 6.5 Dashboard UI

Grid of stat cards + lists (see FR-DSH-1). Per-client health drill-down. Executive view filters to
own assignments. Credential-reveal widget visible to super_admin/director only.

### 6.6 Mobile

Responsive read-first: dashboard KPIs, calendar agenda, query SLA queue, and licence-expiry list are
the mobile-priority surfaces; disposition/approval actions available but optimized for tablet. Credential
reveal is desktop-only by policy.

---

## 7. Workflow Design

### 7.1 Label / claims review (checklist-driven)

```
1. Select product (→ FSSAI category → applicable label/claim/standard rules).
2. Attach label artwork (DMS) + build/version SOI (ingredient rows).
3. Run compliance review:
   a. Ingredient checks  → each ingredient vs additive/schedule/RDA rules.
   b. Label checklist     → mandatory declarations, font/PDA area, nutrition panel,
                            allergen, veg/non-veg, FSSAI logo+licence no, net qty, dates.
   c. Claims checks       → each claim vs permitted-claim conditions + substantiation.
   d. (If lab_result_id)  → compare TESTED analyte values vs limits (value_basis=tested).
4. Findings list produced, each with severity + rule citation.
5. Reviewer disposition per finding: accept | waive-with-note | fix-required.
   - fix-required → loop back to step 2 (new SOI/label version, new review row).
6. Sign-off → verdict (pass|conditional|fail) → render report PDF (template) → archive DMS.
7. Blocker findings notify reviewer/manager (soi_review_flagged).
```

### 7.2 Authority query resolution (per round)

```
1. Authority issues query → record type, received_date, round_no, response_due, link.
2. Break into points; assign each; SLA clock starts (working days).
3. Work each point: open → drafting → answered; attach evidence (DMS).
   - SLA amber at T-3, red on breach → query_sla_breach notification.
4. Compile response for the round → submit on FoSCoS → response_submitted_date; round=responded.
5. Authority outcome:
   - Resolved  → query_status=resolved, resolved_date set, points closed.
   - Re-raised → round_no++ (reraised); points carry forward/close individually → back to step 2.
6. Trigger recomputes points_total/points_resolved; auto-closes query when all points closed.
```

### 7.3 Licence renewal

```
1. Daily sweep: at expiry−180d, open renewal window → lifecycle_status=renewal_due;
   create renewal obligation; emit obligation_due; seed Sales opportunity+draft quotation
   for the consulting fee (dedup per licence/period).
2. Prepare renewal set (Form A/B refresh, updated SOI/docs).
3. Submit on FoSCoS via vault creds → capture ARN → lifecycle_status=submitted;
   emit government-fee obligation to Finance (tier×validity from fee schedule).
   - If submitted ≤ expiry → on-time; if > expiry → add ₹100/day late fee up to grace window;
     beyond grace → must re-apply as fresh (new licence chained by parent_license_id).
4. Authority processing → optional query loop (§7.2) → optional inspection (State/Central).
5. Grant → new license_number/issue_date/expiry_date/validity_years; archive prior version;
   lifecycle_status=active; licence_granted notification; recompute calendar obligations.
```

### 7.4 NSF / product-approval / ingredient-NOC approval

```
1. Initiate from product/ingredient → create product_approval_applications (draft),
   approval_type ∈ {product_approval, ingredient_noc, novel_food}, dossier checklist.
2. Compile dossier: composition/SOI, safety/toxicology, stability, intended use & dosage,
   supporting lab_results, literature/history-of-use. Checklist gates submission.
3. Submit on FoSCoS (vault creds) → capture ARN → status=submitted;
   emit government-fee obligation to Finance (paise).
4. Authority / scientific-panel review:
   - Query/clarification → reuse query loop (linked by product_approval_id):
     status under_review ↔ clarification.
   - Panel recommendation → status=recommended.
5. Decision:
   - Approved → capture approval_number, validity_to, conditions; status=approved;
     product_approval_decision notification; unlock ingredient/product for label use.
   - Rejected → capture rejection_reason; status=rejected → appeal (own due clock) or re-file.
```

### 7.5 Inspection → recall / adverse event (summary)

```
Inspection logged (scheduled/surprise) → observations → outcome.
  outcome=deficiency/adverse → open follow-up obligation/query (Form II) + notify.
Recall/adverse trigger (lab_oos | complaint | authority_order | adverse_event) →
  create recall_event → classify (Class I/II/III) → affected batches + action →
  authority intimation → closed + closure report (DMS). Notifies manager/director.
```

---

## 8. Permission Matrix

Keys namespaced `regulatory.<entity>.<action>`. RLS is authoritative; `useCan()` mirrors for UI
affordance. `auditor` is read-only everywhere.

| Permission key | super_admin | director | manager | executive | accounts | auditor |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `regulatory.dashboard.view` | ✔ | ✔ | ✔ | ✔ | – | ✔(r) |
| `regulatory.project.view` | ✔ | ✔ | ✔ | ✔ | – | ✔ |
| `regulatory.project.manage` | ✔ | ✔ | ✔ | ✔ | – | – |
| `regulatory.license.view` | ✔ | ✔ | ✔ | ✔ | ✔(ref) | ✔ |
| `regulatory.license.manage` | ✔ | ✔ | ✔ | ✔ | – | – |
| `regulatory.credential.reveal` | ✔ | ✔ | ✔ | ✔ | – | – |
| `regulatory.credential.store` | ✔ | ✔ | – | – | – | – |
| `regulatory.query.view` | ✔ | ✔ | ✔ | ✔ | – | ✔ |
| `regulatory.query.respond` | ✔ | ✔ | ✔ | ✔ | – | – |
| `regulatory.query.manage` | ✔ | ✔ | ✔ | ✔ | – | – |
| `regulatory.soi.view` | ✔ | ✔ | ✔ | ✔ | – | ✔ |
| `regulatory.soi.edit` | ✔ | ✔ | ✔ | ✔ | – | – |
| `regulatory.label.review` | ✔ | ✔ | ✔ | ✔ | – | – |
| `regulatory.calendar.view` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `regulatory.calendar.manage` | ✔ | ✔ | ✔ | ✔ | – | – |
| `regulatory.product.view` | ✔ | ✔ | ✔ | ✔ | – | ✔ |
| `regulatory.product.manage` | ✔ | ✔ | ✔ | ✔ | – | – |
| `regulatory.approval.view` | ✔ | ✔ | ✔ | ✔ | – | ✔ |
| `regulatory.approval.manage` | ✔ | ✔ | ✔ | ✔ | – | – |
| `regulatory.labresult.view` | ✔ | ✔ | ✔ | ✔ | – | ✔ |
| `regulatory.labresult.manage` | ✔ | ✔ | ✔ | ✔ | – | – |
| `regulatory.inspection.view` | ✔ | ✔ | ✔ | ✔ | – | ✔ |
| `regulatory.inspection.manage` | ✔ | ✔ | ✔ | ✔ | – | – |
| `regulatory.recall.view` | ✔ | ✔ | ✔ | ✔ | – | ✔ |
| `regulatory.recall.manage` | ✔ | ✔ | ✔ | ✔ | – | – |
| `regulatory.report.view` | ✔ | ✔ | ✔ | ✔ | ✔(fee) | ✔ |
| `regulatory.rule.manage` | ✔ | ✔ | – | – | – | – |

**RLS mapping:** read keys → `select` policies gated by `auth_role()`; `.manage`/`.edit`/`.review`/
`.respond` → `insert/update` policies via `has_role(...)`. `regulatory.query.respond` is a narrower
grant (submit responses) subsumed by `.manage`; both map to writes on `authority_query_responses`.
Credential reveal is enforced inside `reveal_fssai_credential` (role guard), not a table policy — vault
columns hold only the secret id, never plaintext.

---

## 9. API Design

`api/*` = thin typed Supabase wrappers; hooks wrap them in React Query (keys
`['regulatory', entity, ...params]`). Mutations RLS-guarded in DB + `useCan()` in UI. Described, not
coded.

### 9.1 Data-access functions (`modules/regulatory/api/`)

- **Clients/scope:** `listClientProfiles(filters)`, `getClientProfile(clientId)`,
  `upsertClientProfile(input)`, `getClientHealth(clientId)`.
- **Licences:** `listLicences(filters)`, `getLicence(id)`, `createLicenceDraft(input)`,
  `updateLicence(id, patch)` (vault columns excluded from selects),
  `transitionLicence(id, action, payload)` — validates the state transition
  (`apply|grant|renew|modify|surrender|reject|appeal|refile`), writes `licence_events`, sets
  rejection/appeal fields, may emit obligation/fee, seeds a Sales opportunity on renewal.
  authz `regulatory.license.manage`.
- **Queries:** `listQueries(filters)`, `getQuery(id)`, `createQuery(input)`,
  `addQueryRound(id, payload)`, `upsertQueryPoint(queryId, point)`,
  `submitResponse(pointId, payload)` — authz `regulatory.query.manage` (respond → `.respond`).
- **SOI:** `listSois(filters)`, `getSoi(id)`, `saveSoi(id, columns, rows)` — over
  `soi_archive`/`soi_products`; authz `regulatory.soi.edit`.
- **Compliance:** `runComplianceReview(soiId, kind, labResultId?)` → creates `compliance_reviews` +
  `compliance_findings` by evaluating `regulatory_rules`; `disposeFinding(id, disposition, note)`;
  `signOffReview(id)` → verdict + report. authz `regulatory.label.review`.
- **Calendar:** `listObligations(filters)`, `completeObligation(id, payload)`,
  `exportCalendarICal(filters)` — over `compliance_obligations`; authz `regulatory.calendar.manage`.
- **Products/ingredients:** `listProducts`, `upsertProduct`, `listCategories`, `listIngredients`,
  `upsertIngredient` — authz `regulatory.product.manage`.
- **Approvals:** `listApprovals(filters)`, `getApproval(id)`, `createApproval(input)`,
  `transitionApproval(id, action, payload)` — approve/reject/appeal emit fee obligation + notification;
  authz `regulatory.approval.manage`.
- **Lab results:** `listLabResults(filters)`, `getLabResult(id)`, `ingestLabResult(input, items)` —
  header + `lab_result_items`; on save calls review wire-back; `vendor_po_id` from Vendor Portal
  deliverable; authz `regulatory.labresult.manage`.
- **Inspections/recalls:** `listInspections`, `upsertInspection` (authz `regulatory.inspection.manage`);
  `listRecalls(filters)`, `getRecall(id)`, `upsertRecall(...)` (authz `regulatory.recall.manage`).
- **Reports:** `getReport(reportKey, filters, format)` → CSV/PDF/iCal via shared helper.

### 9.2 RPCs (SECURITY DEFINER)

- `reveal_fssai_credential(p_license_id, p_reason)` → text — **existing, unchanged.** Role-gated;
  updates `last_credential_accessed_*`; inserts `credential_access_log` + `audit_log`.
- `store_fssai_credential(...)` — **existing, unchanged.** Vault write.
- `run_ingredient_check(p_soi_id, p_lab_result_id default null)` — evaluates SOI rows / label / claims
  against active `regulatory_rules`; with a lab result, compares **tested** analytes and stamps
  `value_basis='tested'`; returns findings; keeps rule logic server-side.
- `licence_transition(p_license_id, p_action, p_payload jsonb)` — atomic status change + `licence_events`
  insert + obligation seeding; lifecycle invariants in the DB.
- `approval_transition(p_approval_id, p_action, p_payload jsonb)` — analogous for approvals.
- `recompute_client_health(p_client_id)` — recompute `client_regulatory_profiles.health_score`.

### 9.3 Edge Functions (pg_cron-gated)

- `regulatory-daily` — recompute obligation statuses; open renewal windows; raise SLA/expiry
  notifications (honouring `reminder_settings`); run recurring-work→booked-revenue (Sales API);
  refresh client-health scores. Gated by settings flag.
- `foscos-sync` (future, stubbed/disabled) — poll ARN status, reconcile `lifecycle_status`.

---

## 10. Configurability (Administration — nothing hardcoded)

| Configurable item | Where | Notes |
|---|---|---|
| Fee schedule (licence tier × validity × KOB; late-fee ₹100/day; approval/NSF fees) | Administration → Regulatory Fees | drives emitted `govt_fee_paise` |
| Rule library (`regulatory_rules`: additive/schedule/RDA/label/claim/standard-of-identity) | `/regulatory/rules` (super_admin/director) | jsonb, versioned via `is_active` + `effective_from/to` |
| Document templates (SOI domestic/export, query-response, compliance report, CoA, checklists, NSF dossier) | Administration → Templates | `regulatory_templates`; active version per key |
| Holiday calendar (gazetted national + state + weekends) | Core/Admin reference | shared working-day math |
| Reminder cadence & channels (90/60/30/7d expiry, T-3 SLA, obligation due) | `reminder_settings` | gates notifications |
| Feature flags (`foscos-sync`, WhatsApp, recurring-revenue automation) | Administration → Feature Flags | staging sandbox control |
| FSSAI category tree | `/regulatory/rules` | `fssai_categories` |
| Renewal window (default 180d), late-fee grace window | Administration → Regulatory Settings | not hardcoded |

---

## 11. Integration specification

| System | Direction | Boundary / adapter |
|---|---|---|
| **FSSAI FoSCoS** | out (submit) / in (status) | manual-assisted via credential vault today; `foscos-sync` future gated boundary; plaintext never leaves `reveal_fssai_credential` |
| **Supabase Vault** | store/reveal | SECURITY DEFINER RPCs + `credential_access_log` + `audit_log`; unchanged |
| **Finance & Accounts** | out | emit government-fee obligation (bigint paise) → `govt_fees`; Finance records payer/payment/recovery, returns `govt_fee_id`; public API, no direct writes |
| **Sales** | out | recurring work (renewals, D-1/D-2 returns) auto-raises opportunity + draft quotation for consulting fee; `compliance_obligations.sales_opportunity_id` back-link; Sales public API |
| **Vendor Portal (mod 14)** | in | NABL lab-test PO deliverables → structured `lab_results` (by `vendor_po_id`); public API; tested values feed compliance |
| **CRM** | in | reads `clients` (master, contacts); never writes client master |
| **Operations** | in/out | reads `projects`; queries/obligations link by `project_id`; project timing owned by Operations |
| **Document Management** | in/out | certificates, forms, SOI PDFs, responses, lab reports, artwork, compliance reports — versioned; referenced by `document_id` |
| **Knowledge Base** | in | FSSR clauses / labelling notes / SOPs surfaced contextually |
| **Notifications** | out | `notify({channels})` — email (ZeptoMail), in-app, WhatsApp (BSP, gated), SMS |
| **Audit** | out | append-only log on every state change + credential reveal |
| **AI Assistant (mod 12)** | out | SOI/label findings + FSSR context seed regulatory Q&A / response drafting (read-only) |
| **e-sign (future)** | out | signed compliance reports / response letters — stubbed adapter |

Boundary principle: the module reaches email/WhatsApp/FoSCoS/Finance/Sales/Vendor Portal only through
named adapters; the vault RPC is the sole credential path; cross-module linkage is by id (no cross-module FKs).

---

## 12. Reports, Analytics & Workflow Automation

### 12.1 Reports

| Report | Key columns | Filters | Export |
|---|---|---|---|
| Licence register | client, number, tier, category, issue, expiry, status | tier, status, client, expiry range | CSV, PDF |
| Expiry & renewal forecast | licence, expiry, window-open, days-left, renewal status | window (30/60/90/180d), tier | CSV, PDF |
| Authority query log | project, licence, type, round, received, due, submitted, status, points resolved | status, type, SLA breach, date | CSV, PDF |
| SLA compliance | query, due, submitted, on-time?, days variance | period, executive | CSV |
| SOI / compliance review | product, SOI version, verdict, blocker count, value basis, reviewer | verdict, product kind, period | CSV, PDF |
| Compliance calendar | client, licence, obligation, due, status | type, status, month | CSV, PDF, iCal |
| Product-approval register | client, product, type, ARN, status, approval no., validity | type, status, client | CSV, PDF |
| Lab results / OOS | product, report no., lab, date, OOS analytes, linked review | product, OOS-only, period | CSV, PDF |
| Inspection log | client, licence, date, type, officer, outcome, follow-up | outcome, type, period | CSV, PDF |
| Recall / adverse-event log | client, product, trigger, classification, status, closed | classification, status, period | CSV, PDF |
| Credential access audit | licence, user, accessed_at, reason | user, licence, date | CSV (super_admin/director only) |
| Government-fee obligations | licence, action, amount (₹ from paise), emitted, Finance ref | status, period | CSV (shared with Finance) |

### 12.2 Workflow automation

| Job | Trigger | Cadence | Action |
|---|---|---|---|
| Expiry & renewal sweep | pg_cron → `regulatory-daily` | daily 06:30 IST | open renewal windows; set `renewal_due`; expiry notifications; raise Sales opportunity for renewal consulting fee |
| Obligation materializer | pg_cron | daily | ensure D-1 (31 May), D-2 (half-yearly), Form II rows per active licence; flip `upcoming→due→overdue` by working-day math |
| Recurring-work → booked revenue | pg_cron (idempotent per period) | daily | renewals + returns auto-raise Sales opportunity + draft quotation (consulting fee); dedup per (licence/client, obligation, period); stamp `sales_opportunity_id` |
| SLA monitor | pg_cron | daily 07:00 | mark `query_sla_breach`, notify; working-day clocks |
| Licence event log | DB trigger on `licenses` update | event | write `licence_events(before/after)` + `audit_log` |
| Query rollups | DB trigger on `authority_query_points` | event | recompute `points_total/points_resolved`; auto-close query when all points closed |
| SOI review on save | app-invoked `run_ingredient_check` | on demand | regenerate findings; optional auto on `saveSoi` |
| Client-health recompute | `regulatory-daily` | daily | refresh `client_regulatory_profiles.health_score` |
| FoSCoS status reconcile | `foscos-sync` (future/gated) | hourly when enabled | poll ARN, update `lifecycle_status` |

All scheduled work gated by settings flags so staging stays sandboxed.

---

## 13. Non-functional requirements, acceptance criteria, open questions

**Non-functional:** RLS enforced on every table before go-live; append-only logs immutable; credential
plaintext never client-side; all money `bigint` paise; working-day math via shared holiday calendar;
rule/template/fee configuration versioned for point-in-time replay; dashboard widgets ≤ 60s staleTime;
10× licence/query scale supported by composite indexes (`authority_queries(query_status, response_due)`,
`compliance_obligations(status, due_date)`) with materialized-view fallback.

**Acceptance criteria (milestone 1 — must):** create/track a licence through the full lifecycle incl.
reject→appeal→re-file; record a query, break into points, respond, resolve/re-raise with SLA badges;
build/version an SOI and run a checklist-driven label + ingredient review producing a signed verdict
+ report; materialize renewal/D-1 obligations on the calendar with working-day due dates; emit a
government-fee obligation to Finance in paise; product-approval/NSF application through submit→decision;
ingest a NABL lab result and see a tested-value verdict; compliance dashboard renders role-scoped KPIs;
all state changes audited; permissions enforced per §8.

**Open questions (to confirm before implementation):**
1. Exact fee-schedule values per tier/validity/KOB (Administration seed data).
2. Whether Import licence needs its own tier value or remains Central+importer-KOB (current design: the latter).
3. Claims-review rule granularity for milestone 1 (full claim library vs a curated subset).
4. Export-documentation bundle scope for milestone 1 (which certificates are in vs deferred).
5. Client-health scoring formula (weights across expiry/queries/obligations/recalls).

---

*End of Regulatory Affairs design specification. Design-only; awaiting review + approval before any
implementation, migration, SQL, React, or API code.*
