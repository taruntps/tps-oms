// Admin "Manage access" — per-employee overrides, organised to mirror the SIDEBAR.
// The panel is built from the nav registry (coreNav + module nav) so it lists exactly
// the pages a user sees, grouped Head → Sub-group → Page. Each page can be set to
// Hidden / View / Edit; default is "follow the role" (no override written). New pages
// with a `permission` appear here automatically — nothing hard-coded per page.
import { supabase } from '@/lib/supabase'
import { coreNav } from '@/core/coreNav'
import { MODULES } from '@/core/registry'
import { groupFor, GROUP_ORDER, SUBGROUP_MAP, SUBGROUP_ORDER, type NavGroup } from '@/core/navGroups'

// ── Types ────────────────────────────────────────────────────────────────────
export type AccessLevel = 'hidden' | 'view' | 'edit'

export interface AccessItem {
  label: string
  viewKey: string          // permission that reveals the page
  editKey: string | null   // paired *.manage permission, if any (enables "Edit")
}
export interface AccessSubgroup { label: string; items: AccessItem[] }
export interface AccessHead {
  head: NavGroup
  sectionKey: string | null  // a single perm that gates the whole section (Reports), else null
  subgroups: AccessSubgroup[]
}

/** Per-user access state from user_access_state(): role grant + override per perm. */
export type AccessState = Record<string, { role: boolean; ov: boolean | null }>

// Sensitive pages get a lock badge (data is also RLS-locked, migration 130).
export const SENSITIVE_KEY_HINTS = ['payroll', 'salary', 'payslip', 'bank', 'medical', 'ctc', 'compensation']
export const isSensitive = (key: string) =>
  key.split('.')[0] === 'finance' || SENSITIVE_KEY_HINTS.some(h => key.includes(h))

// Sidebar Head → Sub-group config now lives in navGroups.ts (shared with the Sidebar).
// Report tabs + Administration get panel-only sub-group ordering here.
const PANEL_SUBGROUP_ORDER: Partial<Record<NavGroup, string[]>> = {
  ...SUBGROUP_ORDER,
  Reports: ['Report tabs'],
  Administration: ['General'],
}
const DEFAULT_SUB = 'Other'

// Reports tabs are page-tabs, not nav entries — model them as branches under Reports.
export const REPORT_TABS: { key: string; label: string }[] = [
  { key: 'performance', label: 'Performance' },
  { key: 'pending_payments', label: 'Pending Payments' },
  { key: 'queries', label: 'Queries Report' },
  { key: 'referrals', label: 'Referrals' },
  { key: 'govt_fees', label: 'Govt Fees' },
  { key: 'project_timeline', label: 'Project Timeline' },
  { key: 'stage_perf', label: 'Stage Performance' },
  { key: 'employee_timeline', label: 'Employee Timeline' },
]
const REPORTS_SECTION_KEY = 'reports.view'

/** Build the Head → Sub-group → Page tree from the nav registry + report tabs.
 *  Rows are labelled with the exact SIDEBAR label so the panel reads 1:1 with the nav. */
export function buildAccessTree(catalogKeys: Set<string>): AccessHead[] {
  const navEntries = [...coreNav, ...MODULES.flatMap(m => m.nav)].filter(e => !!e.permission)
  // head → subgroup → items (deduped by viewKey across the whole tree)
  const tree = new Map<NavGroup, Map<string, AccessItem[]>>()
  const seen = new Set<string>()
  const add = (head: NavGroup, sub: string, item: AccessItem) => {
    if (seen.has(item.viewKey)) return
    seen.add(item.viewKey)
    if (!tree.has(head)) tree.set(head, new Map())
    const subs = tree.get(head)!
    if (!subs.has(sub)) subs.set(sub, [])
    subs.get(sub)!.push(item)
  }

  for (const e of navEntries) {
    const key = e.permission as string
    if (key === REPORTS_SECTION_KEY) continue // section-level control, not a branch
    const head = groupFor(e)
    const sub = SUBGROUP_MAP[e.to] ?? DEFAULT_SUB
    const manage = key.endsWith('.view') ? key.slice(0, -'.view'.length) + '.manage' : null
    add(head, sub, {
      label: e.label,
      viewKey: key,
      editKey: manage && catalogKeys.has(manage) ? manage : null,
    })
  }
  // Report tabs → Reports / "Report tabs"
  for (const t of REPORT_TABS) {
    add('Reports', 'Report tabs', { label: t.label, viewKey: `reports.${t.key}.view`, editKey: null })
  }

  // Assemble ordered heads → ordered subgroups.
  const heads: AccessHead[] = []
  for (const head of GROUP_ORDER) {
    const subs = tree.get(head)
    if (!subs || subs.size === 0) continue
    const order = PANEL_SUBGROUP_ORDER[head] ?? []
    const names = [...subs.keys()].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
    })
    heads.push({
      head,
      sectionKey: head === 'Reports' ? REPORTS_SECTION_KEY : null,
      subgroups: names.map(label => ({ label, items: subs.get(label)! })),
    })
  }
  return heads
}

