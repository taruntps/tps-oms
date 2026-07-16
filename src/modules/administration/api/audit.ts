// Administration — Audit Log data access (thin supabase wrappers).
// `audit_log` is in the generated Database types; profiles are looked up
// separately to resolve user_id → name for display.
import { supabase } from '@/lib/supabase'

export interface AuditRow {
  id: string
  user_id: string | null
  action: string
  table_name: string | null
  record_id: string | null
  created_at: string
}

export interface AuditPage {
  rows: AuditRow[]
  total: number
}

export interface AuditFilters {
  action?: string
  table_name?: string
}

const PAGE_SIZE = 25

export async function fetchAuditLog(
  page: number,
  filters: AuditFilters = {},
): Promise<AuditPage> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = (supabase.from('audit_log') as any)
    .select('id, user_id, action, table_name, record_id, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filters.action) query = query.ilike('action', `%${filters.action}%`)
  if (filters.table_name) query = query.ilike('table_name', `%${filters.table_name}%`)

  const { data, error, count } = await query
  if (error) throw error
  return { rows: (data ?? []) as AuditRow[], total: count ?? 0 }
}

export const AUDIT_PAGE_SIZE = PAGE_SIZE

/** Resolve a set of user ids to display names (id → name). */
export async function fetchUserNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return {}
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', unique)
  if (error) throw error
  const map: Record<string, string> = {}
  for (const r of (data ?? []) as { id: string; name: string }[]) map[r.id] = r.name
  return map
}
