// Sales — Deals pipeline (/sales/deals).
// A stage board (columns = sales_deal_stages) with owner/stage filters. Managers
// (sales.deal.manage) can create/edit deals and move them between stages, which
// records a stage-history row. Amounts are bigint paise, shown via formatRupees.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { cn, formatRupees, formatDate } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import {
  useDealStages, useDeals, useClientLookup, useLeadLookup, useProfileLookup,
  useCreateDeal, useUpdateDeal, useMoveDealStage,
} from '../hooks/useDeals'
import type { SalesDeal, DealStage, DealInput } from '../api/deals'

export default function DealsPage() {
  const canManage = useCan('sales.deal.manage')
  const navigate = useNavigate()

  const stagesQ = useDealStages()
  const dealsQ = useDeals()
  const profilesQ = useProfileLookup()

  const createDeal = useCreateDeal()
  const updateDeal = useUpdateDeal()
  const moveStage = useMoveDealStage()

  const [ownerFilter, setOwnerFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SalesDeal | null>(null)

  const stages = stagesQ.data ?? []
  const profiles = profilesQ.data ?? []
  const nameById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of profiles) m[p.id] = p.name
    return m
  }, [profiles])

  const filtered = useMemo(() => {
    let d = dealsQ.data ?? []
    if (ownerFilter) d = d.filter(x => x.owner_id === ownerFilter)
    if (stageFilter) d = d.filter(x => x.stage_key === stageFilter)
    return d
  }, [dealsQ.data, ownerFilter, stageFilter])

  const byStage = useMemo(() => {
    const m = new Map<string, SalesDeal[]>()
    for (const s of stages) m.set(s.stage_key, [])
    for (const d of filtered) {
      if (!m.has(d.stage_key)) m.set(d.stage_key, [])
      m.get(d.stage_key)!.push(d)
    }
    return m
  }, [stages, filtered])

  const openCreate = () => { setEditing(null); setShowForm(true) }
  const openEdit = (d: SalesDeal) => { setEditing(d); setShowForm(true) }

  const error = stagesQ.error || dealsQ.error

  return (
    <div>
      <TopBar title="Deals Pipeline" subtitle="Track opportunities from qualification to close" />
      <div className="p-6 space-y-6 animate-fade-up">

        {/* Filters + actions */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Owner</label>
            <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 bg-white">
              <option value="">All owners</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Stage</label>
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 bg-white">
              <option value="">All stages</option>
              {stages.map(s => <option key={s.stage_key} value={s.stage_key}>{s.label}</option>)}
            </select>
          </div>
          {(ownerFilter || stageFilter) && (
            <button onClick={() => { setOwnerFilter(''); setStageFilter('') }}
              className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] flex items-center gap-1.5">
              <Sym name="clear" size={13} /> Clear
            </button>
          )}
          {canManage && (
            <button onClick={openCreate}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
              <Sym name="add" size={14} /> New Deal
            </button>
          )}
        </div>

        {error ? (
          <div className="glass-panel rounded-xl p-4 text-sm text-white">
            <div className="flex items-start gap-2">
              <Sym name="error" size={16} className="mt-0.5 shrink-0 text-red-300" />
              <div>
                <p className="font-medium mb-1">Couldn't load the pipeline</p>
                <p className="text-xs text-white/70">{(error as Error).message}</p>
              </div>
            </div>
          </div>
        ) : stagesQ.isLoading || dealsQ.isLoading ? (
          <div className="flex gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-64 flex-1 glass-panel rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {stages.map(stage => {
              const deals = byStage.get(stage.stage_key) ?? []
              const total = deals.reduce((sum, d) => sum + d.amount, 0)
              return (
                <div key={stage.stage_key} className="w-72 shrink-0">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full', stageDot(stage))} />
                      <h3 className="text-sm font-semibold text-brand-950">{stage.label}</h3>
                      <span className="text-xs text-muted-foreground">{deals.length}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{formatRupees(total)}</span>
                  </div>
                  <div className="space-y-2 min-h-[80px]">
                    {deals.map(d => (
                      <DealCard
                        key={d.id}
                        deal={d}
                        stages={stages}
                        ownerName={d.owner_id ? nameById[d.owner_id] : undefined}
                        canManage={canManage}
                        movePending={moveStage.isPending}
                        onOpen={() => navigate(`/sales/deals/${d.id}`)}
                        onEdit={() => openEdit(d)}
                        onMove={(toStage, lostReason) => moveStage.mutate({ deal: d, toStage, lostReason })}
                      />
                    ))}
                    {deals.length === 0 && (
                      <div className="text-center text-xs text-muted-foreground py-6 border border-dashed border-border rounded-lg">
                        No deals
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showForm && (
        <DealForm
          deal={editing}
          stages={stages}
          pending={createDeal.isPending || updateDeal.isPending}
          onClose={() => setShowForm(false)}
          onSubmit={async (input) => {
            if (editing) await updateDeal.mutateAsync({ id: editing.id, input })
            else await createDeal.mutateAsync(input)
            setShowForm(false)
          }}
        />
      )}
    </div>
  )
}

function stageDot(stage: DealStage): string {
  if (stage.is_won) return 'bg-green-500'
  if (stage.is_lost) return 'bg-red-500'
  return 'bg-brand-500'
}

function DealCard({
  deal, stages, ownerName, canManage, movePending, onOpen, onEdit, onMove,
}: {
  deal: SalesDeal
  stages: DealStage[]
  ownerName?: string
  canManage: boolean
  movePending: boolean
  onOpen: () => void
  onEdit: () => void
  onMove: (toStage: DealStage, lostReason?: string | null) => void
}) {
  const handleMove = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const target = stages.find(s => s.stage_key === e.target.value)
    if (!target || target.stage_key === deal.stage_key) return
    let lostReason: string | null = null
    if (target.is_lost) lostReason = window.prompt('Reason for marking this deal lost?') || null
    onMove(target, lostReason)
  }

  return (
    <div className="bg-white rounded-xl border border-border p-3 hover:border-brand-300 hover:shadow-sm transition-colors">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="text-left flex-1 min-w-0">
          <p className="text-sm font-medium text-brand-950 truncate">{deal.title}</p>
        </button>
        {canManage && (
          <button onClick={onEdit} className="text-muted-foreground hover:text-brand-600 shrink-0" title="Edit deal">
            <Sym name="edit" size={14} />
          </button>
        )}
      </div>
      <p className="text-sm font-semibold text-brand-700 tabular-nums mt-1">{formatRupees(deal.amount)}</p>
      <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
        <span className="truncate">{ownerName ?? 'Unassigned'}</span>
        {deal.expected_close_date && <span className="shrink-0">{formatDate(deal.expected_close_date)}</span>}
      </div>
      {canManage && (
        <select
          value={deal.stage_key}
          onChange={handleMove}
          disabled={movePending}
          onClick={e => e.stopPropagation()}
          className="mt-2 w-full text-[11px] px-2 py-1 border border-border rounded-md bg-[#F8FAFC] focus:outline-none focus:ring-1 focus:ring-brand-600/30"
          title="Move stage"
        >
          {stages.map(s => <option key={s.stage_key} value={s.stage_key}>{s.label}</option>)}
        </select>
      )}
    </div>
  )
}

function DealForm({
  deal, stages, pending, onClose, onSubmit,
}: {
  deal: SalesDeal | null
  stages: DealStage[]
  pending: boolean
  onClose: () => void
  onSubmit: (input: DealInput) => void
}) {
  const clientsQ = useClientLookup()
  const leadsQ = useLeadLookup()
  const profilesQ = useProfileLookup()

  const [title, setTitle] = useState(deal?.title ?? '')
  const [clientId, setClientId] = useState(deal?.client_id ?? '')
  const [leadId, setLeadId] = useState(deal?.lead_id ?? '')
  const [ownerId, setOwnerId] = useState(deal?.owner_id ?? '')
  const [amountRupees, setAmountRupees] = useState(deal ? String(deal.amount / 100) : '')
  const [closeDate, setCloseDate] = useState(deal?.expected_close_date ?? '')
  const [stageKey, setStageKey] = useState(deal?.stage_key ?? stages[0]?.stage_key ?? 'qualification')
  const [notes, setNotes] = useState(deal?.notes ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({
      title: title.trim(),
      client_id: clientId || null,
      lead_id: leadId || null,
      owner_id: ownerId || null,
      amount: Math.round((parseFloat(amountRupees) || 0) * 100),
      expected_close_date: closeDate || null,
      stage_key: stageKey,
      notes: notes.trim() || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-white">
          <h2 className="font-display font-semibold text-brand-950">{deal ? 'Edit Deal' : 'New Deal'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-brand-950">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required autoFocus
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              placeholder="e.g. FSSAI licence — Acme Foods" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Client</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none bg-white">
                <option value="">— none —</option>
                {(clientsQ.data ?? []).map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Linked Lead (optional)</label>
              <select value={leadId} onChange={e => setLeadId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none bg-white">
                <option value="">— none —</option>
                {(leadsQ.data ?? []).map(l => <option key={l.id} value={l.id}>{l.company_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Owner</label>
              <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none bg-white">
                <option value="">— unassigned —</option>
                {(profilesQ.data ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Amount (₹)</label>
              <input type="number" min="0" step="0.01" value={amountRupees} onChange={e => setAmountRupees(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Stage</label>
              <select value={stageKey} onChange={e => setStageKey(e.target.value)} disabled={!!deal}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none bg-white disabled:opacity-60">
                {stages.map(s => <option key={s.stage_key} value={s.stage_key}>{s.label}</option>)}
              </select>
              {deal && <p className="text-[10px] text-muted-foreground mt-1">Move stage from the board card.</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Expected Close</label>
              <input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              placeholder="Context for this deal" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
            <button type="submit" disabled={pending || !title.trim()}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {pending ? 'Saving…' : deal ? 'Save Changes' : 'Create Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
