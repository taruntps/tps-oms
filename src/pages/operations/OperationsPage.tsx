import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { ClockBadge } from '@/components/shared/ClockBadge'
import { useActiveProjects, useBlockRequestInbox } from '@/hooks/useDashboard'
import { useApproveBlockRequest } from '@/hooks/useProjects'
import { toast } from '@/components/shared/Toast'
import { formatDate, daysUntil, cn } from '@/lib/utils'

const CLOCK_TABS = [
  { key: 'all',       label: 'All Active' },
  { key: 'employee',  label: '🟢 Employee' },
  { key: 'client',    label: '🟡 Client' },
  { key: 'authority', label: '🔵 FSSAI' },
] as const

import { useState } from 'react'

type ClockFilter = 'all' | 'employee' | 'client' | 'authority'

export default function OperationsPage() {
  const navigate = useNavigate()
  const { data: projects = [], isLoading: loadingProjects } = useActiveProjects()
  const { data: blockRequests = [], isLoading: loadingBlocks } = useBlockRequestInbox()
  const approveBlock = useApproveBlockRequest()
  const [clockFilter, setClockFilter] = useState<ClockFilter>('all')

  const filtered = clockFilter === 'all' ? projects : projects.filter(p => p.active_clock === clockFilter)

  const handleApprove = async (requestId: string, approved: boolean, projectId: string) => {
    try {
      await approveBlock.mutateAsync({ requestId, approved, projectId })
      toast.success(approved ? 'Block approved' : 'Request rejected')
    } catch (err: any) {
      toast.error('Failed', err.message)
    }
  }

  // Clock summary counts
  const counts = {
    employee:  projects.filter(p => p.active_clock === 'employee').length,
    client:    projects.filter(p => p.active_clock === 'client').length,
    authority: projects.filter(p => p.active_clock === 'authority').length,
    blocked:   projects.filter(p => p.is_blocked).length,
  }

  return (
    <div>
      <TopBar title="Operations" subtitle="Active project overview" />

      <div className="p-6 space-y-6 animate-fade-up">

        {/* ── Clock summary strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Employee Clock" value={counts.employee} color="green"  detail="Work in our hands" />
          <SummaryCard label="Client Pending" value={counts.client}   color="amber"  detail="Awaiting client action" />
          <SummaryCard label="FSSAI Pending"  value={counts.authority} color="blue"  detail="Waiting on authority" />
          <SummaryCard label="Blocked"        value={counts.blocked}  color="red"    detail="Needs manager action" />
        </div>

        {/* ── Block request inbox ── */}
        {(blockRequests.length > 0 || loadingBlocks) && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-amber-500" />
              <h2 className="font-display font-semibold text-brand-950 text-sm">Block Request Inbox</h2>
              <span className="text-[11px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                {blockRequests.length} pending
              </span>
            </div>
            <div className="space-y-2">
              {blockRequests.map(req => (
                <div key={req.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => navigate(`/projects/${(req as any).projects?.id}`)}
                          className="font-mono text-xs text-brand-600 hover:underline"
                        >
                          {(req as any).projects?.project_code}
                        </button>
                        <span className="text-xs text-brand-950 font-medium">{(req as any).projects?.project_name}</span>
                      </div>
                      <p className="text-xs text-amber-800 mt-1">
                        <strong>{(req as any).profiles?.name}</strong> — {req.block_type.replace(/_/g, ' ')}: {req.reason}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Requested {formatDate(req.requested_at)}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleApprove(req.id, true, (req as any).projects?.id)}
                        disabled={approveBlock.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        <CheckCircle size={11} />
                        Approve
                      </button>
                      <button
                        onClick={() => handleApprove(req.id, false, (req as any).projects?.id)}
                        disabled={approveBlock.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 border border-border bg-white text-xs rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50"
                      >
                        <XCircle size={11} />
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Project list with clock filter ── */}
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-display font-semibold text-brand-950 text-sm">Active Projects</h2>
            <div className="flex gap-1 bg-[#F8FAFC] p-1 rounded-lg border border-border">
              {CLOCK_TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setClockFilter(t.key)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-md transition-all',
                    clockFilter === t.key ? 'bg-white text-brand-950 shadow-sm' : 'text-muted-foreground hover:text-brand-950'
                  )}
                >
                  {t.label}
                  <span className="ml-1 text-[10px] opacity-60">
                    {t.key === 'all' ? projects.length : projects.filter(p => p.active_clock === t.key).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {loadingProjects ? (
            <div className="space-y-2 animate-pulse">
              {[1,2,3,4].map(i => <div key={i} className="h-20 bg-white rounded-xl border border-border" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">No projects in this clock state.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(p => {
                const days = daysUntil(p.target_date)
                const isOverdue = days !== null && days < 0
                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="bg-white rounded-xl border border-border p-4 cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[11px] text-muted-foreground">{p.project_code}</span>
                          {p.is_blocked && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">BLOCKED</span>}
                          {p.service_type && <span className="text-[10px] bg-[#F8FAFC] border border-border px-1.5 py-0.5 rounded">{p.service_type}</span>}
                        </div>
                        <p className="text-sm font-medium text-brand-950 mt-0.5">{p.project_name}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <span>{(p as any).clients?.company_name}</span>
                          {(p as any).profiles_assigned && <span>→ {(p as any).profiles_assigned.name}</span>}
                          {p.target_date && (
                            <span className={cn('font-medium', isOverdue ? 'text-red-600' : days !== null && days <= 7 ? 'text-amber-600' : '')}>
                              {isOverdue ? `${Math.abs(days!)}d overdue` : `Due ${formatDate(p.target_date)}`}
                            </span>
                          )}
                        </div>
                      </div>
                      {p.active_clock && p.clock_switched_at && (
                        <ClockBadge clock={p.active_clock} since={p.clock_switched_at} isBlocked={p.is_blocked ?? false} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color, detail }: { label: string; value: number; color: 'green' | 'amber' | 'blue' | 'red'; detail: string }) {
  const cls = {
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    blue:  'bg-blue-50 border-blue-200 text-blue-700',
    red:   'bg-red-50 border-red-200 text-red-700',
  }[color]
  return (
    <div className={cn('rounded-xl border p-4', cls)}>
      <p className="text-3xl font-display font-bold">{value}</p>
      <p className="text-xs font-semibold mt-1">{label}</p>
      <p className="text-[11px] opacity-70 mt-0.5">{detail}</p>
    </div>
  )
}
