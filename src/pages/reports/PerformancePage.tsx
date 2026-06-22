import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { formatRupees, cn } from '@/lib/utils'
import { BarChart3, Download, RefreshCw, CheckCircle, Clock, TrendingUp, Users } from 'lucide-react'

// Derive a period string for the given month offset (0 = current, -1 = last, etc.)
function periodOf(monthOffset: number) {
  const d = new Date()
  d.setMonth(d.getMonth() + monthOffset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function periodLabel(period: string) {
  const [y, m] = period.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

interface ExecRow {
  id: string
  name: string
  total: number
  completed: number
  onTime: number
  revenue: number
}

interface ReportData {
  period: string
  projects_total: number
  projects_closed: number
  on_time_rate: number
  avg_closure_days: number
  revenue_paise: number
  clock_employee_pct: number
  clock_client_pct: number
  clock_authority_pct: number
  exec_breakdown: ExecRow[]
}

async function computeReport(period: string): Promise<ReportData> {
  const [year, month] = period.split('-').map(Number)
  const from = new Date(year, month - 1, 1).toISOString()
  const to   = new Date(year, month, 0, 23, 59, 59).toISOString()

  // Completed projects in the period
  const { data: closed } = await supabase
    .from('projects')
    .select('id, assigned_to, target_date, completed_date, paid_amount, quoted_amount, active_clock')
    .eq('status', 'completed')
    .gte('completed_date', from.split('T')[0])
    .lte('completed_date', to.split('T')[0])

  // Active projects created before end of period
  const { data: active } = await supabase
    .from('projects')
    .select('id, active_clock')
    .in('status', ['active', 'on_hold'])
    .lte('created_at', to)

  // Revenue collected in the period (payments table)
  const { data: payments } = await supabase
    .from('payments')
    .select('amount, project_id')
    .gte('payment_date', from.split('T')[0])
    .lte('payment_date', to.split('T')[0])

  const closedArr  = closed ?? []
  const activeArr  = active ?? []
  const payArr     = payments ?? []

  const projectsClosed = closedArr.length
  const projectsTotal  = closedArr.length + activeArr.length

  // On-time: completed on or before target_date
  const onTime = closedArr.filter(p =>
    p.target_date && p.completed_date && p.completed_date <= p.target_date
  ).length
  const onTimeRate = projectsClosed ? Math.round((onTime / projectsClosed) * 100) : 0

  // Average closure days
  const closureDays = closedArr
    .map(p => {
      if (!p.completed_date) return null
      const created = new Date(p.target_date ?? p.completed_date)
      const completed = new Date(p.completed_date)
      return Math.max(0, Math.round((completed.getTime() - created.getTime()) / 86400000))
    })
    .filter((d): d is number => d !== null)
  const avgClosure = closureDays.length
    ? Math.round(closureDays.reduce((a, b) => a + b, 0) / closureDays.length)
    : 0

  const revenuePaise = payArr.reduce((sum, p) => sum + (p.amount ?? 0), 0)

  // Clock distribution across all active projects
  const allProjects = [...closedArr, ...activeArr]
  const empCount  = allProjects.filter(p => p.active_clock === 'employee').length
  const cliCount  = allProjects.filter(p => p.active_clock === 'client').length
  const authCount = allProjects.filter(p => p.active_clock === 'authority').length
  const total     = allProjects.length || 1

  // Per-executive breakdown
  const execMap = new Map<string, ExecRow>()
  for (const p of closedArr) {
    if (!p.assigned_to) continue
    if (!execMap.has(p.assigned_to)) {
      execMap.set(p.assigned_to, { id: p.assigned_to, name: '', total: 0, completed: 0, onTime: 0, revenue: 0 })
    }
    const row = execMap.get(p.assigned_to)!
    row.completed++
    row.total++
    if (p.target_date && p.completed_date && p.completed_date <= p.target_date) row.onTime++
  }
  // Add revenue
  for (const pay of payArr) {
    const proj = closedArr.find(p => p.id === pay.project_id)
    if (proj?.assigned_to && execMap.has(proj.assigned_to)) {
      execMap.get(proj.assigned_to)!.revenue += pay.amount
    }
  }
  // Resolve names
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
    revenue_paise: revenuePaise,
    clock_employee_pct: Math.round((empCount / total) * 100),
    clock_client_pct:   Math.round((cliCount  / total) * 100),
    clock_authority_pct:Math.round((authCount / total) * 100),
    exec_breakdown: [...execMap.values()].sort((a, b) => b.completed - a.completed),
  }
}

export default function PerformancePage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [period, setPeriod] = useState(periodOf(0))

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['perf_report_live', period],
    queryFn: () => computeReport(period),
    staleTime: 5 * 60 * 1000,
  })

  // Saved reports
  const { data: saved = [] } = useQuery({
    queryKey: ['saved_reports'],
    queryFn: async () => {
      const { data } = await supabase
        .from('performance_reports')
        .select('*, profiles!performance_reports_generated_by_fkey(name)')
        .order('created_at', { ascending: false })
        .limit(12)
      return data ?? []
    },
  })

  const saveReport = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error('No data to save')
      const { error } = await supabase.from('performance_reports').insert({
        report_period:   data.period,
        projects_closed: data.projects_closed,
        on_time_rate:    data.on_time_rate,
        avg_closure_days:data.avg_closure_days,
        revenue_paise:   data.revenue_paise,
        generated_by:    profile!.id,
        report_data:     data as unknown as import('@/types/database').Json,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Report saved')
      qc.invalidateQueries({ queryKey: ['saved_reports'] })
    },
    onError: (e: Error) => toast.error('Save failed', e.message),
  })

  const PERIODS = Array.from({ length: 6 }, (_, i) => ({
    value: periodOf(-i),
    label: periodLabel(periodOf(-i)),
  }))

  return (
    <div>
      <TopBar title="Performance Reports" subtitle="Monthly project & revenue metrics" />

      <div className="p-6 space-y-6 animate-fade-up">

        {/* Period selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <BarChart3 size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium text-brand-950">Period:</span>
          <div className="flex gap-1.5 flex-wrap">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                  period === p.value
                    ? 'bg-brand-600 text-white border-brand-700'
                    : 'bg-white text-muted-foreground border-border hover:border-brand-300'
                )}
              >{p.label}</button>
            ))}
          </div>
          {isFetching && <RefreshCw size={12} className="animate-spin text-muted-foreground" />}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-white rounded-xl border border-border animate-pulse" />
            ))}
          </div>
        ) : data ? (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPI icon={CheckCircle} label="Projects Closed"   value={data.projects_closed} color="text-green-600" />
              <KPI icon={TrendingUp}  label="On-Time Rate"      value={`${data.on_time_rate}%`} color={data.on_time_rate >= 80 ? 'text-green-600' : data.on_time_rate >= 60 ? 'text-amber-600' : 'text-red-600'} />
              <KPI icon={Clock}       label="Avg Closure Days"  value={`${data.avg_closure_days}d`} color="text-brand-600" />
              <KPI icon={BarChart3}   label="Revenue Collected" value={formatRupees(data.revenue_paise)} color="text-brand-600" />
            </div>

            {/* Clock distribution */}
            <div className="bg-white rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold text-brand-950 mb-4">Clock Distribution (Active Projects)</h3>
              <div className="space-y-3">
                <ClockBar label="🟢 Employee" pct={data.clock_employee_pct}  color="bg-clock-employee" />
                <ClockBar label="🟡 Client"   pct={data.clock_client_pct}    color="bg-clock-client" />
                <ClockBar label="🔵 FSSAI"    pct={data.clock_authority_pct} color="bg-clock-authority" />
              </div>
            </div>

            {/* Executive breakdown */}
            {data.exec_breakdown.length > 0 && (
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <Users size={14} className="text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-brand-950">Executive Breakdown</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#F8FAFC]">
                      <tr className="text-left">
                        {['Executive','Closed','On-Time','Revenue'].map(h => (
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
                          <td className="px-5 py-3 font-mono">{formatRupees(e.revenue)}</td>
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
                <Download size={13} />
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
                  <span className="font-mono text-muted-foreground">{formatRupees(r.revenue_paise)}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/70">
                    by {(r as any).profiles?.name ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function KPI({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2">
        <Icon size={13} className={color} />
        <p className="stat-label">{label}</p>
      </div>
      <p className={cn('stat-value', color)}>{value}</p>
    </div>
  )
}

function ClockBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[#F8FAFC] rounded-full overflow-hidden border border-border">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-brand-950 w-8 text-right">{pct}%</span>
    </div>
  )
}
