import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Sym } from '@/components/shared/Sym'

// Shape of a fetched query ROUND (joined to project + client). Typed locally
// because the generated DB types don't surface every selected column.
interface QueryRoundRow {
  id: string
  query_type: string | null
  received_date: string
  response_due: string | null
  response_submitted_date: string | null
  round_no: number | null
  created_at: string
  points: { id: string; response: string | null }[] | null
  project: {
    project_code: string | null
    service_type: string | null
    client: {
      company_name: string | null
      state: string | null
    } | null
  } | null
}

type RoundStatus = 'Responded' | 'Overdue' | 'Pending'

const todayISO = () => new Date().toISOString().slice(0, 10)

function statusOf(r: QueryRoundRow): RoundStatus {
  if (r.response_submitted_date) return 'Responded'
  if (r.response_due && r.response_due < todayISO()) return 'Overdue'
  return 'Pending'
}

function responseDays(r: QueryRoundRow): number | null {
  if (!r.response_submitted_date) return null
  const a = new Date(r.received_date + 'T00:00:00Z').getTime()
  const b = new Date(r.response_submitted_date + 'T00:00:00Z').getTime()
  return Math.max(0, Math.round((b - a) / 86400000))
}

async function fetchRounds(): Promise<QueryRoundRow[]> {
  const { data, error } = await supabase
    .from('authority_queries')
    .select(
      '*, points:query_points(id,response), project:projects(project_code, service_type, client:clients(company_name, state))'
    )
    .order('received_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as QueryRoundRow[]
}

export default function QueriesReportPage() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [company, setCompany] = useState('')
  const [stateFilter, setStateFilter] = useState('')

  const { data: rounds = [], isLoading } = useQuery({
    queryKey: ['queries-report'],
    queryFn: fetchRounds,
    staleTime: 5 * 60 * 1000,
  })

  // Distinct states present in the data, for the region dropdown.
  const states = useMemo(() => {
    const set = new Set<string>()
    for (const r of rounds) {
      const s = r.project?.client?.state
      if (s) set.add(s)
    }
    return [...set].sort()
  }, [rounds])

  // Client-side filtering.
  const filtered = useMemo(() => {
    const companyQ = company.trim().toLowerCase()
    return rounds.filter(r => {
      if (fromDate && r.received_date < fromDate) return false
      if (toDate && r.received_date > toDate) return false
      const name = r.project?.client?.company_name ?? ''
      if (companyQ && !name.toLowerCase().includes(companyQ)) return false
      if (stateFilter && (r.project?.client?.state ?? '') !== stateFilter) return false
      return true
    })
  }, [rounds, fromDate, toDate, company, stateFilter])

  // Summary metrics.
  const summary = useMemo(() => {
    let points = 0
    let pending = 0
    let overdue = 0
    const respDays: number[] = []
    for (const r of filtered) {
      points += r.points?.length ?? 0
      const st = statusOf(r)
      if (st === 'Pending') pending++
      else if (st === 'Overdue') overdue++
      const d = responseDays(r)
      if (d !== null) respDays.push(d)
    }
    const avgResponse = respDays.length
      ? Math.round(respDays.reduce((a, b) => a + b, 0) / respDays.length)
      : 0
    return {
      rounds: filtered.length,
      points,
      pending,
      overdue,
      avgResponse,
    }
  }, [filtered])

  // By-company aggregation.
  const byCompany = useMemo(() => {
    const map = new Map<string, { company: string; rounds: number; points: number; pending: number }>()
    for (const r of filtered) {
      const name = r.project?.client?.company_name ?? '—'
      if (!map.has(name)) map.set(name, { company: name, rounds: 0, points: 0, pending: 0 })
      const row = map.get(name)!
      row.rounds++
      row.points += r.points?.length ?? 0
      const st = statusOf(r)
      if (st === 'Pending' || st === 'Overdue') row.pending++
    }
    return [...map.values()].sort((a, b) => b.rounds - a.rounds)
  }, [filtered])

  // By-region (state) aggregation.
  const byRegion = useMemo(() => {
    const map = new Map<string, { state: string; rounds: number; points: number }>()
    for (const r of filtered) {
      const s = r.project?.client?.state ?? '—'
      if (!map.has(s)) map.set(s, { state: s, rounds: 0, points: 0 })
      const row = map.get(s)!
      row.rounds++
      row.points += r.points?.length ?? 0
    }
    return [...map.values()].sort((a, b) => b.rounds - a.rounds)
  }, [filtered])

  const hasFilters = !!(fromDate || toDate || company.trim() || stateFilter)

  return (
    <div>
      <TopBar title="Queries Report" subtitle="FSSAI query patterns by company & region" />

      <div className="p-6 space-y-6 animate-fade-up">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-border p-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Received from</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Received to</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Company</label>
            <input
              type="text"
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Search company…"
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Region (state)</label>
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 bg-white"
            >
              <option value="">All regions</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {hasFilters && (
            <button
              onClick={() => { setFromDate(''); setToDate(''); setCompany(''); setStateFilter('') }}
              className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-[#F8FAFC] flex items-center gap-1.5"
            >
              <Sym name="close" size={13} /> Clear
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 glass-panel rounded-xl animate-pulse" />
            ))}
          </div>
        ) : rounds.length === 0 ? (
          <div className="bg-white rounded-xl border border-border p-12 text-center">
            <Sym name="fact_check" size={32} className="text-muted-foreground/50 mx-auto" />
            <p className="text-sm text-muted-foreground mt-3">No FSSAI query rounds recorded yet.</p>
          </div>
        ) : (
          <>
            {/* Summary metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <KPI icon="fact_check"  label="Total Rounds"   value={summary.rounds}   color="text-brand-600" />
              <KPI icon="list"        label="Query Points"   value={summary.points}   color="text-brand-600" />
              <KPI icon="pending"     label="Pending"        value={summary.pending}  color={summary.pending ? 'text-amber-600' : 'text-green-600'} />
              <KPI icon="warning"     label="Overdue"        value={summary.overdue}  color={summary.overdue ? 'text-red-600' : 'text-green-600'} />
              <KPI icon="schedule"    label="Avg Response"   value={`${summary.avgResponse}d`} color="text-brand-600" />
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-border p-12 text-center">
                <Sym name="filter_alt_off" size={28} className="text-muted-foreground/50 mx-auto" />
                <p className="text-sm text-muted-foreground mt-3">No rounds match the current filters.</p>
              </div>
            ) : (
              <>
                {/* By Company + By Region */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* By Company */}
                  <div className="bg-white rounded-xl border border-border overflow-hidden">
                    <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                      <Sym name="apartment" size={14} className="text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-brand-950">By Company</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-[#F8FAFC]">
                          <tr className="text-left">
                            {['Company', 'Rounds', 'Points', 'Pending'].map(h => (
                              <th key={h} className="px-5 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {byCompany.map(c => (
                            <tr key={c.company} className="hover:bg-[#F8FAFC]">
                              <td className="px-5 py-3 font-medium text-brand-950">{c.company}</td>
                              <td className="px-5 py-3">{c.rounds}</td>
                              <td className="px-5 py-3">{c.points}</td>
                              <td className="px-5 py-3">
                                <span className={cn(
                                  'px-1.5 py-0.5 rounded text-[10px] font-medium',
                                  c.pending ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                                )}>{c.pending}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* By Region */}
                  <div className="bg-white rounded-xl border border-border overflow-hidden">
                    <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                      <Sym name="public" size={14} className="text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-brand-950">By Region (Regional FSSAI Office)</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-[#F8FAFC]">
                          <tr className="text-left">
                            {['State', 'Rounds', 'Points'].map(h => (
                              <th key={h} className="px-5 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {byRegion.map(s => (
                            <tr key={s.state} className="hover:bg-[#F8FAFC]">
                              <td className="px-5 py-3 font-medium text-brand-950">{s.state}</td>
                              <td className="px-5 py-3">{s.rounds}</td>
                              <td className="px-5 py-3">{s.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Detail table of rounds */}
                <div className="bg-white rounded-xl border border-border overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                    <Sym name="receipt_long" size={14} className="text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-brand-950">Query Rounds</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-[#F8FAFC]">
                        <tr className="text-left">
                          {['Company', 'Project', 'Type', 'Received', 'Points', 'Status', 'Responded'].map(h => (
                            <th key={h} className="px-5 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filtered.map(r => {
                          const st = statusOf(r)
                          return (
                            <tr key={r.id} className="hover:bg-[#F8FAFC]">
                              <td className="px-5 py-3 font-medium text-brand-950">{r.project?.client?.company_name ?? '—'}</td>
                              <td className="px-5 py-3 text-muted-foreground">{r.project?.project_code ?? '—'}</td>
                              <td className="px-5 py-3 capitalize">{(r.query_type ?? '—').toString().replace(/_/g, ' ')}</td>
                              <td className="px-5 py-3 text-muted-foreground">{r.received_date ?? '—'}</td>
                              <td className="px-5 py-3">{r.points?.length ?? 0}</td>
                              <td className="px-5 py-3">
                                <span className={cn(
                                  'px-1.5 py-0.5 rounded text-[10px] font-medium',
                                  st === 'Responded' ? 'bg-green-100 text-green-700'
                                    : st === 'Overdue' ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                )}>{st}</span>
                              </td>
                              <td className="px-5 py-3 text-muted-foreground">{r.response_submitted_date ?? '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function KPI({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2">
        <Sym name={icon} size={13} className={color} />
        <p className="stat-label">{label}</p>
      </div>
      <p className={cn('stat-value', color)}>{value}</p>
    </div>
  )
}
