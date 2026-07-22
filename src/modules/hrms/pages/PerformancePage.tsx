// HRMS — Performance (/hrms/performance), gate hrms.performance.view.
// Cycles overview; for a selected cycle, all employees with their goal count and
// per-stage review status. Managers (hrms.performance.review.manager) submit the
// manager-stage review for an employee. Single-level (stage + reviewer_id + status).
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useAuth } from '@/contexts/AuthContext'
import { useCan } from '@/core/access/useCan'
import { useEmployees } from '../hooks/useEmployees'
import {
  useCycles,
  useCycleGoals,
  useCycleReviews,
  useSaveReview,
} from '../hooks/usePerformance'
import { StatusPill, fmtRating, inputCls, parseRating } from './performanceShared'
import type { Review, ReviewStage } from '../api/performance'

export default function PerformancePage() {
  const { user } = useAuth()
  const canManager = useCan('hrms.performance.review.manager')

  const { data: cycles = [], isLoading: lc } = useCycles()
  const [cycleId, setCycleId] = useState('')
  const selectedCycle = cycleId || (cycles[0]?.id ?? '')

  const { data: employees = [], isLoading: le } = useEmployees()
  const { data: goals = [] } = useCycleGoals(selectedCycle)
  const { data: reviews = [] } = useCycleReviews(selectedCycle)

  const goalCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of goals) m.set(g.employee_id, (m.get(g.employee_id) ?? 0) + 1)
    return m
  }, [goals])

  // review lookup: `${employeeId}|${stage}` → Review
  const reviewOf = useMemo(() => {
    const m = new Map<string, Review>()
    for (const r of reviews) m.set(`${r.employee_id}|${r.stage}`, r)
    return m
  }, [reviews])

  const [editing, setEditing] = useState<{ employeeId: string; name: string } | null>(null)

  const stagePill = (employeeId: string, stage: ReviewStage) => {
    const r = reviewOf.get(`${employeeId}|${stage}`)
    return r ? <StatusPill status={r.status} /> : <span className="text-[11px] text-muted-foreground">—</span>
  }

  return (
    <div>
      <TopBar title="Performance" subtitle="Cycle overview, goals coverage & review status" />

      <div className="p-6 animate-fade-up space-y-5">
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

        {lc || le ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : !selectedCycle ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="insights" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No review cycle available yet.</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">No employees.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-3 py-3 font-medium text-center">Goals</th>
                  <th className="px-3 py-3 font-medium text-center">Self</th>
                  <th className="px-3 py-3 font-medium text-center">Manager</th>
                  <th className="px-3 py-3 font-medium text-center">Calibration</th>
                  <th className="px-3 py-3 font-medium text-center">Final</th>
                  <th className="px-3 py-3 font-medium text-center">Final Rating</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(e => {
                  const final = reviewOf.get(`${e.id}|final`)
                  return (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-brand-950">{e.name || '—'}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{e.employee_code || ''}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center text-muted-foreground">{goalCount.get(e.id) ?? 0}</td>
                      <td className="px-3 py-2.5 text-center">{stagePill(e.id, 'self')}</td>
                      <td className="px-3 py-2.5 text-center">{stagePill(e.id, 'manager')}</td>
                      <td className="px-3 py-2.5 text-center">{stagePill(e.id, 'calibration')}</td>
                      <td className="px-3 py-2.5 text-center">{stagePill(e.id, 'final')}</td>
                      <td className="px-3 py-2.5 text-center font-semibold text-brand-950">{fmtRating(final?.rating)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {canManager && (
                          <button onClick={() => setEditing({ employeeId: e.id, name: e.name || '—' })} className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-white ml-auto">
                            <Sym name="rate_review" size={13} /> Manager Review
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && canManager && selectedCycle && user?.id && (
        <ManagerReviewModal
          employeeId={editing.employeeId}
          employeeName={editing.name}
          cycleId={selectedCycle}
          reviewerId={user.id}
          existing={reviewOf.get(`${editing.employeeId}|manager`)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ManagerReviewModal({
  employeeId, employeeName, cycleId, reviewerId, existing, onClose,
}: {
  employeeId: string
  employeeName: string
  cycleId: string
  reviewerId: string
  existing: Review | undefined
  onClose: () => void
}) {
  const save = useSaveReview(reviewerId)
  const [rating, setRating] = useState(existing?.rating != null ? String(existing.rating) : '')
  const [comments, setComments] = useState(existing?.comments ?? '')

  const doSave = (submit: boolean) => {
    save.mutate(
      {
        input: {
          employee_id: employeeId,
          cycle_id: cycleId,
          stage: 'manager',
          rating: parseRating(rating),
          comments: comments.trim() || null,
        },
        submit,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-display font-semibold text-brand-950">Manager Review</h2>
            <p className="text-xs text-muted-foreground">{employeeName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {existing?.status === 'submitted' && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              A manager review is already submitted. Re-submitting overwrites it.
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Manager rating (0–5)</label>
            <input type="number" min={0} max={5} step={0.1} value={rating} onChange={e => setRating(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Comments</label>
            <textarea rows={5} value={comments} onChange={e => setComments(e.target.value)} className={inputCls} placeholder="Assessment against goals, strengths, development areas…" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={() => doSave(false)} disabled={save.isPending} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">Save Draft</button>
          <button onClick={() => doSave(true)} disabled={save.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Submit</button>
        </div>
      </div>
    </div>
  )
}
