// Core Platform — sidebar navigation grouping (PR1 UI/Nav Modernization).
// Configuration-first: the enterprise IA (group order + which surface belongs to
// which group) lives here, NOT hard-coded in the Sidebar. The registry-driven
// Sidebar renders getNavFor(role) grouped by these rules. An entry may override
// its group via NavEntry.group; otherwise groupForPath() assigns one by path.
import type { NavEntry } from './moduleTypes'

/** Ordered list of sidebar groups (top → bottom). 'General' is the catch-all. */
export const GROUP_ORDER = [
  'Dashboard',
  'Business',
  'Finance',
  'HRMS',
  'Documents',
  'Reports',
  'Administration',
  'General',
] as const

export type NavGroup = (typeof GROUP_ORDER)[number]

/** Which groups start collapsed on first render (before any saved preference).
 *  Everything except Dashboard starts collapsed for a tidy enterprise default;
 *  the user's expand/collapse choices then persist per browser. */
export const DEFAULT_COLLAPSED: NavGroup[] = GROUP_ORDER.filter((g) => g !== 'Dashboard')

// Path-prefix → group. First match wins (order matters: longer/more-specific first).
const PREFIX_GROUP: [string, NavGroup][] = [
  ['/dashboard', 'Dashboard'],
  ['/director', 'Dashboard'],
  ['/crm', 'Business'],
  ['/clients', 'Business'],
  ['/projects', 'Business'],
  ['/operations', 'Business'],
  ['/tasks', 'Business'],
  ['/sales', 'Finance'],
  ['/finance', 'Finance'],
  ['/hrms', 'HRMS'],
  ['/documents', 'Documents'],
  ['/knowledge', 'Documents'],
  ['/reports', 'Reports'],
  ['/analytics', 'Reports'],
  ['/admin', 'Administration'],
  ['/settings', 'Administration'],
]

/** Resolve the group for a nav entry: explicit group wins, else by path prefix. */
export function groupFor(entry: NavEntry): NavGroup {
  if (entry.group && (GROUP_ORDER as readonly string[]).includes(entry.group)) {
    return entry.group as NavGroup
  }
  const hit = PREFIX_GROUP.find(([prefix]) => entry.to === prefix || entry.to.startsWith(prefix + '/'))
  return hit ? hit[1] : 'General'
}

// ── Sub-groups (second level under a head). Single source of truth, shared by the
//    Sidebar and the Manage Access panel so they never drift. Keyed by exact route. ──
export const SUBGROUP_MAP: Record<string, string> = {
  '/clients': 'Clients and CRM', '/crm/leads': 'Clients and CRM', '/crm/referrals': 'Clients and CRM',
  '/projects': 'Projects and operations', '/operations': 'Projects and operations', '/tasks': 'Projects and operations',
  '/marketing/whatsapp': 'WhatsApp', '/marketing/whatsapp-inbox': 'WhatsApp',
  '/finance/invoices': 'Billing and collections', '/finance': 'Billing and collections',
  '/finance/payments': 'Billing and collections', '/finance/govt-fees': 'Billing and collections',
  '/sales/deals': 'Sales', '/sales/services': 'Sales',
  '/hrms/me': 'My — self-service', '/hrms/profile': 'My — self-service', '/hrms/attendance/me': 'My — self-service',
  '/hrms/leave/me': 'My — self-service', '/hrms/short-leave': 'My — self-service', '/hrms/holidays': 'My — self-service',
  '/hrms/policy': 'My — self-service', '/hrms/payroll/payslips': 'My — self-service', '/hrms/training/me': 'My — self-service',
  '/hrms/assets/me': 'My — self-service', '/hrms/performance/me': 'My — self-service',
  '/hrms/dashboard': 'People', '/hrms/employees': 'People', '/hrms/profile/approvals': 'People',
  '/hrms/attendance': 'Attendance', '/hrms/attendance/approvals': 'Attendance', '/hrms/attendance/shifts': 'Attendance',
  '/hrms/setup/attendance-status': 'Attendance',
  '/hrms/leave': 'Leave', '/hrms/leave/approvals': 'Leave', '/hrms/short-leave/approvals': 'Leave', '/hrms/leave/setup': 'Leave',
  '/hrms/payroll/structures': 'Payroll', '/hrms/payroll/runs': 'Payroll', '/hrms/payroll/components': 'Payroll',
  '/hrms/payroll/statutory': 'Payroll',
  '/hrms/recruit/requisitions': 'Recruitment', '/hrms/recruit/candidates': 'Recruitment',
  '/hrms/lifecycle/onboarding': 'Lifecycle', '/hrms/lifecycle': 'Lifecycle', '/hrms/lifecycle/separations': 'Lifecycle',
  '/hrms/performance': 'Performance', '/hrms/performance/cycles': 'Performance', '/hrms/performance/reports': 'Performance',
  '/hrms/training': 'Training and assets', '/hrms/training/certifications': 'Training and assets', '/hrms/assets': 'Training and assets',
  '/hrms/setup/org': 'Setup', '/hrms/setup/policies': 'Setup',
  '/documents': 'Documents', '/documents/templates': 'Documents',
  '/knowledge': 'Knowledge Base', '/knowledge/browse': 'Knowledge Base', '/knowledge/categories': 'Knowledge Base',
}
export const SUBGROUP_ORDER: Partial<Record<NavGroup, string[]>> = {
  Business: ['Clients and CRM', 'Projects and operations', 'WhatsApp'],
  Finance: ['Billing and collections', 'Sales'],
  HRMS: ['My — self-service', 'People', 'Attendance', 'Leave', 'Payroll', 'Recruitment', 'Lifecycle', 'Performance', 'Training and assets', 'Setup'],
  Documents: ['Documents', 'Knowledge Base'],
}

/** Sub-group label for an entry, or null if it belongs directly under its head. */
export function subgroupFor(entry: NavEntry): string | null {
  return SUBGROUP_MAP[entry.to] ?? null
}

/** Split one head's entries into ordered sub-groups (null = render flat, no sub-heading). */
export function subgroupNav(items: NavEntry[], group: NavGroup): { subgroup: string | null; items: NavEntry[] }[] {
  const buckets = new Map<string | null, NavEntry[]>()
  for (const e of items) {
    const sg = subgroupFor(e)
    if (!buckets.has(sg)) buckets.set(sg, [])
    buckets.get(sg)!.push(e)
  }
  const order = SUBGROUP_ORDER[group] ?? []
  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === null) return -1
    if (b === null) return 1
    const ia = order.indexOf(a), ib = order.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
  })
  return keys.map((k) => ({ subgroup: k, items: buckets.get(k)! }))
}

/** Group an ordered list of entries into GROUP_ORDER buckets (stable within a group). */
export function groupNav(entries: NavEntry[]): { group: NavGroup; items: NavEntry[] }[] {
  const buckets = new Map<NavGroup, NavEntry[]>()
  for (const e of entries) {
    const g = groupFor(e)
    if (!buckets.has(g)) buckets.set(g, [])
    buckets.get(g)!.push(e)
  }
  // Sort within a group by optional `order` (stable for equal/undefined).
  for (const items of buckets.values()) {
    items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }
  return GROUP_ORDER.map((group) => ({ group, items: buckets.get(group) ?? [] })).filter(
    (b) => b.items.length > 0,
  )
}
