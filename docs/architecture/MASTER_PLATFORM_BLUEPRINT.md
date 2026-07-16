# TPS Platform — Master Platform Blueprint

**The single source of truth for the entire TPS Platform.**
This document explains how TPS works as **one integrated ERP**, not a collection of modules.
Read this first; the per-module designs (`modules/*.md`) are the detail behind it.

> **Status: FROZEN v2.0** (TPS Platform V2 Constitution). Scope: **TPS Xperts Group only** — the
> FSSAI / nutraceutical regulatory consultancy. The **Certification Body is a separate future platform**
> (TPS Xperts Global Certifications Pvt Ltd is a separate legal entity) and is **out of scope here**.
> **16 modules** (Core + 15 features); Expenses & Travel is **not** a standalone module — it folds into
> HRMS (People) and Finance (Money). Its earlier binding amendment layer is
> **`02_ENTERPRISE_ARCHITECTURE_VALIDATION.md`** — where that report and this document differ, the
> report's decisions win *except* on scope, where this v2.0 amendment governs. Other v1.0 amendments
> still folded in below: a Core **`approvals`** entity behind the Approvals inbox; **SMS** as a
> second live channel; money is **bigint paise**; portals are **not** in the staff menu; permission
> helper is **`has_perm`** with data-scope + delegation.

---

## 0. What the TPS Platform is

One web application, one login, one database, that runs a **single business** end-to-end:

- **TPS Xperts Group** — the FSSAI / nutraceutical **regulatory consultancy** (licences, compliance, SOI/label review, authority queries).

It replaces the old Excel + WhatsApp + Google Drive way of working. Every team member, every client, and every vendor works inside the same system, seeing exactly what their role permits. The design goal is **one shared spine of data** (people, clients, projects, documents, money) that every module reads and writes — so nothing is entered twice and everything reconciles.

**One platform, three audiences:**
1. **Internal staff** — the full app (Operations, HR, Finance, Regulatory, etc.).
2. **Clients** — a limited, secure **Customer Portal** (their projects, documents, invoices, approvals).
3. **Vendors/partners** — a limited, secure **Vendor Portal** (labs, printers, consultants, associates).

---

## 1. Complete system navigation

Navigation is **role-driven**: everyone opens the same app, but the left-hand menu and the pages inside it are filtered by the person's role and permissions. The structure is three layers deep:

- **Level 1 — Module** (a top-level area, e.g. "Finance").
- **Level 2 — Page** (a screen inside a module, e.g. "Invoices").
- **Level 3 — Record** (one item, e.g. invoice `INV-2026-0042`, with its own tabs).

Navigation is generated automatically from the **module registry** (each module declares its menu entries + required permission). Adding a module adds its menu items automatically; a user only ever sees entries they're allowed to open. A global **top bar** (search, notifications bell, profile menu) is constant across every page.

Movement between areas is by **deep links that carry context** — e.g. from a Client you jump to their Projects, Invoices, or Documents and back, without losing your place. The URL always reflects where you are (so links can be shared and the back button works).

---

## 2. User journeys for every role

Each internal role has a "home" and a typical daily loop. Everyone lands on a role-appropriate dashboard after login.

| Role | Home | Typical daily journey |
|---|---|---|
| **Super Admin** | Admin cockpit | Manage users/permissions, integrations, settings, watch audit log & system health. |
| **Director** | Director cockpit | Review KPIs (revenue, pipeline, delivery, receivables), approve escalations (blocks, cancellations, big quotations), scan overdue work. |
| **Manager** | Operations board | Assign & monitor projects/stages, approve block/unblock & leave, review team workload, clear approvals inbox. |
| **Executive** (field/office) | My Dashboard | Work assigned projects → advance stages, collect docs, log authority queries, update clients, punch attendance. |
| **Accounts** | Finance dashboard | Raise invoices, record payments, reconcile Razorpay, chase receivables, track government fees, run collections. |
| **HR** | HR dashboard | Attendance & regularizations, leave approvals, onboarding, payroll run, employee documents. |
| **Client** *(external)* | Portal home | Track their FSSAI licence/compliance progress, upload requested docs, approve drafts/labels, view & pay invoices, raise queries. |
| **Vendor** *(external)* | Portal home | See their assignments/POs (lab tests, sub-audits), submit deliverables, raise vendor invoices. |

**The universal loop for every internal role:** *log in → see what needs my attention today (dashboard + notifications + approvals inbox) → act on records → the system notifies the next person and updates every dependent module automatically.*

---

