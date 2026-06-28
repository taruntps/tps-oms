import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { formatRupees, cn } from '@/lib/utils'
import { Sym } from '@/components/shared/Sym'
import { useReferralBreakdown, useUpsertReferral, type ReferralBreakdown } from '@/hooks/useReferrals'

// ── Shared helpers ───────────────────────────────────────────────────────────

function periodOf(monthOffset: number) {
  const d = new Date()
  d.setMonth(d.getMonth() + monthOffset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function periodLabel(period: string) {
  const [y, m] = period.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
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

// ── Tab type ─────────────────────────────────────────────────────────────────
type ReportTab = 'performance' | 'pending_payments' | 'queries' | 'referrals' | 'govt_fees'

const TABS: { key: ReportTab; label: string; icon: string }[] = [
  { key: 'performance',      label: 'Performance',       icon: 'bar_chart' },
  { key: 'pending_payments', label: 'Pending Payments',  icon: 'payments' },
  { key: 'queries',          label: 'Queries Report',    icon: 'fact_check' },
  { key: 'referrals',        label: 'Referrals',         icon: 'handshake' },
  { key: 'govt_fees',        label: 'Govt Fees',         icon: 'account_balance' },
]

// ── Page shell ───────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const [tab, setTab] = useState<ReportTab>('performance')

  return (
    <div>
      <TopBar title="Reports" subtitle="Performance, payments, queries & referrals" />

      {/* Tab bar */}
      <div className="px-6 pt-4">
        <div className="flex gap-1 p-1 bg-white/10 rounded-xl w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all',
                tab === t.key
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              )}
            >
              <Sym name={t.icon} size={13} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'performance'      && <PerformanceTab />}
      {tab === 'pending_payments' && <PendingPaymentsTab />}
      {tab === 'queries'          && <QueriesTab />}
      {tab === 'referrals'        && <ReferralsTab />}
      {tab === 'govt_fees'        && <GovtFeesTab />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — Performance
// ══════════════════════════════════════════════════════════════════════════════

interface ExecRow { id: string; name: string; total: number; completed: number; onTime: number }

interface ReportData {
  period: string
  projects_total: number
  projects_closed: number
  on_time_rate: number
  avg_closure_days: number
  clock_employee_pct: number
  clock_client_pct: number
  clock_authority_pct: number
  exec_breakdown: ExecRow[]
}

async function computeReport(
  period: string,
  employeeId?: string,
  clientId?: string,
): Promise<ReportData> {
  const [year, month] = period.split('-').map(Number)
  const from = new Date(year, month - 1, 1).toISOString()
  const to   = new Date(year, month, 0, 23, 59, 59).toISOString()

  let closedQ = supabase
    .from('projects')
    .select('id, assigned_to, target_date, completed_date, active_clock, client_id')
    .eq('status', 'completed')
    .gte('completed_date', from.split('T')[0])
    .lte('completed_date', to.split('T')[0])

  let activeQ = supabase
    .from('projects')
    .select('id, active_clock, client_id')
    .in('status', ['active', 'on_hold'])
    .lte('created_at', to)

  if (employeeId) {
    closedQ = (closedQ as any).eq('assigned_to', employeeId)
    activeQ = (activeQ as any).eq('assigned_to', employeeId)
  }
  if (clientId) {
    closedQ = (closedQ as any).eq('client_id', clientId)
    activeQ = (activeQ as any).eq('client_id', clientId)
  }

  const [{ data: closed }, { data: active }] = await Promise.all([closedQ, activeQ])

  const closedArr = closed ?? []
  const activeArr = active ?? []

  const projectsClosed = closedArr.length
  const projectsTotal  = closedArr.length + activeArr.length

  const onTime = closedArr.filter((p: any) =>
    p.target_date && p.completed_date && p.completed_date <= p.target_date
  ).length
  const onTimeRate = projectsClosed ? Math.round((onTime / projectsClosed) * 100) : 0

  const closureDays = closedArr
    .map((p: any) => {
      if (!p.completed_date) return null
      const created   = new Date(p.target_date ?? p.completed_date)
      const completed = new Date(p.completed_date)
      return Math.max(0, Math.round((completed.getTime() - created.getTime()) / 86400000))
    })
    .filter((d: any): d is number => d !== null)
  const avgClosure = closureDays.length
    ? Math.round(closureDays.reduce((a: number, b: number) => a + b, 0) / closureDays.length)
    : 0

  const allProjects = [...closedArr, ...activeArr]
  const total       = allProjects.length || 1
  const empCount    = allProjects.filter((p: any) => p.active_clock === 'employee').length
  const cliCount    = allProjects.filter((p: any) => p.active_clock === 'client').length
  const authCount   = allProjects.filter((p: any) => p.active_clock === 'authority').length

  const execMap = new Map<string, ExecRow>()
  for (const p of closedArr as any[]) {
    if (!p.assigned_to) continue
    if (!execMap.has(p.assigned_to)) {
      execMap.set(p.assigned_to, { id: p.assigned_to, name: '', total: 0, completed: 0, onTime: 0 })
    }
    const row = execMap.get(p.assigned_to)!
    row.completed++
    row.total++
    if (p.target_date && p.completed_date && p.completed_date <= p.target_date) row.onTime++
  }

  const execIds = [...execMap.keys()]
  if (execIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', execIds)
    for (const p of profiles ?? []) {
      if (execMap.has(p.id)) execMap.get(p.id)!.name = p.name
    }
  }

  return {
    period,
    projects_total: projectsTotal,
    projects_closed: projectsClosed,
    on_time_rate: onTimeRate,
    avg_closure_days: avgClosure,
    clock_employee_pct: Math.round((empCount / total) * 100),
    clock_client_pct:   Math.round((cliCount  / total) * 100),
    clock_authority_pct:Math.round((authCount / total) * 100),
    exec_breakdown: [...execMap.values()].sort((a, b) => b.completed - a.completed),
  }
}

function PerformanceTab() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [period,           setPeriod]           = useState(periodOf(0))
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedClient,   setSelectedClient]   = useState('')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['perf_report_live', period, selectedEmployee, selectedClient],
    queryFn: () => computeReport(period, selectedEmployee || undefined, selectedClient || undefined),
    staleTime: 5 * 60 * 1000,
  })

  const { data: saved = [] } = useQuery({
    queryKey: ['saved_reports'],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('performance_reports')
        .select('*, profiles!performance_reports_generated_by_fkey(name)')
        .order('created_at', { ascending: false })
        .limit(12)
      return rows ?? []
    },
  })

  const { data: staffList = [] } = useQuery({
    queryKey: ['staff_list_for_filter'],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('profiles')
        .select('id, name')
        .in('role', ['executive', 'manager', 'director', 'super_admin', 'auditor', 'accounts'])
        .order('name')
      return rows ?? []
    },
    staleTime: 10 * 60 * 1000,
  })

  const { data: clientsList = [] } = useQuery({
    queryKey: ['clients_list_for_filter'],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('clients')
        .select('id, company_name')
        .order('company_name')
      return rows ?? []
    },
    staleTime: 10 * 60 * 1000,
  })

  const saveReport = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error('No data to save')
      const { error } = await supabase.from('performance_reports').insert({
        report_period:    data.period,
        projects_closed:  data.projects_closed,
        on_time_rate:     data.on_time_rate,
        avg_closure_days: data.avg_closure_days,
        revenue_paise:    0,
        generated_by:     profile!.id,
        report_data:      data as unknown as import('@/types/database').Json,
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Report saved'); qc.invalidateQueries({ queryKey: ['saved_reports'] }) },
    onError:   (e: Error) => toast.error('Save failed', e.message),
  })

  const PERIODS = Array.from({ length: 6 }, (_, i) => ({
    value: periodOf(-i),
    label: periodLabel(periodOf(-i)),
  }))

  const hasFilters = !!(selectedEmployee || selectedClient)

  return (
    <div className="p-6 space-y-6 animate-fade-up">

      {/* Period selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <Sym name="bar_chart" size={16} className="text-white/70" />
        <span className="text-sm font-medium text-white">Period:</span>
        <div className="flex gap-1.5 flex-wrap">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                period === p.value
                  ? 'bg-brand-600 text-white border-brand-700'
                  : 'border border-white/20 text-white hover:bg-white/10'
              )}
            >{p.label}</button>
          ))}
        </div>
        {isFetching && <Sym name="refresh" size={12} className="animate-spin text-white/70" />}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-border p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Employee</label>
          <select
            value={selectedEmployee}
            onChange={e => setSelectedEmployee(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 bg-white min-w-[180px]"
          >
            <option value="">All employees</option>
            {staffList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Client / Company</label>
          <select
            value={selectedClient}
            onChange={e => setSelectedClient(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 bg-white min-w-[200px]"
          >
            <option value="">All clients</option>
            {clientsList.map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
        </div>
        {hasFilters && (
          <button
            onClick={() => { setSelectedEmployee(''); setSelectedClient('') }}
            className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-[#F8FAFC] flex items-center gap-1.5"
          >
            <Sym name="close" size={13} /> Clear filters
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 glass-panel rounded-xl animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPI icon="check_circle" label="Projects Closed"  value={data.projects_closed} color="text-green-600" />
            <KPI icon="trending_up"  label="On-Time Rate"     value={`${data.on_time_rate}%`} color={data.on_time_rate >= 80 ? 'text-green-600' : data.on_time_rate >= 60 ? 'text-amber-600' : 'text-red-600'} />
            <KPI icon="schedule"     label="Avg Closure Days" value={`${data.avg_closure_days}d`} color="text-brand-600" />
          </div>

          {/* Clock distribution — 3 equal KPI cards */}
          <div>
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-3">Clock Distribution (Active Projects)</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="stat-card border-l-4 border-l-green-500">
                <p className="stat-label">🟢 Employee</p>
                <p className="stat-value text-green-600">{data.clock_employee_pct}%</p>
              </div>
              <div className="stat-card border-l-4 border-l-amber-400">
                <p className="stat-label">🟡 Client</p>
                <p className="stat-value text-amber-600">{data.clock_client_pct}%</p>
              </div>
              <div className="stat-card border-l-4 border-l-blue-500">
                <p className="stat-label">🔵 FSSAI</p>
                <p className="stat-value text-blue-600">{data.clock_authority_pct}%</p>
              </div>
            </div>
          </div>

          {/* Executive breakdown — Revenue column removed */}
          {data.exec_breakdown.length > 0 && (
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <Sym name="groups" size={14} className="text-muted-foreground" />
                <h3 className="text-sm font-semibold text-brand-950">Executive Breakdown</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F8FAFC]">
                    <tr className="text-left">
                      {['Executive', 'Closed', 'On-Time'].map(h => (
                        <th key={h} className="px-5 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.exec_breakdown.map(e => (
                      <tr key={e.id} className="hover:bg-[#F8FAFC]">
                        <td className="px-5 py-3 font-medium text-brand-950">{e.name || '—'}</td>
                        <td className="px-5 py-3">{e.completed}</td>
                        <td className="px-5 py-3">
                          <span className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium',
                            e.completed
                              ? e.onTime / e.completed >= 0.8 ? 'bg-green-100 text-green-700'
                              : e.onTime / e.completed >= 0.6 ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600'
                          )}>
                            {e.completed ? `${Math.round((e.onTime / e.completed) * 100)}%` : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Save button */}
          <div className="flex justify-end">
            <button
              onClick={() => saveReport.mutate()}
              disabled={saveReport.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              <Sym name="download" size={13} />
              {saveReport.isPending ? 'Saving…' : 'Save Report'}
            </button>
          </div>
        </>
      ) : null}

      {/* Saved reports archive */}
      {saved.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-brand-950">Saved Reports</h3>
          </div>
          <div className="divide-y divide-border">
            {saved.map((r: any) => (
              <div key={r.id} className="px-5 py-3 flex items-center gap-4 text-xs">
                <span className="font-medium text-brand-950 w-28">{periodLabel(r.report_period)}</span>
                <span className="text-muted-foreground">{r.projects_closed} closed</span>
                <span className="text-muted-foreground">{r.on_time_rate}% on-time</span>
                <span className="ml-auto text-[10px] text-muted-foreground/70">
                  by {(r as any).profiles?.name ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — Pending Payments
// ══════════════════════════════════════════════════════════════════════════════

function PendingPaymentsTab() {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['reports_pending_payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, project_code, service_type, quoted_amount, paid_amount, payment_status, created_at, clients(company_name)')
        .neq('payment_status', 'paid')
        .gt('quoted_amount', 0)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).filter(
        (p: any) => (p.quoted_amount ?? 0) > (p.paid_amount ?? 0)
      )
    },
    staleTime: 5 * 60 * 1000,
  })

  const totalPending = projects.reduce(
    (sum: number, p: any) => sum + ((p.quoted_amount ?? 0) - (p.paid_amount ?? 0)),
    0
  )

  if (isLoading) {
    return (
      <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 glass-panel rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 animate-fade-up">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPI icon="payments"       label="Projects Pending"  value={projects.length}  color="text-amber-600" />
        <KPI icon="currency_rupee" label="Total Outstanding" value={formatRupees(totalPending)} color="text-red-600" />
        <KPI icon="warning"        label="Overdue"           value={projects.filter((p: any) => p.payment_status === 'overdue').length} color="text-red-600" />
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <Sym name="check_circle" size={32} className="text-green-500 mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">All payments are up to date!</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Sym name="payments" size={14} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold text-brand-950">Pending Payment Projects</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left">
                  {['Client', 'Project', 'Service', 'Quoted', 'Received', 'Balance', 'Status'].map(h => (
                    <th key={h} className="px-5 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projects.map((p: any) => {
                  const balance   = (p.quoted_amount ?? 0) - (p.paid_amount ?? 0)
                  const isOverdue = p.payment_status === 'overdue'
                  return (
                    <tr key={p.id} className={cn('hover:bg-[#F8FAFC]', isOverdue && 'bg-red-50/40')}>
                      <td className="px-5 py-3 font-medium text-brand-950">{(p as any).clients?.company_name ?? '—'}</td>
                      <td className="px-5 py-3 font-mono text-muted-foreground">{p.project_code ?? '—'}</td>
                      <td className="px-5 py-3 text-muted-foreground capitalize">{(p.service_type ?? '—').replace(/_/g, ' ')}</td>
                      <td className="px-5 py-3 font-mono">{formatRupees(p.quoted_amount ?? 0)}</td>
                      <td className="px-5 py-3 font-mono text-green-700">{formatRupees(p.paid_amount ?? 0)}</td>
                      <td className="px-5 py-3 font-mono font-semibold text-red-600">{formatRupees(balance)}</td>
                      <td className="px-5 py-3">
                        <span className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium capitalize',
                          p.payment_status === 'overdue'  ? 'bg-red-100 text-red-700'
                            : p.payment_status === 'partial' ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-700'
                        )}>
                          {p.payment_status ?? 'pending'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — Queries Report (inline)
// ══════════════════════════════════════════════════════════════════════════════

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
    client: { company_name: string | null; state: string | null } | null
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

function QueriesTab() {
  const [fromDate,    setFromDate]    = useState('')
  const [toDate,      setToDate]      = useState('')
  const [company,     setCompany]     = useState('')
  const [stateFilter, setStateFilter] = useState('')

  const { data: rounds = [], isLoading } = useQuery({
    queryKey: ['queries-report'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('authority_queries')
        .select('*, points:query_points(id,response), project:projects(project_code, service_type, client:clients(company_name, state))')
        .order('received_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as QueryRoundRow[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const states = useMemo(() => {
    const set = new Set<string>()
    for (const r of rounds) {
      const s = r.project?.client?.state
      if (s) set.add(s)
    }
    return [...set].sort()
  }, [rounds])

  const filtered = useMemo(() => {
    const companyQ = company.trim().toLowerCase()
    return rounds.filter(r => {
      if (fromDate && r.received_date < fromDate) return false
      if (toDate   && r.received_date > toDate)   return false
      const name = r.project?.client?.company_name ?? ''
      if (companyQ && !name.toLowerCase().includes(companyQ)) return false
      if (stateFilter && (r.project?.client?.state ?? '') !== stateFilter) return false
      return true
    })
  }, [rounds, fromDate, toDate, company, stateFilter])

  const summary = useMemo(() => {
    let points = 0; let pending = 0; let overdue = 0
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
    return { rounds: filtered.length, points, pending, overdue, avgResponse }
  }, [filtered])

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
    <div className="p-6 space-y-6 animate-fade-up">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-border p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Received from</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Received to</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Company</label>
          <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="Search company…"
            className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Region (state)</label>
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 bg-white">
            <option value="">All regions</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {hasFilters && (
          <button onClick={() => { setFromDate(''); setToDate(''); setCompany(''); setStateFilter('') }}
            className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-[#F8FAFC] flex items-center gap-1.5">
            <Sym name="close" size={13} /> Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 glass-panel rounded-xl animate-pulse" />)}
        </div>
      ) : rounds.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <Sym name="fact_check" size={32} className="text-muted-foreground/50 mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">No FSSAI query rounds recorded yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KPI icon="fact_check" label="Total Rounds"  value={summary.rounds}              color="text-brand-600" />
            <KPI icon="list"       label="Query Points"  value={summary.points}              color="text-brand-600" />
            <KPI icon="pending"    label="Pending"       value={summary.pending}             color={summary.pending  ? 'text-amber-600' : 'text-green-600'} />
            <KPI icon="warning"    label="Overdue"       value={summary.overdue}             color={summary.overdue  ? 'text-red-600'   : 'text-green-600'} />
            <KPI icon="schedule"   label="Avg Response"  value={`${summary.avgResponse}d`}  color="text-brand-600" />
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-border p-12 text-center">
              <Sym name="filter_alt_off" size={28} className="text-muted-foreground/50 mx-auto" />
              <p className="text-sm text-muted-foreground mt-3">No rounds match the current filters.</p>
            </div>
          ) : (
            <>
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
                              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
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

              {/* Detail table */}
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
                              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
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
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4 — Referrals
// ══════════════════════════════════════════════════════════════════════════════

function ReferralsTab() {
  const { data: referrals = [], isLoading } = useReferralBreakdown()
  const upsert = useUpsertReferral()
  const [editing, setEditing] = useState<Partial<ReferralBreakdown> | null>(null)
  const [open,    setOpen]    = useState<string | null>(null)

  const save = async () => {
    if (!editing?.name?.trim()) { toast.error('Referral name is required'); return }
    try {
      await upsert.mutateAsync({
        id: editing.id, name: editing.name.trim(),
        contact_person: editing.contact_person || null, phone: editing.phone || null,
        email: editing.email || null, notes: editing.notes || null,
      } as any)
      toast.success(editing.id ? 'Referral updated' : 'Referral added')
      setEditing(null)
    } catch (e: any) { toast.error('Failed', e.message) }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-2 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-16 glass-panel rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="p-6 animate-fade-up space-y-5">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing({ name: '' })}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
        >
          <Sym name="add" size={16} /> Add Referral
        </button>
      </div>

      {referrals.length === 0 ? (
        <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
          <Sym name="handshake" size={32} className="mx-auto text-white/40 mb-3" />
          <p className="text-sm text-white/60">No referrals yet. Add your first referral source.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {referrals.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-4 p-5">
                <div className="w-10 h-10 rounded-xl bg-brand-600/10 flex items-center justify-center shrink-0">
                  <Sym name="handshake" size={18} className="text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-brand-950">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.contact_person ? `${r.contact_person} · ` : ''}{r.phone ?? ''}{r.email ? ` · ${r.email}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-display font-bold text-brand-950">{formatRupees(r.total_received)}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {r.clients.length} client{r.clients.length !== 1 ? 's' : ''} · received
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditing(r)} className="p-1.5 text-muted-foreground hover:text-brand-600" title="Edit">
                    <Sym name="edit" size={14} />
                  </button>
                  {r.clients.length > 0 && (
                    <button onClick={() => setOpen(open === r.id ? null : r.id)} className="p-1.5 text-muted-foreground hover:text-brand-600">
                      <Sym name={open === r.id ? 'expand_less' : 'expand_more'} size={16} />
                    </button>
                  )}
                </div>
              </div>
              {open === r.id && r.clients.length > 0 && (
                <div className="border-t border-border bg-[#F8FAFC] px-5 py-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        <th className="text-left py-1">Client</th>
                        <th className="text-right py-1">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.clients.map((c: any) => (
                        <tr key={c.id}>
                          <td className="py-1 text-brand-950">{c.company_name}</td>
                          <td className="py-1 text-right font-mono text-muted-foreground">{formatRupees(c.received)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {editing !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-brand-950">{editing.id ? 'Edit Referral' : 'New Referral'}</h2>
            {[
              { field: 'name',           label: 'Name *',         type: 'text',  placeholder: 'Referral source name' },
              { field: 'contact_person', label: 'Contact Person', type: 'text',  placeholder: 'Primary contact' },
              { field: 'phone',          label: 'Phone',          type: 'tel',   placeholder: '+91 98765 43210' },
              { field: 'email',          label: 'Email',          type: 'email', placeholder: 'email@example.com' },
              { field: 'notes',          label: 'Notes',          type: 'text',  placeholder: 'Any notes…' },
            ].map(({ field, label, type, placeholder }) => (
              <div key={field}>
                <label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>
                <input
                  type={type}
                  value={(editing as any)[field] ?? ''}
                  onChange={e => setEditing(prev => ({ ...prev, [field]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                />
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <button onClick={save} disabled={upsert.isPending}
                className="flex-1 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {upsert.isPending ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(null)}
                className="flex-1 py-2 border border-border text-sm font-medium rounded-lg hover:bg-[#F8FAFC]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 5 — Govt Fees
// ══════════════════════════════════════════════════════════════════════════════

interface GovtFeeRow {
  id: string
  amount: number
  payment_date: string
  payment_mode: string
  notes: string | null
  projects: { project_code: string | null; project_name: string | null } | null
  clients:  { company_name: string | null } | null
}

function GovtFeesTab() {
  const [paidByFilter, setPaidByFilter] = useState<'all' | 'Client' | 'TPS'>('all')
  const [fromDate,     setFromDate]     = useState('')
  const [toDate,       setToDate]       = useState('')
  const [company,      setCompany]      = useState('')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['govt_fees_report'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('payments')
        .select(`
          id, amount, payment_date, payment_mode, notes,
          projects(project_code, project_name),
          clients(company_name)
        `)
        .in('payment_mode', ['Client-paid', 'TPS-paid'])
        .order('payment_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as GovtFeeRow[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (paidByFilter === 'Client' && r.payment_mode !== 'Client-paid') return false
      if (paidByFilter === 'TPS'    && r.payment_mode !== 'TPS-paid')    return false
      if (fromDate && r.payment_date < fromDate) return false
      if (toDate   && r.payment_date > toDate)   return false
      if (company) {
        const name = r.clients?.company_name?.toLowerCase() ?? ''
        if (!name.includes(company.toLowerCase())) return false
      }
      return true
    })
  }, [rows, paidByFilter, fromDate, toDate, company])

  const totalByClient = filtered.filter(r => r.payment_mode === 'Client-paid').reduce((s, r) => s + r.amount / 100, 0)
  const totalByTPS    = filtered.filter(r => r.payment_mode === 'TPS-paid').reduce((s, r) => s + r.amount / 100, 0)

  return (
    <div className="p-6 space-y-5 animate-fade-up">

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPI icon="account_balance" label="Total Entries"  value={filtered.length}             color="text-brand-600" />
        <KPI icon="person"          label="Paid by Client" value={formatRupees(totalByClient)} color="text-green-600" />
        <KPI icon="business"        label="Paid by TPS"    value={formatRupees(totalByTPS)}    color="text-amber-600" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-border p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Paid By</label>
            <select
              value={paidByFilter}
              onChange={e => setPaidByFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            >
              <option value="all">All</option>
              <option value="Client">Client</option>
              <option value="TPS">TPS</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Company</label>
            <input
              type="text"
              placeholder="Filter by company…"
              value={company}
              onChange={e => setCompany(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </div>
        </div>
        {(paidByFilter !== 'all' || company || fromDate || toDate) && (
          <button
            onClick={() => { setPaidByFilter('all'); setCompany(''); setFromDate(''); setToDate('') }}
            className="mt-3 text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
          >
            <Sym name="close" size={12} /> Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-white rounded-xl border border-border animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <Sym name="account_balance" size={32} className="text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">No govt fee records found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sym name="account_balance" size={14} className="text-muted-foreground" />
              <h3 className="text-sm font-semibold text-brand-950">Govt Fee Payments</h3>
            </div>
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left">
                  {['Company', 'Project', 'Date', 'Amount', 'Paid By', 'Stage'].map(h => (
                    <th key={h} className="px-5 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(r => {
                  const byTPS = r.payment_mode === 'TPS-paid'
                  return (
                    <tr key={r.id} className={cn('hover:bg-[#F8FAFC]', byTPS && 'bg-amber-50/30')}>
                      <td className="px-5 py-3 font-medium text-brand-950">{r.clients?.company_name ?? '—'}</td>
                      <td className="px-5 py-3 font-mono text-muted-foreground text-[11px]">{r.projects?.project_code ?? '—'}</td>
                      <td className="px-5 py-3 text-muted-foreground">{r.payment_date}</td>
                      <td className="px-5 py-3 font-mono font-semibold text-brand-950">{formatRupees(r.amount / 100)}</td>
                      <td className="px-5 py-3">
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-semibold',
                          byTPS ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                        )}>
                          {byTPS ? 'TPS' : 'Client'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground max-w-[200px] truncate">{r.notes ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
