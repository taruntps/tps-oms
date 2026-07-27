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
