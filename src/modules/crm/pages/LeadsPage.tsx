// CRM — Leads pipeline (/crm/leads).
// A Kanban board: columns are crm_pipeline_stages, cards are crm_leads. Cards are
// draggable between columns (moves stage + records history). Search + owner filter.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatRupees } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { useLeads, useStages, useCrmProfiles, useMoveLeadStage } from '../hooks/useLeads'
import type { Lead } from '../api/leads'
import { LeadForm } from './LeadForm'

export default function LeadsPage() {
  const navigate = useNavigate()
  const canManage = useCan('crm.lead.manage')
  const { data: leads = [], isLoading } = useLeads()
  const { data: stages = [] } = useStages()
  const { data: profiles = [] } = useCrmProfiles()
  const move = useMoveLeadStage()

  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)

  const ownerName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of profiles) m.set(p.id, p.name ?? p.id)
    return m
  }, [profiles])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return leads.filter(l => {
      if (ownerFilter && l.owner_id !== ownerFilter) return false
      if (!q) return true
      return (
        l.company_name.toLowerCase().includes(q) ||
        (l.contact_person ?? '').toLowerCase().includes(q) ||
        (l.phone ?? '').includes(q) ||
        (l.service_interest ?? '').toLowerCase().includes(q)
      )
    })
  }, [leads, search, ownerFilter])

  const byStage = useMemo(() => {
    const m = new Map<string, Lead[]>()
    for (const s of stages) m.set(s.stage_key, [])
    for (const l of filtered) {
      if (!m.has(l.stage_key)) m.set(l.stage_key, [])
      m.get(l.stage_key)!.push(l)
    }
    return m
  }, [filtered, stages])

  const onDrop = (stageKey: string) => {
    setOverStage(null)
    const lead = leads.find(l => l.id === dragId)
    setDragId(null)
    if (!lead || !canManage || lead.stage_key === stageKey) return
    const stage = stages.find(s => s.stage_key === stageKey)
    move.mutate({ lead, toStage: stageKey, isWon: !!stage?.is_won, isLost: !!stage?.is_lost })
  }

  return (
    <div>
      <TopBar title="Leads" subtitle={`${leads.length} lead${leads.length === 1 ? '' : 's'} in pipeline`} />

      <div className="p-6 animate-fade-up">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Sym name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search leads, contact, phone…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>

          <select
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
          >
            <option value="">All owners</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name ?? p.id}</option>)}
          </select>

          {canManage && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors ml-auto"
            >
              <Sym name="add" size={16} />
              New Lead
            </button>
          )}
        </div>

        {/* Board */}
        {isLoading ? (
          <div className="flex gap-3 overflow-x-auto">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="w-72 shrink-0 h-64 bg-white rounded-xl border border-border animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {stages.map(stage => {
              const items = byStage.get(stage.stage_key) ?? []
              const total = items.reduce((s, l) => s + (l.estimated_value ?? 0), 0)
              return (
                <div
                  key={stage.stage_key}
                  onDragOver={e => { if (canManage) { e.preventDefault(); setOverStage(stage.stage_key) } }}
                  onDragLeave={() => setOverStage(s => (s === stage.stage_key ? null : s))}
                  onDrop={() => onDrop(stage.stage_key)}
                  className={`w-72 shrink-0 rounded-xl border p-2 transition-colors ${
                    overStage === stage.stage_key ? 'border-brand-600 bg-brand-600/5' : 'border-border bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${stage.is_won ? 'bg-green-500' : stage.is_lost ? 'bg-red-500' : 'bg-brand-600'}`} />
                      <span className="text-xs font-semibold text-brand-950 uppercase tracking-wide">{stage.label}</span>
                      <span className="text-[10px] text-muted-foreground bg-white border border-border rounded-full px-1.5 py-0.5">{items.length}</span>
                    </div>
                  </div>
                  {total > 0 && (
                    <p className="text-[10px] text-muted-foreground px-2 mb-2">{formatRupees(total)}</p>
                  )}

                  <div className="space-y-2 min-h-[40px]">
                    {items.map(lead => (
                      <div
                        key={lead.id}
                        draggable={canManage}
                        onDragStart={() => setDragId(lead.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => navigate(`/crm/leads/${lead.id}`)}
                        className={`bg-white rounded-lg border border-border p-3 cursor-pointer hover:border-brand-600/30 hover:shadow-sm transition-all ${
                          dragId === lead.id ? 'opacity-50' : ''
                        }`}
                      >
                        <p className="font-semibold text-brand-950 text-[13px] leading-tight truncate">{lead.company_name}</p>
                        {lead.contact_person && (
                          <p className="text-[11px] text-muted-foreground truncate">{lead.contact_person}</p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[11px] font-medium text-brand-700">
                            {lead.estimated_value != null ? formatRupees(lead.estimated_value) : '—'}
                          </span>
                          {lead.owner_id && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[100px] flex items-center gap-1">
                              <Sym name="person" size={11} />
                              {ownerName.get(lead.owner_id) ?? '—'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <div className="text-[11px] text-muted-foreground/60 text-center py-4">No leads</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showForm && <LeadForm onClose={() => setShowForm(false)} />}
    </div>
  )
}
