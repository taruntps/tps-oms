// HRMS — Performance Reports (/hrms/performance/reports), gate hrms.performance.view.
// Per-cycle final-rating distribution (bucketed) + goals-progress summary + per-stage
// review completion counts. Aggregated by getCycleReport (getBalanceMatrix-style helper).
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCycles, useCycleReport } from '../hooks/usePerformance'
import type { ReviewStage } from '../api/performance'

const STAGES: { key: ReviewStage; label: string }[] = [
  { key: 'self', label: 'Self' },
  { key: 'manager', label: 'Manager' },
  { key: 'calibration', label: 'Calibration' },
  { key: 'final', label: 'Final' },
]

export default function PerformanceReportsPage() {
  const { data: cycles = [], isLoading: lc } = useCycles()
  const [cycleId, setCycleId] = useState('')
  const selectedCycle = cycleId || (cycles[0]?.id ?? '')

  const { data: report, isLoading: lr } = useCycleReport(selectedCycle)

  const maxRating = useMemo(() => Math.max(1, ...(report?.ratings.map(r => r.count) ?? [1])), [report])

  const g = report?.goals
  const goalCards = [
    { label: 'Total', value: g?.total ?? 0, tone: 'text-brand-950' },
    { label: 'Achieved', value: g?.achieved ?? 0, tone: 'text-green-700' },
    { label: 'Partial', value: g?.partial ?? 0, tone: 'text-amber-700' },
    { label: 'Active', value: g?.active ?? 0, tone: 'text-blue-700' },
    { label: 'Dropped', value: g?.dropped ?? 0, tone: 'text-slate-500' },
  ]

  return (
    <div>
      <TopBar title="Performance Reports" subtitle="Ratings distribution & goals progress" />

      <div className="p-6 animate-fade-up space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-brand-950">Review cycle</label>
          <select
            value={selectedCycle}
            onChange={e => setCycleId(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
          >
            {cycles.length === 0 && <option value="">No cycles</option>}
            {cycles.map(c => (
              <option key={c.id} value={c.id}>{c.name} · {c.type} · {c.status}</option>
            ))}
          </select>
        </div>

        {lc || lr ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : !selectedCycle || !report ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="bar_chart" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No review cycle available yet.</p>
          </div>
        ) : (
          <>
            {/* Goals progress */}
            <section>
              <h3 className="text-sm font-semibold text-brand-950 mb-3">Goals Progress</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {goalCards.map(c => (
                  <div key={c.label} className="bg-white rounded-xl border border-border p-4">
                    <p className={`text-2xl font-display font-semibold ${c.tone}`}>{c.value}</p>
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Ratings distribution */}
            <section>
              <h3 className="text-sm font-semibold text-brand-950 mb-3">
                Final-Rating Distribution
                <span className="ml-2 text-xs font-normal text-muted-foreground">{report.employeesFinalised} finalised</span>
              </h3>
              <div className="bg-white rounded-xl border border-border p-5">
                {report.employeesFinalised === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No final ratings submitted yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {report.ratings.map(r => (
                      <div key={r.bucket} className="flex items-center gap-3">
                        <span className="w-16 text-xs text-muted-foreground text-right">{r.bucket}</span>
                        <div className="flex-1 bg-[#F8FAFC] rounded-full h-6 overflow-hidden border border-border">
                          <div
                            className="h-full bg-brand-600 rounded-full transition-all flex items-center justify-end pr-2"
                            style={{ width: `${Math.max(r.count > 0 ? 8 : 0, (r.count / maxRating) * 100)}%` }}
                          >
                            {r.count > 0 && <span className="text-[10px] font-medium text-white">{r.count}</span>}
                          </div>
                        </div>
                        <span className="w-8 text-xs text-muted-foreground">{r.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Review completion by stage */}
            <section>
              <h3 className="text-sm font-semibold text-brand-950 mb-3">Reviews Submitted by Stage</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {STAGES.map(s => (
                  <div key={s.key} className="bg-white rounded-xl border border-border p-4">
                    <p className="text-2xl font-display font-semibold text-brand-950">{report.reviewsByStage[s.key]}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
