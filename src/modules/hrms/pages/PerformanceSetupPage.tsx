// HRMS — Performance Cycles & Setup (/hrms/performance/cycles), gate hrms.performance.manage.
// Cycle CRUD + status transitions; for a selected cycle + employee: manage goals
// (KRA/KPI/goal), run the calibration & final ratings, and raise increment/promotion
// recommendations. Approving a recommendation is additionally gated by
// hrms.performance.recommend.approve. salary_revision_id stays null for M4 to link.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useCan } from '@/core/access/useCan'
import { useEmployees } from '../hooks/useEmployees'
import {
  useCycles,
  useCreateCycle,
  useSetCycleStatus,
  useGoals,
  useCreateGoal,
  useSetGoalStatus,
  useDeleteGoal,
  useReviews,
  useSaveReview,
  useRecommendations,
  useCreateRecommendation,
  useDecideRecommendation,
} from '../hooks/usePerformance'
import { StatusPill, CategoryPill, fmtRating, inputCls, parseRating } from './performanceShared'
import type {
  CycleInput, CycleStatus, CycleType, GoalCategory, Review, ReviewStage, RecommendationType,
} from '../api/performance'

const CYCLE_STATUSES: CycleStatus[] = ['open', 'in_review', 'calibration', 'closed']

export default function PerformanceSetupPage() {
  const canManage = useCan('hrms.performance.manage')

  const { data: cycles = [], isLoading: lc } = useCycles()
  const [cycleId, setCycleId] = useState('')
  const selectedCycle = cycleId || (cycles[0]?.id ?? '')
  const cycle = useMemo(() => cycles.find(c => c.id === selectedCycle), [cycles, selectedCycle])

  const [showCycleForm, setShowCycleForm] = useState(false)
  const setStatus = useSetCycleStatus()

  const { data: employees = [] } = useEmployees()
  const [employeeId, setEmployeeId] = useState('')

  return (
    <div>
      <TopBar title="Performance Cycles" subtitle="Cycles, goals, calibration & recommendations" />

      <div className="p-6 animate-fade-up space-y-6">
        {/* Cycles */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-brand-950">Review Cycles</h3>
            {canManage && (
              <button onClick={() => setShowCycleForm(true)} className="flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700">
                <Sym name="add" size={14} /> New Cycle
              </button>
            )}
          </div>
          {lc ? (
            <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-12 bg-white rounded-lg border border-border animate-pulse" />)}</div>
          ) : cycles.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">No review cycles yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Period</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Advance</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map(c => (
                    <tr
                      key={c.id}
                      className={`border-b border-border last:border-0 cursor-pointer ${c.id === selectedCycle ? 'bg-brand-50' : 'hover:bg-[#F8FAFC]'}`}
                      onClick={() => setCycleId(c.id)}
                    >
                      <td className="px-4 py-3 font-medium text-brand-950">{c.name}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{c.type}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.period_start ? formatDate(c.period_start) : '—'} – {c.period_end ? formatDate(c.period_end) : '—'}
                      </td>
                      <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                      <td className="px-4 py-3" onClick={ev => ev.stopPropagation()}>
                        {canManage ? (
                          <select
                            value={c.status}
                            onChange={e => setStatus.mutate({ id: c.id, status: e.target.value as CycleStatus })}
                            disabled={setStatus.isPending}
                            className="ml-auto block px-2 py-1 text-xs border border-border rounded-lg bg-white"
                          >
                            {CYCLE_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                          </select>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Employee-scoped setup */}
        {selectedCycle && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-semibold text-brand-950">
                Setup · <span className="text-brand-700">{cycle?.name}</span>
              </h3>
              <select
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              >
                <option value="">Select employee…</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name || e.employee_code || e.id}</option>
                ))}
              </select>
            </div>

            {employeeId ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <GoalsPanel cycleId={selectedCycle} employeeId={employeeId} canManage={canManage} />
                <div className="space-y-4">
                  <RatingsPanel cycleId={selectedCycle} employeeId={employeeId} canManage={canManage} />
                  <RecommendationsPanel cycleId={selectedCycle} employeeId={employeeId} canManage={canManage} />
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">Select an employee to manage goals, ratings and recommendations.</p>
              </div>
            )}
          </section>
        )}
      </div>

      {showCycleForm && canManage && <CycleForm onClose={() => setShowCycleForm(false)} />}
    </div>
  )
}