// ── Level resolution (follow-role default) ───────────────────────────────────
const resolved = (key: string, st: AccessState) => {
  const s = st[key]
  if (!s) return false
  return s.ov === false ? false : s.ov === true ? true : s.role
}
const roleHas = (key: string, st: AccessState) => !!st[key]?.role

/** Current effective level shown in the panel (role + override). */
export function levelOf(item: AccessItem, st: AccessState): AccessLevel {
  if (!resolved(item.viewKey, st)) return 'hidden'
  if (item.editKey && resolved(item.editKey, st)) return 'edit'
  return 'view'
}
/** What the role alone grants — the target when you "reset to role" / "Show". */
export function roleLevelOf(item: AccessItem, st: AccessState): AccessLevel {
  if (!roleHas(item.viewKey, st)) return 'hidden'
  if (item.editKey && roleHas(item.editKey, st)) return 'edit'
  return 'view'
}
/** Minimal override rows to reach `level` (null = delete row → follow role). */
export function overridesForLevel(item: AccessItem, level: AccessLevel, st: AccessState): { perm_key: string; granted: boolean | null }[] {
  const targetView = level !== 'hidden'
  const targetEdit = level === 'edit'
  const out: { perm_key: string; granted: boolean | null }[] = []
  const bView = roleHas(item.viewKey, st)
  out.push({ perm_key: item.viewKey, granted: targetView === bView ? null : targetView })
  if (item.editKey) {
    const bEdit = roleHas(item.editKey, st)
    out.push({ perm_key: item.editKey, granted: targetEdit === bEdit ? null : targetEdit })
  }
  return out
}

// ── Data access ──────────────────────────────────────────────────────────────
const db = supabase as any

export async function fetchPermissionCatalog(): Promise<{ labels: Map<string, string>; keys: Set<string> }> {
  const { data, error } = await db.from('permissions').select('perm_key, label')
  if (error) throw error
  const labels = new Map<string, string>(), keys = new Set<string>()
  for (const r of (data ?? []) as { perm_key: string; label: string | null }[]) {
    keys.add(r.perm_key)
    if (r.label) labels.set(r.perm_key, r.label)
  }
  return { labels, keys }
}

export async function fetchUserAccessState(userId: string): Promise<AccessState> {
  const { data, error } = await db.rpc('user_access_state', { p_uid: userId })
  if (error) throw error
  const st: AccessState = {}
  for (const r of (data ?? []) as { perm_key: string; role_granted: boolean; override_granted: boolean | null }[]) {
    st[r.perm_key] = { role: !!r.role_granted, ov: r.override_granted }
  }
  return st
}

/** Apply {perm_key, granted|null}. null = delete (follow role); true/false = upsert. */
export async function saveUserOverrides(userId: string, changes: { perm_key: string; granted: boolean | null }[]): Promise<void> {
  const dels = changes.filter(c => c.granted === null).map(c => c.perm_key)
  const ups = changes.filter(c => c.granted !== null).map(c => ({ user_id: userId, perm_key: c.perm_key, granted: c.granted as boolean, scope: 'all' }))
  if (dels.length) {
    const { error } = await db.from('user_permission_overrides').delete().eq('user_id', userId).in('perm_key', dels)
    if (error) throw error
  }
  if (ups.length) {
    const { error } = await db.from('user_permission_overrides').upsert(ups, { onConflict: 'user_id,perm_key' })
    if (error) throw error
  }
}
