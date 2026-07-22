// HRMS — My Performance (/hrms/performance/me), gate hrms.performance.review.self.
// The signed-in employee's performance self-service for a chosen cycle: their goals
// (KRA/KPI/goal + weight/target/status), their reviews across stages, a self-review
// submit form, and their increment/promotion recommendations (read-only).
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useCan } from '@/core/access/useCan'
import {
  useCycles,
  useGoals,
  useReviews,
  useSaveReview,
  useRecommendations,
} from '../hooks/usePerformance'
import { StatusPill, CategoryPill, fmtRating, inputCls, parseRating } from './performanceShared'
import type { Review } from '../api/performance'

export default function MyPerformancePage() {
  const { user } = useAuth()
  const uid = user?.id ?? ''
  const canSelf = useCan('hrms.performance.review.self')

  const { data: cycles = [], isLoading: lc } = useCycles()
  const [cycleId, setCycleId] = useState('')
  const selectedCycle = cycleId || (cycles[0]?.id ?? '')

  const { data: goals = [], isLoading: lg } = useGoals(uid, selectedCycle)
  const { data: reviews = [] } = useReviews(uid, selectedCycle)
  const { data: recommendations = [] } = useRecommendations(uid, selectedCycle)

  const selfReview = useMemo(() => reviews.find(r => r.stage === 'self'), [reviews])
  const managerReview = useMemo(() => reviews.find(r => r.stage === 'manager'), [reviews])
  const finalReview = useMemo(() => reviews.find(r => r.stage === 'final'), [reviews])

  const [showSelf, setShowSelf] = useState(false)

  return (
    <div>
      <TopBar title="My Performance" subtitle="Your goals, reviews and recommendations" />

      <div className="p-6 animate-fade-up space-y-6">
        {/* Cycle picker */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-brand-950">Review cycle</label>
          <select
            value={selectedCycle}
            onChange={e => setCycleId(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
          >
            {cycles.length === 0 && <option value="">No cycles</option>}
            {cycles.map(c => (
              <option key={c.id} value={c.id}>{c.name} · {c.type}</option>
            ))}
          </select>
        </div>

        {lc || !selectedCycle ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="star" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{lc ? 'Loading…' : 'No review cycle available yet.'}</p>
          </div>
        ) : (
          <>
            {/* My goals */}
            <section>
              <h3 className="text-sm font-semibold text-brand-950 mb-3">My Goals</h3>
              {lg ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-white rounded-lg border border-border animate-pulse" />)}</div>
              ) : goals.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
                  <p className="text-sm text-muted-foreground">No goals set for this cycle yet.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-border overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Category</th>
                        <th className="px-4 py-3 font-medium">Title</th>
                        <th className="px-4 py-3 font-medium">Weight</th>
                        <th className="px-4 py-3 font-medium">Target</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {goals.map(g => (
                        <tr key={g.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3"><CategoryPill category={g.category} /></td>
                          <td className="px-4 py-3 font-medium text-brand-950">{g.title}</td>
                          <td className="px-4 py-3 text-muted-foreground">{g.weight != null ? `${g.weight}%` : '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground">{g.target || '—'}</td>
                          <td className="px-4 py-3"><StatusPill status={g.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* My reviews */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-brand-950">My Reviews</h3>
                {canSelf && (
                  <button onClick={() => setShowSelf(true)} className="flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700">
                    <Sym name="rate_review" size={14} /> {selfReview ? 'Edit Self-Review' : 'Submit Self-Review'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <ReviewCard label="Self" review={selfReview} />
                <ReviewCard label="Manager" review={managerReview} />
                <ReviewCard label="Final" review={finalReview} />
              </div>
            </section>

            {/* My recommendations */}
            <section>
              <h3 className="text-sm font-semibold text-brand-950 mb-3">My Recommendations</h3>
              {recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No increment/promotion recommendations for this cycle.</p>
              ) : (
                <div className="bg-white rounded-xl border border-border overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">Proposed</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Raised</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recommendations.map(r => (
                        <tr key={r.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-medium text-brand-950 capitalize">{r.type}</td>
                          <td className="px-4 py-3 text-muted-foreground">{r.proposed_value || '—'}</td>
                          <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {showSelf && canSelf && selectedCycle && (
        <SelfReviewModal
          employeeId={uid}
          cycleId={selectedCycle}
          reviewerId={uid}
          existing={selfReview}
          onClose={() => setShowSelf(false)}
        />
      )}
    </div>
  )
}

function ReviewCard({ label, review }: { label: string; review: Review | undefined }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-brand-950">{label}</span>
        {review ? <StatusPill status={review.status} /> : <span className="text-[11px] text-muted-foreground">Not started</span>}
      </div>
      <p className="mt-2 text-2xl font-display font-semibold text-brand-950">{fmtRating(review?.rating)}</p>
      <p className="text-xs text-muted-foreground line-clamp-3" title={review?.comments ?? ''}>{review?.comments || 'No comments'}</p>
    </div>
  )
}

function SelfReviewModal({
  employeeId, cycleId, reviewerId, existing, onClose,
}: {
  employeeId: string
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
          stage: 'self',
          rating: parseRating(rating),
          comments: comments.trim() || null,
        },
        submit,
      },
      { onSuccess: onClose },
    )
  }

  const locked = existing?.status === 'submitted'

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">Self-Review</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {locked && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Your self-review has been submitted. Re-submitting will overwrite it.
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Self rating (0–5)</label>
            <input type="number" min={0} max={5} step={0.1} value={rating} onChange={e => setRating(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Comments</label>
            <textarea rows={5} value={comments} onChange={e => setComments(e.target.value)} className={inputCls} placeholder="Summarise your achievements against your goals…" />
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
