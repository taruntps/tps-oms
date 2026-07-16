# TPS Platform — Enterprise Architecture Validation Report

> ## ⚠️ Scope amendment (v2.0) — read first
> After this validation, the **TPS Platform V2 Constitution removed the Certification Body from scope**
> (separate legal entity / separate future platform). The **"Management System / QMS"** module added in
> §4 is therefore **OUT of scope**; the **"Expenses & Travel"** module is **folded into HRMS + Finance**
> (not a standalone module). **Certification-related findings and the Wave-4 (Certification) row are
> superseded.** Final scope = **Core + 15 feature modules**. Scores and all other findings below stand
> as recorded; treat certification/QMS items as historical context only. Reserved Certification/QMS
> docs live in `_reserved-certification-platform/`.

**Reviewers:** 4 independent CTO/Enterprise-Architect passes (business completeness · technical/architecture · integrations-automation-AI · permissions-UX), each reading the Master Blueprint, Master Architecture, Portfolio, and all 15 module designs.
**Method:** adversarial — each pass was tasked to *find gaps*, not to approve.
**Outcome:** the architecture is sound; real gaps were found and are being remediated in the design docs (no code). Blueprint is **frozen v1.0 after remediation** (see §7).

---

## 1. Scores

| Dimension | As-reviewed | After remediation (target) | Basis |
|---|---|---|---|
| **Overall architecture** | **80 / 100** | **90 / 100** | Modular monolith, RLS-in-DB, registry, expand-contract, impartiality firewall are genuinely strong; gaps are additive, not structural. |
| **Business completeness** | **78 / 100** | **90 / 100** | Revenue spine + regulated delivery + CB + governance strong; missing the "second ring": profitability, T&E/cash-out, CB's own QMS, contracts. |
| **Technical completeness** | **82 / 100** | **91 / 100** | Template-consistent, real RLS/expand-contract thinking; lost points on unified-concern gaps (numbering, legal-entity, embeddings, approvals) and a money-unit contradiction. |
| **Future scalability** | **68 / 100** | **80 / 100** | Single Postgres doing OLTP + analytics + vector + cron with no replica; heavy RLS/permission fan-out across ~180 tables. Mitigations designed but not yet load-bearing. |

**Verdict:** No fundamental redesign required. The platform's spine (one shared data model, RLS security, module registry, expand-contract) is correct. The findings are (a) a handful of **must-fix corrections**, (b) **cross-cutting unifications** to prevent divergence, (c) **two genuinely missing modules**, and (d) a large set of **additive enhancements** best folded into each module's build wave.

---

## 2. Must-fix corrections (applied now)

These are errors or contradictions that must not survive into code:

