# TPS OMS — Navigation Reference (PR1)

The sidebar is **registry-driven**: it renders `getNavFor(role)` (module `nav.ts` entries + `core/coreNav.ts`), organised into collapsible groups by `core/navGroups.ts`. To add/move an item, edit the owning module's `nav.ts` (set `group`/`order`) or `coreNav.ts` — never hard-code the sidebar.

## Groups & items (enterprise IA)

| Group | Item | Route | Owner |
|---|---|---|---|
| **Dashboard** | Dashboard (role-adaptive; Director KPIs merged) | `/dashboard` | coreNav |
| **Business** | CRM | `/crm/leads` | crm |
| | Clients | `/clients` | coreNav |
| | Referrals | `/crm/referrals` | crm |
| | Projects | `/projects` | operations |
| | Tasks | `/tasks` | coreNav |
| | Operations | `/operations` | operations |
| **Finance** | Sales | `/sales/deals` | sales |
| | Billing | `/finance/invoices` | finance |
| | Finance | `/finance` | finance |
| | Collections | `/finance/payments` | finance |
| | Services · Govt Fees | `/sales/services` · `/finance/govt-fees` | sales · finance |
| **HRMS** *(collapsed by default)* | Employees, Attendance, Leave, Payroll, Recruitment, Performance, Training, Assets, ESS, HR Dashboard (+ area sub-pages) | `/hrms/*` | hrms |
| **Documents** | Documents · Templates | `/documents*` | documents |
| | Knowledge Base · Browse · Categories | `/knowledge*` | knowledge |
| **Reports** | Reports | `/reports/performance` | coreNav |
| **Administration** | Settings, Users, Roles & Permissions, Audit Logs, Privacy | `/settings`, `/admin/*` | administration |

## Rules
- **Grouping:** `core/navGroups.ts` `GROUP_ORDER` + path-prefix map; an entry may override via `NavEntry.group`. Order within a group via `NavEntry.order`.
- **Visibility:** `roles` gate (registry) then `permission` gate (sidebar, via `my_permissions()`); fail-closed while permissions load. super_admin is floored server-side.
- **De-listed legacy duplicates (routes retained, hidden from nav):** `/attendance`, `/employees`, `/referrals`, `/director`. Module versions are canonical.
- **Gaps (Constitution — no new modules):** Analytics omitted; Collections→payments; Permissions→within Roles.
- **Notifications:** footer icon with unread badge (not a nav row).