## 3. Module interaction map (how the parts feed each other)

The platform is a **flow**, not silos. Work and money move left-to-right; insight flows back:

**Marketing → CRM → Sales → Operations → Finance**, with **Regulatory** as the sole delivery engine, **HR** supplying the people, **Documents/Knowledge/AI** supporting everyone, the **two Portals** exposing slices externally, **Administration** governing access, and **Reports** reading everything.

- **Marketing** generates leads → hands them to **CRM**.
- **CRM** qualifies a lead into a client → hands an opportunity to **Sales**.
- **Sales** wins a deal, produces a quotation/order → **creates an Operations project** and **a Finance invoice** in one step.
- **Operations** delivers the work (stages, clock, tasks); payment progress rolls up to **Finance**.
- **Regulatory** runs the actual FSSAI work (licences, queries, SOI); its government fees post to **Finance**.
- **HR** supplies staff, attendance and leave; its payroll register posts to **Finance**.
- **Documents** stores every file for every module; **Knowledge Base** stores know-how; **AI Assistant** answers questions and drafts using both.
- **Customer Portal** shows a client their own projects/invoices/documents; **Vendor Portal** shows a vendor their own assignments/bills.
- **Administration** defines who can do what; **Reports & Analytics** turns all of the above into KPIs.

---

## 4. Shared business entities (the common "nouns")

These entities are **owned by one module but used by many**. They are the spine that keeps the platform integrated — one record, many viewers.

| Entity | Owner module | Also used by |
|---|---|---|
| **Person / Staff profile** | Administration / HR | Everything (assignment, permissions, audit) |
| **Client / Organization** | CRM (absorbs existing `clients`) | Sales, Operations, Finance, Regulatory, Portal |
| **Contact** (person at a client) | CRM | Sales, Portal, Marketing |
| **Vendor** | Vendor Portal | Finance (AP), Regulatory (labs) |
| **Deal / Order** | Sales | Operations (→project), Finance (→invoice) |
| **Project** | Operations | Finance, Regulatory, Documents, Portal, Reports |
| **Licence** | Regulatory | Operations, Portal, Reports |
| **Document** | Document Management | Every module (files attach to any record) |
| **Invoice / Payment** | Finance | Sales, Operations, Portal, Reports |
| **Notification** | Core / Notifications | Every module (events fan out to people) |
| **Audit-log entry** | Administration | Every module (who did what, when) |

**Rule:** a shared entity has exactly one owning table (source of truth). Other modules **read** it through safe, permission-checked functions/views — they never keep a second copy. This is what makes the ERP "one system."

---

## 5. Cross-module workflows (the end-to-end flows)

These are the real chains that span multiple modules. Each step automatically triggers the next module.

1. **Sell-to-deliver (the revenue spine):**
   Lead (Marketing/CRM) → qualify (CRM) → quotation & win (Sales) → **auto-create Project (Operations) + Proforma/Invoice (Finance)** → deliver stages (Operations/Regulatory) → collect payment (Finance/Razorpay) → close. Client watches the whole thing in the **Customer Portal**.

2. **FSSAI licence lifecycle (Regulatory):**
   Licence granted → expiry clock starts → **automatic renewal reminder** 180/90/30 days out → creates a renewal Task (Operations) + a draft Invoice (Finance) → executive files renewal → licence updated → client notified.

3. **Attendance-to-payroll (HR → Finance):**
   Daily geofenced punches (HR) → monthly payroll run computes salary/PF/ESI/PT/TDS → **approved payroll register posts to Finance** for disbursement and GL. HR produces; Finance pays.

4. **Document request loop (Documents + Portal):**
   Executive requests documents from a client → client uploads in the **Customer Portal** → files land in Document Management, linked to the project → executive is notified → work continues.

5. **Ask-and-draft (AI Assistant):**
   Staff asks "which licences expire this month?" or "draft a renewal email" → AI answers using the **Knowledge Base + Regulatory data**, runs read-only tools **under the user's own permissions**, and drafts the document — a human reviews and sends.

---

## 6. Common services used by every module (the Core Platform)

Every module is built on the same shared services, so behaviour is consistent everywhere and we never rebuild the basics:

| Service | What it does for every module |
|---|---|
| **Auth** | One login (staff by email/employee-code; clients & vendors via separate external identities), sessions, idle-logout. |
| **Access / Permissions** | One permission model. Every action needs a permission key (e.g. `finance.invoice.create`); the database enforces it (RLS), the screen reflects it. |
| **Notifications** | One notification system. Modules never email/WhatsApp directly — they call one service that decides in-app + email + WhatsApp based on settings (so staging stays silent, production respects preferences). |
| **Files / Documents** | One file layer over Supabase Storage + Google Drive; any record in any module can hold documents the same way. |
| **Audit** | One audit trail; every state change records who/what/when/before/after. |
| **Numbering** | One code-generation service (project codes, invoice series, licence/renewal references) — consistent, gap-controlled. |
| **Search** | One search across records + Knowledge Base (later, semantic search for AI). |
| **Settings & Integrations** | One place for Razorpay, ZeptoMail, WhatsApp, Google, Anthropic keys (in the secure vault) and feature toggles. |
| **UI / Design system** | One set of components and the "Arctic Precision" look, so every module feels the same. |

---

## 7. Master menu structure

The left menu is grouped so people find things by **what they're doing**, not by internal module names. Each group expands to its pages; items appear only if the user has permission.

```
HOME
  • My Dashboard            (role-specific)
  • Notifications
  • Approvals inbox

WORK  (delivery)
  • Operations board
  • Projects
  • Regulatory (Licences · Authority queries · SOI / Label)
  • Tasks

RELATIONSHIPS
  • Clients (CRM)
  • Leads & Pipeline (Sales)
  • Quotations & Orders
  • Referral partners
  • Vendors

MONEY  (Finance)
  • Invoices
  • Payments & receipts
  • Government fees
  • Receivables

PEOPLE  (HR)
  • Employees
  • Attendance
  • Leave
  • Payroll                                                     [HR/Director]

CONTENT & LEARNING
  • Documents
  • Knowledge Base
  • Training (LMS)
  • AI Assistant

GROWTH
  • Marketing (Campaigns · Content · Segments)

INSIGHT
  • Reports & Analytics

ADMINISTRATION                                                  [Admin/Director]
  • Users & Roles · Permissions · Settings · Integrations · Audit log
  • Portal users (Client & Vendor access is managed here — not a staff destination)
```

> **v1.0 amendment:** the **Customer Portal** and **Vendor Portal** are *separate external apps* with
> their own logins — they are **not** items in the internal staff menu. Staff manage portal users from
> Administration / CRM / the Vendor registry. Also: **AI Assistant** and **global search** are top-bar
> affordances (available everywhere), not a menu group.

---

## 8. Dashboard strategy for every role

Every role gets **one dashboard tuned to their day** — a mix of "what needs me now", key numbers, and quick actions. Dashboards read across modules but show only what the role may see.

| Role | Headline widgets |
|---|---|
| **Director** | Revenue MTD/YTD, pipeline value & conversion, active vs overdue projects, receivables ageing, licence renewal pipeline, top risks/escalations. |
| **Manager** | Team workload, projects by stage/clock, overdue & blocked, approvals pending, leave requests. |
| **Executive** | My active projects, due-this-week, my authority queries, my attendance, my tasks & notifications. |
| **Accounts** | Outstanding by client, this-week collections, unreconciled Razorpay, government-fee recoverables, invoices to raise. |
| **HR** | Present/absent today, pending regularizations & leave, payroll status, onboarding in progress, training due. |
| **Client (portal)** | My services in progress, documents requested from me, invoices due, approvals waiting, licence expiry. |
| **Vendor (portal)** | My open POs/assignments, deliverables due, my invoices & their status. |

Principle: a dashboard **surfaces action, then information**. Numbers are clickable and drill into the underlying records.

---

## 9. Notification strategy

One event → the right people → the right channels, decided centrally.

- **Channels:** in-app (always), email (ZeptoMail), WhatsApp (BSP) — chosen per notification type and per user preference. External clients/vendors get email/WhatsApp + portal.
- **Triggers:** two kinds — **event-driven** (something happened: task assigned, block requested, invoice raised, NC opened, document requested) and **scheduled** (time-based: licence expiring, payment overdue, audit due, training due, renewal window open).
- **Central control:** every module calls one notification service; delivery is gated by settings so **staging never sends real messages** and production honours user preferences, quiet hours, and consent/DND for external contacts.
- **Digest vs instant:** urgent items go instantly; routine items batch into a daily digest (e.g. the 9:00 IST reminders already in the system).
- **Audit:** every send is logged (who, what, channel, status) for traceability.

---

## 10. Document ownership strategy

Documents are a **first-class, shared layer** — one way to store and control files across the whole platform.