| # | Finding | Resolution | Doc |
|---|---|---|---|
| M1 | **Money-unit contradiction** — Finance said rupees `numeric`, Portal said paise `bigint`; both claimed to match the live `payments` table. **Verified against the live DB: it is `bigint` (paise)**; the app ÷100 to display. Finance was wrong → a latent 100× bug. | Finance corrected to **bigint paise** platform-wide; "Money unit" convention added. | finance.md ✎ |
| M2 | **Permission helper name mismatch** — Administration defines `has_perm(key)`; CRM/Finance/Knowledge RLS text called `has_permission(uid,key)`. If both ship, half the RLS references a non-existent function. | Canonical: **`has_perm(key[, scope])`**; `has_permission` retired everywhere. | architecture ✎, administration.md ✎ |
| M3 | **Three numbering owners + two legal-entity masters** — Admin `organizations` vs Finance `legal_entities`; Core "Numbering" service vs Finance/Sales/project/cert generators. Guarantees gap/duplicate invoice & code numbers. | **One `organizations` master** (Admin/Core, FK'd everywhere); **one Core numbering service** (per-series advisory locks). | architecture ✎, administration.md ✎, finance.md ✎ |
| M4 | **Duplicate embedding pipelines** — KB builds `kb_article_embeddings`; AI re-embeds the same KB content into `ai_embeddings`. Two vector stores, two copies. | KB **owns** all article embeddings; AI retrieves via KB's `kb_semantic_search`; `ai_embeddings` holds only non-KB corpus. | ai-assistant.md ✎ |
| M5 | **No backing model for the "Approvals inbox"** (flagged by 3 of 4 reviewers) — every module rolls its own approval store; nothing aggregates them. | Add a **Core `approvals` entity** (polymorphic ref + assignee + decision + SLA) that all modules write; one inbox reads it; bulk-approve + filters. | blueprint ✎, architecture ✎ |

---

## 3. Cross-cutting architectural decisions (applied to platform docs)

| # | Decision | Rationale |
|---|---|---|
| X1 | **Role model decoupled from the enum.** Add `roles(role_key)` + `user_roles(user_id, role_key)` many-to-many; `has_role()` reads grants. The 7-value `user_role` enum is kept for expand-contract compat only. | Module docs already reference functional roles (cert sub-roles, marketing/L&D/procurement) with no home; adding a role must not require an enum migration. |
| X2 | **Data-scope in the permission registry.** Add a `scope ∈ {own, team, all}` dimension to `role_permissions`, consumed by `has_perm(key, scope)`, shown in the admin matrix. | Scope is pervasive in RLS but invisible/unassignable in the matrix today. |
| X3 | **Time-boxed delegation.** `delegations(from,to,scope,valid_from,valid_to)` resolved in `has_perm`. | Approvals stall when an SMB HOD/director travels. |
| X4 | **Export is a permission** (`*.export` / core `data.export`), gating PII/salary/audit-trail/credential exports; every export logged. | The biggest exfiltration surface was ungated while GSTR-1 was gated. |
| X5 | **Scoped automation identity.** Cron/Edge jobs get a least-privilege identity, not the all-powerful `service_role`. | RLS bypass by every scheduled job is too large a blast radius. |
| X6 | **One external-identity Core service.** Customer & Vendor portals share a parameterized tenant-key identity (`client_id`/`vendor_id`); only domain tables differ. | The two portals reimplement 90% of the same isolation pattern. |
| X7 | **One governed read-model convention** — prefer `security_invoker` views + thin RPCs only for aggregation; reuse for Client-360, Reports, and Portal reads. | Four overlapping read layers with two RLS strategies today. |
| X8 | **Schema strategy = single `public` schema + table prefixes** (no per-module Postgres schemas). Fix CRM's `crm` schema. | Mixing real schemas invites cross-schema RLS/GRANT/search_path privilege-escalation footguns in `SECURITY DEFINER` functions. |
| X9 | **`notification_type` → lookup table** (not a platform-wide enum every module ALTERs). | Enum expansion isn't transactional/reorderable; ordinals become load-bearing. |
| X10 | **SMS as a second live external channel** (MSG91/Gupshup/Twilio) in `core/notifications`. | Email is currently the *only* working channel (WhatsApp gated) — dunning, OTP, expiry alerts have no reliable path. |
| X11 | **Mobile-first + offline commitment** for field executives (attendance punch, document capture) and a mobile nav model. | The blueprint says field staff run their whole day on phones, yet every screen is a desktop grid; a dropped punch/upload on patchy networks is lost work. |
| X12 | **Portals removed from the internal staff menu**; portal-user management lives under Administration/CRM/Vendor registry. | Staff never log into the portals; showing them in staff nav is misleading. |
| X13 | **Scalability guardrails made platform rules:** wrap RLS permission helpers in `(select …)` InitPlan form; document a read-replica/branch target for analytics + AI retrieval; stagger `pg_cron`; per-job statement timeouts; partition `audit_log` by month with retention. | Single instance does OLTP + analytics + vector + ~15 cron jobs. |

---

## 4. Missing capability (design additions)

### New modules (full designs added)
> **Scope v2.0:** the two entries below are amended — **Expenses & Travel is folded into HRMS + Finance**
> (not a standalone module), and **Management System / QMS is out of scope** (Certification Body is a
> separate future platform).

| Module | Why (validated gap) | Scope v2.0 status |
|---|---|---|
| **Expenses & Travel (T&E)** | Field visits + auditor travel are billable pass-through; HRMS excludes reimbursements, Finance books only vendor bills → no employee expense→approve→reimburse→bill-to-client chain. | **Folded into HRMS + Finance** as a sub-domain (claim/travel in HRMS; payout/bill-to-client in Finance). Not standalone. |
| ~~**Management System (Internal QMS)**~~ | ISO/IEC 17021-1 requires the CB to run its own management system (management review, internal audits, CAPA, impartiality/risk, NABCB self-assessment). | **REMOVED / out of scope** — belongs to the separate future Certification platform. |

### Extensions to existing modules (registered; applied at each module's wave)
| Area | Addition | Target |
|---|---|---|
| Engagement profitability | Timesheet + cost roll-up (fee vs staff-time + govt-fee + vendor/lab + billable expense) | operations.md, reports-analytics.md |
| Contract & renewal lifecycle | Contracts/agreements as managed objects; recurring retainer/AMC/renewal engine | sales.md, documents.md |
| Product approval | Nutraceutical/novel-food/ingredient-NOC workflow | regulatory.md |
| DPDP Act 2023 consent | Consent register + data-subject-request workflow (heavy PII + biometric) | administration.md |
| Refund chain | Cancellation → credit-note → refund-disbursement (human-executed) | finance.md, customer-portal.md |
| FSSAI inspection / lab-result / recall | Inspection visits, structured lab-result ingestion, recall/adverse-event | regulatory.md (+ vendor-portal lab link) |
| Licence rejection/appeal | Formal rejection → appeal → re-file branch | regulatory.md |
| Employee-exit reassignment | Leaver's open projects/queries/assignments handoff | hrms.md ↔ operations.md |
| Accounting period lock, Bank account | Period open/closed lock; `bank_accounts` for receipts/refunds/recon | finance.md |
| Cash-flow + profitability + per-entity reports; AP/cash-out dashboard | Director/Accounts blind spots today (receivables-only) | finance.md, reports-analytics.md |
| Intra-vendor roles; break-glass; reopen verbs | Portal owner/member/viewer for vendors; emergency access; reopen closed records | vendor-portal.md, administration.md |

### Missing integrations (registered)
| Integration | Priority | Target |
|---|---|---|
| **GST e-invoicing (IRP → IRN + signed QR) + e-way** | MAJOR (legal ≥ ₹5 cr AATO) | finance.md ✎ |
| **SMS gateway / OTP fallback** | MAJOR | administration.md ✎, portals |
| **NABL lab test-result ingestion** | MAJOR | regulatory.md, vendor-portal.md |
| **Calendar sync (Google/Outlook)** for audits/visits/follow-ups | MAJOR | certification.md, crm.md |
| **Inbound WhatsApp** → CRM lead / Documents / ticket | MAJOR | crm.md, core/notifications |
| DigiLocker KYC pull; Government holiday calendar; Tally-XML/Zoho Books | minor | documents.md, regulatory.md, finance.md ✎ |

### Missing automation (registered)
| Automation | Priority | Target |
|---|---|---|
| **Recurring compliance calendar → booked Sales quotation** (licence renewals + Form D-1/D-2 annual returns) | MAJOR — highest ROI automation | regulatory.md + sales.md |
| **Auditor availability / double-booking + utilisation guard** | MAJOR | certification.md |
| Attendance anomaly detection; multi-channel dunning ladder; document-request nudge sweep | minor | hrms.md, finance.md, customer-portal.md |

### Missing AI (registered)
| AI feature | Priority | Target |
|---|---|---|
| **Structured document data-extraction** (KYC/licence/label-image/lab-report → fields) | MAJOR — highest-ROI AI; eliminates onboarding re-keying, feeds label/SOI check | documents.md + ai-assistant.md |
| **Regulatory-update ingest → summarize → draft KB article + client alert** | MAJOR | knowledge.md + ai-assistant.md |
| NC root-cause/CAPA-adequacy assist; quotation-draft/scope-recommend; lead scoring | minor | certification.md, sales.md, crm.md |

---

## 5. Risks remaining (post-remediation)

| # | Risk | Severity | Mitigation / owner |
|---|---|---|---|
| R1 | **Expand-contract migrations run against a prod schema the repo migrations don't reproduce** (documented drift on `payments`/`clients`/`documents`/`knowledge_base`/`attendance`). A "safe additive" migration could corrupt live data. | **HIGH** | **Reconcile the true prod baseline into fresh migrations BEFORE any wave-2+ contract step** (already logged in project memory). Every wave runs on staging first. |
| R2 | **Single Postgres for OLTP + analytics + vector + cron, no read replica.** | Medium | Read-replica/branch target for analytics+AI; stagger cron; InitPlan RLS; load-test with representative rows before waves 5/7. |
| R3 | **~180 tables** across the platform; wave-1 alone is 32 tables before a single invoice. | Medium | Wave-1 minimal-table cut (§6); defer builder/analytics/embedding tables to their consuming wave; phase the ledger and report-builder. |
| R4 | **Email is the only live external channel** at launch (WhatsApp gated). | Medium | Ship SMS (X10) in Wave 1 governance so dunning/OTP/reminders work. |
| R5 | **Polymorphic `entity_type/entity_id`** in Documents (no FK integrity; per-entity RLS `CASE`). | Low-Med | Checked-trigger integrity + documented RLS dispatch cost; revisit if Documents becomes hot. |
| R6 | External account / billing dependencies (Anthropic key, IRP/GSP, SMS, WhatsApp BSP number) arrive in later waves. | Low | Each surfaced for explicit approval at its wave (per stop-conditions). |

---

## 6. Recommended implementation order (updated)

Unchanged in spirit; refined for the findings. **Each wave ships to staging first, migration-verified, then promoted after your approval.**

- **Wave 1 — Governance & content (minimal cut):** Administration (roles/permissions **with data-scope + delegation + export**, settings, **SMS** channel, audit) · Document Management (core doc model; defer e-sign/OCR-AI) · Knowledge Base (articles/categories; defer semantic/embeddings to the AI wave) · **Core additions: unified `approvals` entity, one numbering service, one `organizations` master, one external-identity service.**
- **Wave 2 — Revenue spine:** CRM (+ inbound WhatsApp) → Sales (+ contracts/renewal engine) → Finance (**bigint paise**, invoices+payments+allocations, **GST IRP e-invoice**, bank account, period lock, refund chain; defer full ledger).
- **Wave 3 — Regulated delivery & people:** Regulatory (+ product-approval, lab-result ingestion, appeals, renewal→quotation automation) · HRMS (+ anomaly flags, exit-reassignment, **T&E claim/travel-request sub-domain**; approval→payout→bill-to-client lands in Finance).
- **~~Wave 4 — Certification body~~ (REMOVED, Scope v2.0):** Certification and Management System / QMS are out of scope — the Certification Body is a separate future platform. Following waves are renumbered accordingly.
- **Wave 4 — Growth & enablement:** Marketing · LMS · AI Assistant (RAG on KB's embeddings, **structured OCR extraction**, regulatory-update summarize) — needs `pgvector`+`pg_trgm` (DB change) + Anthropic key (approvals).
- **Wave 5 — External surfaces:** Customer Portal · Vendor Portal (shared external-identity service; SMS OTP; upload-request nudges; intra-vendor roles).
- **Wave 6 — Insight:** Reports & Analytics (fixed report pack + profitability + cash-flow + per-entity first; defer self-service builder).

**Precondition before Wave 2 contract steps:** complete R1 (reconcile prod baseline).

---

## 7. Freeze decision

The architecture passed validation. All **must-fix corrections (§2)** and **cross-cutting decisions (§3)** are applied to the platform/design docs; the **two missing modules (§4)** are added; every remaining enhancement is **registered against its module and build wave**. No finding requires a fundamental redesign.

➡️ **The Master Platform Blueprint is declared FROZEN at v1.0**, with this validation report as its binding amendment layer. Registered per-module enhancements are folded into each module's implementation wave (design detail, not architectural change).

**Implementation begins with Wave 1 — Administration, Document Management, Knowledge Base — on the `staging` branch, after your go-ahead.**

---

### Appendix — reviewer gut-scores (raw)
Business completeness 78 · Technical completeness 82 · Scalability 68 · Permission model "sound but not enterprise-ready until data-scope + role-model + delegation/export/automation-identity closed" (now closed in §3) · Biggest UX risk: no mobile/offline for field staff (X11) · Biggest technical risk: R1 (prod-schema drift) · Highest-ROI automation: recurring-compliance → booked quotation · Highest-ROI AI: structured document extraction.
