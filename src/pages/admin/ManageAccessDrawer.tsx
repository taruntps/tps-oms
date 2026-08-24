// Admin: per-employee access editor, organised like the sidebar.
// Head (Hide / Show) → Sub-group (Hide group) → Page (Hidden / View / Edit).
// Default follows the employee's role; an override is written only where you change it.
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import {
  fetchPermissionCatalog, fetchUserAccessState, saveUserOverrides,
  buildAccessTree, levelOf, roleLevelOf, overridesForLevel, isSensitive,
  type AccessItem, type AccessLevel, type AccessState,
} from '@/core/access/manageAccess'

const HEAD_ICON: Record<string, string> = {
  Dashboard: 'dashboard', Business: 'work', Finance: 'payments', HRMS: 'groups',
  Documents: 'folder', Reports: 'bar_chart', Administration: 'settings', General: 'category',
}

export function ManageAccessDrawer({ userId, userName, onClose }: {
  userId: string; userName: string; onClose: () => void
}) {
  const qc = useQueryClient()
  const { data: catalog, isLoading: lc } = useQuery({ queryKey: ['perm-catalog'], queryFn: fetchPermissionCatalog, staleTime: 10 * 60_000 })
  const { data: state, isLoading: ls } = useQuery({ queryKey: ['user-access-state', userId], queryFn: () => fetchUserAccessState(userId) })

  const tree = useMemo(
    () => (catalog ? buildAccessTree(catalog.keys) : []),
    [catalog],
  )
  // Every controllable item, incl. each head's section item (e.g. Reports → reports.view).
  const sectionItems = useMemo<Record<string, AccessItem>>(() => {
    const m: Record<string, AccessItem> = {}
    for (const h of tree) if (h.sectionKey) m[h.head] = { label: h.head, viewKey: h.sectionKey, editKey: null }
    return m
  }, [tree])
  const itemByKey = useMemo(() => {
    const m = new Map<string, AccessItem>()
    for (const h of tree) for (const g of h.subgroups) for (const it of g.items) m.set(it.viewKey, it)
    for (const k of Object.keys(sectionItems)) m.set(sectionItems[k].viewKey, sectionItems[k])
    return m
  }, [tree, sectionItems])

  const st: AccessState = state ?? {}
  const initial = useMemo(() => {
    const m: Record<string, AccessLevel> = {}
    for (const [key, it] of itemByKey) m[key] = levelOf(it, st)
    return m
  }, [itemByKey, st])

  const [levels, setLevels] = useState<Record<string, AccessLevel> | null>(null)
  const cur = levels ?? initial
  const dirty = useMemo(() => Object.keys(cur).some(k => cur[k] !== initial[k]), [cur, initial])
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const setMany = (updates: Record<string, AccessLevel>) => setLevels({ ...(levels ?? initial), ...updates })
  const setBranch = (it: AccessItem, level: AccessLevel) => setMany({ [it.viewKey]: level })

  const headItems = (head: string) => {
    const h = tree.find(t => t.head === head)!
    return h.subgroups.flatMap(g => g.items)
  }
  const setHead = (head: string, show: boolean) => {
    const sect = sectionItems[head]
    if (show) {
      const u: Record<string, AccessLevel> = {}
      if (sect) u[sect.viewKey] = 'view'
      for (const it of headItems(head)) if (cur[it.viewKey] === 'hidden') u[it.viewKey] = roleLevelOf(it, st)
      setMany(u)
    } else {
      const u: Record<string, AccessLevel> = {}
      if (sect) u[sect.viewKey] = 'hidden'
      for (const it of headItems(head)) u[it.viewKey] = 'hidden'
      setMany(u)
    }
  }
  const setGroup = (items: AccessItem[], hide: boolean) => {
    const u: Record<string, AccessLevel> = {}
    for (const it of items) u[it.viewKey] = hide ? 'hidden' : roleLevelOf(it, st)
    setMany(u)
  }
  const resetAll = () => {
    const u: Record<string, AccessLevel> = {}
    for (const [key, it] of itemByKey) u[key] = roleLevelOf(it, st)
    setMany(u)
  }

  const headHidden = (head: string) => {
    const sect = sectionItems[head]
    if (sect) return cur[sect.viewKey] === 'hidden'
    return headItems(head).every(it => cur[it.viewKey] === 'hidden')
  }
  const groupHidden = (items: AccessItem[]) => items.every(it => cur[it.viewKey] === 'hidden')

  const save = useMutation({
    mutationFn: async () => {
      const changes: { perm_key: string; granted: boolean | null }[] = []
      for (const key of Object.keys(cur)) {
        if (cur[key] === initial[key]) continue
        const it = itemByKey.get(key)!
        changes.push(...overridesForLevel(it, cur[key], st))
      }
      await saveUserOverrides(userId, changes)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-access-state', userId] })
      qc.invalidateQueries({ queryKey: ['my-permissions'] })
      toast.success('Access updated', 'The employee sees the change on their next page load.')
      onClose()
    },
    onError: (e: Error) => toast.error('Could not save', e.message),
  })

  const loading = lc || ls

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
          <p className="text-[11px] text-muted-foreground">Hide a section, or set any page to View / Edit. Blank = follows their role.</p>
          <button onClick={resetAll} className="text-xs text-brand-600 hover:text-brand-700 shrink-0 flex items-center gap-1">
            <Sym name="restart_alt" size={13} /> Reset to role
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading ? (
            <div className="space-y-2 px-2">{[...Array(7)].map((_, i) => <div key={i} className="h-10 bg-[#F8FAFC] rounded animate-pulse" />)}</div>
          ) : tree.map(h => {
            const hidden = headHidden(h.head)
            const isOpen = open[h.head]
            const pages = headItems(h.head).length
            return (
              <div key={h.head} className={`rounded-lg border ${isOpen ? 'border-brand-200' : 'border-border'}`}>
                <div className={`flex items-center justify-between gap-2 px-3 py-2.5 ${isOpen ? 'bg-brand-50/40' : ''} rounded-t-lg`}>
                  <button onClick={() => setOpen({ ...open, [h.head]: !isOpen })} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                    <Sym name={isOpen ? 'expand_more' : 'chevron_right'} size={16} className="text-muted-foreground shrink-0" />
                    <Sym name={HEAD_ICON[h.head] ?? 'category'} size={16} className="text-muted-foreground shrink-0" />
                    <span className="text-[13px] font-semibold text-brand-950 truncate">{h.head}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{pages} page{pages === 1 ? '' : 's'}</span>
                  </button>
                  <Segment
                    options={[{ v: 'hide', l: 'Hide' }, { v: 'show', l: 'Show' }]}
                    value={hidden ? 'hide' : 'show'}
                    onPick={v => setHead(h.head, v === 'show')}
                  />
                </div>

                {isOpen && (
                  <div className="px-3 pb-3 pt-1 space-y-3">
                    {h.subgroups.map(g => {
                      const gh = groupHidden(g.items)
                      return (
                        <div key={g.label}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</span>
                            <button onClick={() => setGroup(g.items, !gh)}
                              className={`text-[11px] ${gh ? 'text-brand-600 hover:text-brand-700' : 'text-muted-foreground hover:text-red-600'}`}>
                              {gh ? 'Show group' : 'Hide group'}
                            </button>
                          </div>
                          <div className="space-y-1">
                            {g.items.map(it => {
                              const val = cur[it.viewKey]
                              const overridden = val !== roleLevelOf(it, st)
                              const opts = [{ v: 'hidden', l: 'Hide' }, { v: 'view', l: 'View' }]
                              if (it.editKey) opts.push({ v: 'edit', l: 'Edit' })
                              return (
                                <div key={it.viewKey} className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md border ${overridden ? 'border-brand-200 bg-brand-50/40' : 'border-border'}`}>
                                  <span className="text-[12.5px] text-brand-950 flex items-center gap-1.5 min-w-0">
                                    <span className="truncate">{it.label}</span>
                                    {isSensitive(it.viewKey) && <Sym name="lock" size={11} className="text-amber-600 shrink-0" title="Sensitive — data-locked" />}
                                  </span>
                                  <Segment options={opts} value={val} onPick={v => setBranch(it, v as AccessLevel)} />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
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

function Segment({ options, value, onPick }: {
  options: { v: string; l: string }[]; value: string; onPick: (v: string) => void
}) {
  return (
    <div className="flex rounded-md border border-border overflow-hidden shrink-0">
      {options.map(o => {
        const active = value === o.v
        const danger = o.v === 'hide' || o.v === 'hidden'
        return (
          <button key={o.v} onClick={() => onPick(o.v)}
            className={`text-[11px] px-2.5 py-1 border-r border-border last:border-r-0 ${
              active
                ? danger ? 'bg-red-50 text-red-600' : 'bg-brand-600 text-white'
                : 'text-muted-foreground hover:bg-[#F8FAFC]'
            }`}>
            {o.l}
          </button>
        )
      })}
    </div>
  )
}