- **One document model, attached to any record.** A file always belongs to an owning entity (a client, project, employee, invoice, audit, licence). You upload/view documents the same way everywhere via one shared component.
- **Two storage backends, one interface:** Supabase Storage (fast, app-native) and Google Drive (familiar, shareable) — the app routes to the right one; users don't think about it.
- **Ownership & access follow the record.** Who can see a document is decided by who can see its parent record (a client's documents are visible to their handling team + that client in the portal; HR documents only to HR + the employee). The database enforces this.
- **Versioning & templates.** Files keep version history; standard outputs (FSSAI forms, compliance/SOI reports, licence documents, offer letters) are generated from templates and stored automatically.
- **Retention & audit.** Sensitive documents (biometric, credentials, client-confidential) are access-logged and never copied to non-production environments.
- **E-sign & approval** happen on the document itself and feed back into the originating workflow.

---

## 11. AI integration strategy

AI is a **platform-wide assistant**, not a bolt-on — but it is strictly bounded.

- **What it does:** answers regulatory questions (grounded in the Knowledge Base + Regulatory rules, with sources cited), drafts documents (labels, SOI notes, audit-report drafts, emails), and performs *read* actions across modules on request ("list projects due this week", "summarise this client").
- **How it stays safe:** the AI runs its tools **under the asking user's own permissions** — it can never see or change anything the user couldn't. It never bypasses the database's security. Writes are always proposed for a human to approve, never done silently.
- **Grounding (no made-up law):** answers are retrieved from real internal content (Knowledge Base articles, regulatory data) rather than invented; when it isn't sure, it says so and cites nothing rather than guessing.
- **Where it appears:** an assistant panel available across the app, plus targeted "assist" buttons (e.g. label check, draft reply) inside modules.
- **Cost & control:** usage is logged; the AI key lives in the secure vault; the feature can be toggled per role. (Uses Claude models via the Anthropic API — server-side.)

---

## 12. Security boundaries

Security is enforced **in the database**, so it cannot be bypassed by the app or the network.

- **Three trust zones:**
  1. **Internal staff** — role-based access; each role sees only its permitted modules/records.
  2. **Clients (Customer Portal)** — a **separate external identity** locked to exactly one client; can only ever see that client's own data. Provably isolated from staff access.
  3. **Vendors (Vendor Portal)** — same pattern, locked to one vendor.
- **Every table has row-level security.** A user's role and identity decide which rows they can read/write — enforced by Postgres, not the frontend.
- **Secrets in a vault.** API keys and credentials (Razorpay, ZeptoMail, WhatsApp, Google, Anthropic, FoSCoS logins) are stored encrypted; access is logged.
- **Sensitive data never leaves production** — attendance photos, biometric/face data, client-confidential and employee-confidential documents are never copied to staging.
- **Full audit trail** for every state change and every credential access.
- **Single legal entity:** this platform serves **TPS Xperts Group** (the consultancy) only. The certification body is a separate legal entity on a separate future platform — its data does not live here.

---

## 13. Future expansion strategy

The platform is built to grow without rework:

- **Add a module by writing it + one registry line** — navigation, routing, and permissions wire up automatically. No changes to the app shell.
- **Expand-contract database changes only** — new fields/tables are added alongside old ones; readers migrate; old ones retire. Production data is never broken.
- **Multi-branch ready** — the model cleanly scopes data by team and office; new offices or a new consultancy service line slot in.
- **External surfaces scale independently** — Customer and Vendor portals can add features without touching internal modules.
- **AI and search grow with content** — as the Knowledge Base grows, the assistant gets smarter (semantic search) without redesign.
- **Integrations are adapters** — new external systems (FoSCoS portal, e-sign, more payment gateways, accounting export) plug in behind a stable interface.
- **Reporting is a read-only layer** — new reports never risk operational data.

---

## 14. Module dependency matrix

"Depends on" = needs the other module's data or handoff to function. Read a row as "this module relies on →".

| Module ↓ relies on → | Core | Admin | CRM | Sales | Ops | Finance | Docs | HR | Reg | KB | AI |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Administration** | ✔ | — | | | | | | | | | |
| **Document Mgmt** | ✔ | ✔ | | | | | — | | | | |
| **Knowledge Base** | ✔ | ✔ | | | | | ✔ | | | — | |
| **CRM** | ✔ | ✔ | — | | | | ✔ | | | | |
| **Sales** | ✔ | ✔ | ✔ | — | | | ✔ | | | | |
| **Operations** | ✔ | ✔ | ✔ | ✔ | — | | ✔ | | | | |
| **Finance** | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ | ✔ | | |
| **HR (HRMS)** | ✔ | ✔ | | | | ✔ | ✔ | — | | | |
| **Regulatory** | ✔ | ✔ | ✔ | | ✔ | ✔ | ✔ | | — | | |
| **Marketing** | ✔ | ✔ | ✔ | ✔ | | | ✔ | | | | |
| **LMS (Training)** | ✔ | ✔ | | | | ✔ | ✔ | ✔ | | | |
| **AI Assistant** | ✔ | ✔ | ✔ | | ✔ | ✔ | ✔ | | ✔ | ✔ | — |
| **Customer Portal** | ✔ | ✔ | ✔ | | ✔ | ✔ | ✔ | | ✔ | | |
| **Vendor Portal** | ✔ | ✔ | | | | ✔ | ✔ | | ✔ | | |
| **Reports & Analytics** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | | ✔ | ✔ | | |

**Takeaways:** everything depends on **Core** and **Administration** → build them first. **Finance, Reports, and both Portals** depend on the most → build them later. **Knowledge Base + Documents** are needed early because so many modules attach files and content to them.

---

## 15. Enterprise roadmap

Build in waves; each wave ships to **staging first**, is tested, then promoted to production. (Foundation is already done.)

| Wave | Modules | Outcome |
|---|---|---|
| **0 — done** | Core Platform, Operations (as a registry module) | Foundation + working proof; existing app modernised. |
| **1 — Governance & content** | Administration · Document Management · Knowledge Base | One permission/settings backbone, one document layer, one knowledge store. Unlocks everything else. |
| **2 — Revenue spine** | CRM · Sales · Finance & Accounts | Lead → deal → order → invoice → payment, wired into existing Operations. Expense/travel **reimbursement & GL** ride on Finance (see Wave 3). |
| **3 — Regulated delivery & people** | Regulatory · HRMS | FSSAI lifecycle formalised; attendance→leave→payroll. **Expenses & Travel (T&E)** is a sub-domain here — employee **expense claims + travel** live under HRMS (People), with **reimbursement/GL posting** handled by Finance (Money); it is **not** a standalone module. |
| **4 — Growth & enablement** | Marketing · LMS · AI Assistant | Demand generation, training/competence, AI assistance. |
| **5 — External surfaces** | Customer Portal · Vendor Portal | Clients and vendors self-serve, fully isolated. |
| **6 — Insight** | Reports & Analytics | Cross-module KPIs and scheduled reports over stable data. |

**Change-control at every wave:** each wave's database changes are applied to **staging only**, build-verified, and reviewed. Anything that is a breaking DB change, needs a new database extension (e.g. AI/search), needs an external account or key, or has a billing impact is **surfaced for your explicit approval before it runs**. Production stays on its current live site until a wave is tested and you approve promotion.

---

## Governance note

- This blueprint is the **source of truth**; the module docs (`modules/*.md`) and the master architecture (`00_ENTERPRISE_ARCHITECTURE.md`) are the detail beneath it. If they ever disagree, this document's intent wins and the others are corrected.
- **Next step:** implement **Wave 1 — Administration, Document Management, Knowledge Base** on the `staging` branch.

---

## Scope amendment (v2.0)

Per the **TPS Platform V2 Constitution**, this blueprint moved from v1.0 to **v2.0**:

- **Certification Body removed from scope.** TPS Xperts Global Certifications Pvt Ltd is a **separate legal entity** on a **separate future platform**. All Certification / NABCB / ISO 17021 / certificate / audit-cycle / auditor-as-CB / impartiality-firewall content has been removed throughout — from the "what the platform is" statement (§0), user journeys (§2), the module interaction map (§3), shared entities (§4), cross-module workflows (§5, certification cycle dropped and the rest renumbered), the master menu (§7), dashboards (§8), security boundaries (§12), the module dependency matrix (§14, Certification row and Cert column removed), and the roadmap (§15, "Wave 4 — Certification body" removed and later waves renumbered).
- **Single business/entity.** The platform now serves **one** business — **TPS Xperts Group**, the FSSAI / nutraceutical regulatory consultancy — with **Regulatory** as the sole delivery engine. The three audiences (internal staff, clients, vendors) are unchanged.
- **Expenses & Travel (T&E) folded in.** T&E is **not** a standalone module. Employee **expense claims + travel** are a sub-domain of **HRMS (People)**; **reimbursement/GL** is handled by **Finance (Money)**.
- **Module count.** Scope is now **16 modules** (Core + 15 features), down from the v1.0 count of 17 (which had included Expenses & Travel and Management System / QMS).
