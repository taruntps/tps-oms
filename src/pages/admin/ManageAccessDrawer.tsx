// Admin: per-employee access editor. Sets user_permission_overrides on top of the
// employee's role — Hidden / View / Edit per page (Blocked / Allowed for action perms).
// Empty = "Inherit" (follow the role). Writes are RLS-gated to super_admin/director.
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import {
  fetchPermissions, fetchUserOverrides, saveUserOverrides,
  buildAccessGroups, levelOf, overridesForLevel, isSensitive,
  type AccessItem, type AccessLevel,
} from '@/core/access/manageAccess'

const MODULE_LABEL: Record<string, string> = {
  hrms: 'HRMS', finance: 'Finance', crm: 'CRM', sales: 'Sales',
  documents: 'Documents', knowledge: 'Knowledge Base', admin: 'Administration',
}
const labelFor = (m: string) => MODULE_LABEL[m] ?? m.charAt(0).toUpperCase() + m.slice(1)

function optionsFor(item: AccessItem): { v: AccessLevel; l: string }[] {
  if (!item.isPage) return [{ v: 'inherit', l: 'Inherit' }, { v: 'hidden', l: 'Blocked' }, { v: 'view', l: 'Allowed' }]
  const base: { v: AccessLevel; l: string }[] = [{ v: 'inherit', l: 'Inherit' }, { v: 'hidden', l: 'Hidden' }, { v: 'view', l: 'View' }]
  if (item.editKey) base.push({ v: 'edit', l: 'Edit' })
  return base
}

export function ManageAccessDrawer({ userId, userName, onClose }: {
  userId: string; userName: string; onClose: () => void
}) {
  const qc = useQueryClient()
  const { data: perms = [], isLoading: lp } = useQuery({ queryKey: ['perm-catalog'], queryFn: fetchPermissions, staleTime: 10 * 60_000 })
  const { data: overrides = {}, isLoading: lo } = useQuery({ queryKey: ['user-overrides', userId], queryFn: () => fetchUserOverrides(userId) })

  const groups = useMemo(() => buildAccessGroups(perms), [perms])
  // Working copy of levels, keyed by viewKey. Initialised once overrides load.
  const [levels, setLevels] = useState<Record<string, AccessLevel> | null>(null)
  const initial = useMemo(() => {
    const m: Record<string, AccessLevel> = {}
    for (const g of groups) for (const it of g.items) m[it.viewKey] = levelOf(it, overrides)
    return m
  }, [groups, overrides])
  const cur = levels ?? initial
  const dirty = useMemo(() => Object.keys(cur).some(k => cur[k] !== initial[k]), [cur, initial])

  const setLevel = (item: AccessItem, level: AccessLevel) =>
    setLevels({ ...(levels ?? initial), [item.viewKey]: level })

  const setModule = (moduleItems: AccessItem[], level: AccessLevel) => {
    const next = { ...(levels ?? initial) }
    for (const it of moduleItems) next[it.viewKey] = it.isPage || level === 'inherit' ? level : (level === 'hidden' ? 'hidden' : 'view')
    setLevels(next)
  }

  const save = useMutation({
    mutationFn: async () => {
      const itemByKey = new Map<string, AccessItem>()
      for (const g of groups) for (const it of g.items) itemByKey.set(it.viewKey, it)
      const changes: { perm_key: string; granted: boolean | null }[] = []
      for (const key of Object.keys(cur)) {
        if (cur[key] === initial[key]) continue
        const it = itemByKey.get(key)!
        changes.push(...overridesForLevel(it, cur[key]))
      }
      await saveUserOverrides(userId, changes)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-overrides', userId] })
      qc.invalidateQueries({ queryKey: ['my-permissions'] })
      toast.success('Access updated', 'The employee sees the change on their next page load.')
      onClose()
    },
    onError: (e: Error) => toast.error('Could not save', e.message),
  })

  const resetAll = () => {
    const next: Record<string, AccessLevel> = {}
    for (const g of groups) for (const it of g.items) next[it.viewKey] = 'inherit'
    setLevels(next)
  }

  const loading = lp || lo

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col animate-fade-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-display font-semibold text-brand-950">Manage access</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{userName} · overrides on top of their role</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={18} /></button>
        </div>

        <div className="px-6 py-3 border-b border-border flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-muted-foreground">Inherit = follow role. Set a page to Hidden / View / Edit to override.</p>
          <button onClick={resetAll} className="text-xs text-brand-600 hover:text-brand-700 shrink-0 flex items-center gap-1">
            <Sym name="restart_alt" size={13} /> Reset all to role
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {loading ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-9 bg-[#F8FAFC] rounded animate-pulse" />)}</div>
          ) : groups.map(g => (
            <div key={g.module}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-950">{labelFor(g.module)}</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => setModule(g.items, 'hidden')} className="text-[11px] text-muted-foreground hover:text-red-600">Hide all</button>
                  <span className="text-muted-foreground/40">·</span>
                  <button onClick={() => setModule(g.items, 'inherit')} className="text-[11px] text-muted-foreground hover:text-brand-700">Reset</button>
                </div>
              </div>
              <div className="space-y-1.5">
                {g.items.map(it => {
                  const opts = optionsFor(it)
                  const val = cur[it.viewKey]
                  const overridden = val !== 'inherit'
                  return (
                    <div key={it.viewKey} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ${overridden ? 'border-brand-200 bg-brand-50/40' : 'border-border'}`}>
                      <span className="text-[13px] text-brand-950 flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{it.label}</span>
                        {isSensitive(it.viewKey) && <Sym name="lock" size={12} className="text-amber-600 shrink-0" title="Sensitive — data-locked" />}
                      </span>
                      <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                        {opts.map(o => (
                          <button key={o.v} onClick={() => setLevel(it, o.v)}
                            className={`text-[11px] px-2.5 py-1 border-r border-border last:border-r-0 ${val === o.v ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:bg-[#F8FAFC]'}`}>
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-between gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={() => save.mutate()} disabled={!dirty || save.isPending}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