// ── Goals ──────────────────────────────────────────────────────────────────────
function GoalsPanel({ cycleId, employeeId, canManage }: { cycleId: string; employeeId: string; canManage: boolean }) {
  const { data: goals = [], isLoading } = useGoals(employeeId, cycleId)
  const create = useCreateGoal()
  const setStatus = useSetGoalStatus(employeeId, cycleId)
  const del = useDeleteGoal(employeeId, cycleId)

  const [form, setForm] = useState<{ category: GoalCategory; title: string; weight: string; target: string }>({
    category: 'KRA', title: '', weight: '', target: '',
  })

  const add = () => {
    if (!form.title.trim()) return
    const w = Number(form.weight)
    create.mutate(
      {
        employee_id: employeeId,
        cycle_id: cycleId,
        category: form.category,
        title: form.title.trim(),
        weight: form.weight.trim() && !Number.isNaN(w) ? w : null,
        target: form.target.trim() || null,
      },
      { onSuccess: () => setForm({ category: 'KRA', title: '', weight: '', target: '' }) },
    )
  }

  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sym name="flag" size={16} className="text-brand-600" />
        <h4 className="text-sm font-semibold text-brand-950">Goals (KRA / KPI)</h4>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-9 bg-[#F8FAFC] rounded animate-pulse" />)}</div>
      ) : goals.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">No goals for this employee/cycle yet.</p>
      ) : (
        <ul className="space-y-1.5 mb-3">
          {goals.map(g => (
            <li key={g.id} className="flex items-center gap-2 text-xs border border-border rounded-lg px-2.5 py-1.5">
              <CategoryPill category={g.category} />
              <span className="text-brand-950 font-medium flex-1 truncate" title={g.title}>{g.title}</span>
              {g.weight != null && <span className="text-muted-foreground">{g.weight}%</span>}
              {canManage ? (
                <select
                  value={g.status}
                  onChange={e => setStatus.mutate({ id: g.id, status: e.target.value as typeof g.status })}
                  className="px-1.5 py-0.5 text-[11px] border border-border rounded bg-white capitalize"
                >
                  {(['active', 'achieved', 'partial', 'dropped'] as const).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : <StatusPill status={g.status} />}
              {canManage && (
                <button onClick={() => del.mutate(g.id)} disabled={del.isPending} className="text-muted-foreground hover:text-red-600 disabled:opacity-50" title="Remove">
                  <Sym name="delete" size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="border-t border-border pt-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as GoalCategory })} className={inputCls}>
              {(['KRA', 'KPI', 'goal'] as const).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} placeholder="Weight %" type="number" min={0} max={100} className={inputCls} />
            <input value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} placeholder="Target" className={inputCls} />
          </div>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Goal title" className={inputCls} />
          <button onClick={add} disabled={create.isPending || !form.title.trim()} className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            <Sym name="add" size={14} /> Add Goal
          </button>
        </div>
      )}
    </div>
  )
}

// ── Ratings (calibration + final) ──────────────────────────────────────────────
function RatingsPanel({ cycleId, employeeId, canManage }: { cycleId: string; employeeId: string; canManage: boolean }) {
  const { user } = useAuth()
  const { data: reviews = [] } = useReviews(employeeId, cycleId)
  const save = useSaveReview(user?.id)

  const byStage = (stage: ReviewStage) => reviews.find(r => r.stage === stage)

  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sym name="tune" size={16} className="text-brand-600" />
        <h4 className="text-sm font-semibold text-brand-950">Calibration & Final Rating</h4>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
        <div className="border border-border rounded-lg px-3 py-2">
          <span className="text-muted-foreground">Self</span>
          <p className="text-lg font-display font-semibold text-brand-950">{fmtRating(byStage('self')?.rating)}</p>
        </div>
        <div className="border border-border rounded-lg px-3 py-2">
          <span className="text-muted-foreground">Manager</span>
          <p className="text-lg font-display font-semibold text-brand-950">{fmtRating(byStage('manager')?.rating)}</p>
        </div>
      </div>

      {canManage ? (
        <div className="space-y-3">
          <RatingRow stage="calibration" label="Calibration" cycleId={cycleId} employeeId={employeeId} existing={byStage('calibration')} save={save} />
          <RatingRow stage="final" label="Final" cycleId={cycleId} employeeId={employeeId} existing={byStage('final')} save={save} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="border border-border rounded-lg px-3 py-2">
            <span className="text-muted-foreground">Calibration</span>
            <p className="text-lg font-display font-semibold text-brand-950">{fmtRating(byStage('calibration')?.rating)}</p>
          </div>
          <div className="border border-border rounded-lg px-3 py-2">
            <span className="text-muted-foreground">Final</span>
            <p className="text-lg font-display font-semibold text-brand-950">{fmtRating(byStage('final')?.rating)}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function RatingRow({
  stage, label, cycleId, employeeId, existing, save,
}: {
  stage: ReviewStage
  label: string
  cycleId: string
  employeeId: string
  existing: Review | undefined
  save: ReturnType<typeof useSaveReview>
}) {
  const [rating, setRating] = useState(existing?.rating != null ? String(existing.rating) : '')
  const [comments, setComments] = useState(existing?.comments ?? '')

  const doSave = (submit: boolean) => {
    save.mutate({
      input: { employee_id: employeeId, cycle_id: cycleId, stage, rating: parseRating(rating), comments: comments.trim() || null },
      submit,
    })
  }

  return (
    <div className="border border-border rounded-lg p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-brand-950">{label}</span>
        {existing ? <StatusPill status={existing.status} /> : <span className="text-[11px] text-muted-foreground">Not started</span>}
      </div>
      <div className="flex gap-2">
        <input type="number" min={0} max={5} step={0.1} value={rating} onChange={e => setRating(e.target.value)} placeholder="0–5" className={`${inputCls} w-24`} />
        <input value={comments} onChange={e => setComments(e.target.value)} placeholder="Comments" className={inputCls} />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => doSave(false)} disabled={save.isPending} className="px-2.5 py-1 text-[11px] border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">Save Draft</button>
        <button onClick={() => doSave(true)} disabled={save.isPending} className="px-2.5 py-1 text-[11px] bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">Submit</button>
      </div>
    </div>
  )
}

// ── Recommendations ─────────────────────────────────────────────────────────────
function RecommendationsPanel({ cycleId, employeeId, canManage }: { cycleId: string; employeeId: string; canManage: boolean }) {
  const { user } = useAuth()
  const canApprove = useCan('hrms.performance.recommend.approve')
  const { data: recs = [] } = useRecommendations(employeeId, cycleId)
  const create = useCreateRecommendation()
  const decide = useDecideRecommendation(cycleId, user?.id)

  const [form, setForm] = useState<{ type: RecommendationType; proposed_value: string }>({ type: 'increment', proposed_value: '' })

  const add = () => {
    create.mutate(
      { employee_id: employeeId, cycle_id: cycleId, type: form.type, proposed_value: form.proposed_value.trim() || null },
      { onSuccess: () => setForm({ type: 'increment', proposed_value: '' }) },
    )
  }

  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sym name="trending_up" size={16} className="text-brand-600" />
        <h4 className="text-sm font-semibold text-brand-950">Recommendations</h4>
      </div>

      {recs.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">No recommendations raised.</p>
      ) : (
        <ul className="space-y-1.5 mb-3">
          {recs.map(r => (
            <li key={r.id} className="flex items-center gap-2 text-xs border border-border rounded-lg px-2.5 py-1.5">
              <span className="capitalize font-medium text-brand-950">{r.type}</span>
              <span className="text-muted-foreground flex-1 truncate">{r.proposed_value || '—'}</span>
              <StatusPill status={r.status} />
              {canApprove && r.status === 'proposed' && (
                <>
                  <button onClick={() => decide.mutate({ id: r.id, approve: true })} disabled={decide.isPending} className="px-2 py-0.5 text-[11px] bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50">Approve</button>
                  <button onClick={() => decide.mutate({ id: r.id, approve: false })} disabled={decide.isPending} className="px-2 py-0.5 text-[11px] border border-border rounded text-red-600 hover:bg-red-50 disabled:opacity-50">Reject</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="border-t border-border pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as RecommendationType })} className={inputCls}>
              <option value="increment">Increment</option>
              <option value="promotion">Promotion</option>
            </select>
            <input value={form.proposed_value} onChange={e => setForm({ ...form, proposed_value: e.target.value })} placeholder="e.g. 10% / new grade" className={inputCls} />
          </div>
          <button onClick={add} disabled={create.isPending} className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            <Sym name="add" size={14} /> Raise Recommendation
          </button>
        </div>
      )}
    </div>
  )
}

// ── Cycle form ───────────────────────────────────────────────────────────────
function CycleForm({ onClose }: { onClose: () => void }) {
  const create = useCreateCycle()
  const [form, setForm] = useState<{ name: string; type: CycleType; period_start: string; period_end: string }>({
    name: '', type: 'quarterly', period_start: '', period_end: '',
  })

  const submit = () => {
    if (!form.name.trim()) return
    const input: CycleInput = {
      name: form.name.trim(),
      type: form.type,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
    }
    create.mutate(input, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">New Review Cycle</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. FY25 Q1 Review" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Type</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as CycleType })} className={inputCls}>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="probation">Probation</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Period start</label>
              <input type="date" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Period end</label>
              <input type="date" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={submit} disabled={create.isPending || !form.name.trim()} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Create</button>
        </div>
      </div>
    </div>
  )
}
