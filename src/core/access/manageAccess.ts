// Admin "Manage access" — read/write per-employee permission overrides.
// The DB already merges these: my_permissions()/has_perm() = role defaults + granted
// overrides − denied overrides (super_admin is a hard floor). This layer just lets an
// admin SET those rows and builds a friendly Module → Page matrix from the permission
// catalog. Writes are RLS-gated to super_admin/director.
import { supabase } from '@/lib/supabase'

export interface PermRow { perm_key: string; module: string; label: string }

/** level a page can be set to for one employee. */
export type AccessLevel = 'inherit' | 'hidden' | 'view' | 'edit'
/** toggle for standalone action-permissions (approve, export, …). */
export type ToggleLevel = 'inherit' | 'blocked' | 'allowed'

export interface AccessItem {
  /** friendly resource/page name, e.g. "Attendance". */
  label: string
  /** the read/see permission (a `*.view` key, or the single key for toggles). */
  viewKey: string
  /** the edit/manage permission if the resource has one, else null. */
  editKey: string | null
  /** true = 4-way Hidden/View/Edit page; false = 3-way Blocked/Allowed action. */
  isPage: boolean
}
export interface AccessGroup { module: string; items: AccessItem[] }

const titise = (s: string) =>
  s.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()

// Modules whose data is also locked at the row level (badged 🔒 in the UI).
export const SENSITIVE_MODULES = new Set(['finance'])
export const SENSITIVE_KEY_HINTS = ['payroll', 'salary', 'payslip', 'bank', 'medical', 'ctc', 'compensation']
export const isSensitive = (key: string) =>
  SENSITIVE_MODULES.has(key.split('.')[0]) || SENSITIVE_KEY_HINTS.some(h => key.includes(h))

/** Group the flat permission catalog into Module → resource rows (view/edit paired). */
export function buildAccessGroups(perms: PermRow[]): AccessGroup[] {
  const byModule = new Map<string, PermRow[]>()
  for (const p of perms) {
    if (!byModule.has(p.module)) byModule.set(p.module, [])
    byModule.get(p.module)!.push(p)
  }
  const groups: AccessGroup[] = []
  for (const [module, list] of byModule) {
    // group by resource = the 2nd dotted segment (module.RESOURCE.action)
    const byRes = new Map<string, PermRow[]>()
    for (const p of list) {
      const res = p.perm_key.split('.')[1] ?? p.perm_key
      if (!byRes.has(res)) byRes.set(res, [])
      byRes.get(res)!.push(p)
    }
    const items: AccessItem[] = []
    for (const [res, rows] of byRes) {
      const byAction = new Map<string, PermRow>()
      for (const r of rows) byAction.set(r.perm_key.split('.')[2] ?? 'view', r)
      const view = byAction.get('view')
      const manage = byAction.get('manage')
      if (view) {
        items.push({ label: titise(res), viewKey: view.perm_key, editKey: manage?.perm_key ?? null, isPage: true })
        byAction.delete('view'); byAction.delete('manage')
      }
      // remaining actions (approve, export, self, …) → standalone toggles
      for (const [action, r] of byAction) {
        items.push({ label: `${titise(res)} — ${titise(action)}`, viewKey: r.perm_key, editKey: null, isPage: false })
      }
    }
    items.sort((a, b) => a.label.localeCompare(b.label))
    groups.push({ module, items })
  }
  groups.sort((a, b) => a.module.localeCompare(b.module))
  return groups
}

/** current effective level of a page from the user's override map. */
export function levelOf(item: AccessItem, ov: Record<string, boolean>): AccessLevel {
  const v = ov[item.viewKey]
  const e = item.editKey ? ov[item.editKey] : undefined
  if (v === false) return 'hidden'
  if (v === true) return item.editKey ? (e === true ? 'edit' : 'view') : 'view'
  return 'inherit'
}

/** override rows a chosen level implies for a page (null = delete the row / inherit). */
export function overridesForLevel(item: AccessItem, level: AccessLevel): { perm_key: string; granted: boolean | null }[] {
  const out: { perm_key: string; granted: boolean | null }[] = []
  if (level === 'inherit') {
    out.push({ perm_key: item.viewKey, granted: null })
    if (item.editKey) out.push({ perm_key: item.editKey, granted: null })
  } else if (level === 'hidden') {
    out.push({ perm_key: item.viewKey, granted: false })
    if (item.editKey) out.push({ perm_key: item.editKey, granted: false })
  } else if (level === 'view') {
    out.push({ perm_key: item.viewKey, granted: true })
    if (item.editKey) out.push({ perm_key: item.editKey, granted: false })
  } else if (level === 'edit') {
    out.push({ perm_key: item.viewKey, granted: true })
    if (item.editKey) out.push({ perm_key: item.editKey, granted: true })
  }
  return out
}

// ── data access ────────────────────────────────────────────────────────────
const db = supabase as any

export async function fetchPermissions(): Promise<PermRow[]> {
  const { data, error } = await db.from('permissions').select('perm_key, module, label').order('module')
  if (error) throw error
  return (data ?? []) as PermRow[]
}

export async function fetchUserOverrides(userId: string): Promise<Record<string, boolean>> {
  const { data, error } = await db.from('user_permission_overrides').select('perm_key, granted').eq('user_id', userId)
  if (error) throw error
  const map: Record<string, boolean> = {}
  for (const r of (data ?? []) as { perm_key: string; granted: boolean }[]) map[r.perm_key] = r.granted
  return map
}

/** Apply a batch of {perm_key, granted|null}. null = delete (inherit); true/false = upsert. */
export async function saveUserOverrides(
  userId: string,
  changes: { perm_key: string; granted: boolean | null }[],
): Promise<void> {
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
