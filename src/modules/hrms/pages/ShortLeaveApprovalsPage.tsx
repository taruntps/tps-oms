// HRMS — Admin review of short-leave requests (/hrms/short-leave/approvals).
// Approve / reject; the RPC re-checks the 2h monthly cap on approval (migration 105).
import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { usePendingShortLeaves, useReviewShortLeave } from '../hooks/useShortLeave'
import { SLOT_LABEL } from '../api/shortLeave'

export default function ShortLeaveApprovalsPage() {
  const { data: rows = [], isLoading } = usePendingShortLeaves()
  const review = useReviewShortLeave()
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const doReject = () => {
    if (!rejectId) return
    review.mutate({ id: rejectId, approve: false, note: note.trim() || null },
      { onSuccess: () => { setRejectId(null); setNote('') } })
  }

  return (
    <div>
      <TopBar title="Short Leave Approvals" subtitle="Requests awaiting review" />
      <div className="p-6 animate-fade-up space-y-4 max-w-3xl">
        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-white rounded-xl border border-border animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="task_alt" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No short-leave requests awaiting approval.</p>
          </div>
        ) : rows.map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-border p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
              <Sym name="hourglass_bottom" size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-brand-950">{r.profiles?.name || 'Employee'}
                <span className="text-muted-foreground font-normal"> · {r.hours}h</span></div>
              <div className="text-[11px] text-muted-foreground">
                {formatDate(r.leave_date)} · {SLOT_LABEL[r.slot]}{r.profiles?.employee_code ? ` · ${r.profiles.employee_code}` : ''}{r.reason ? ` · ${r.reason}` : ''}
              </div>
            </div>
            <button onClick={() => { setRejectId(r.id); setNote('') }} disabled={review.isPending}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] text-red-600 disabled:opacity-50">Reject</button>
            <button onClick={() => review.mutate({ id: r.id, approve: true })} disabled={review.isPending}
              className="px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {review.isPending ? '…' : 'Approve'}
            </button>
          </div>
        ))}
      </div>

      {rejectId && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h2 className="font-display font-semibold text-brand-950 mb-1">Reject short leave</h2>
            <p className="text-xs text-muted-foreground mb-4">Add an optional note for the employee.</p>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} autoFocus
              placeholder="Optional reason"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setRejectId(null); setNote('') }}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={doReject} disabled={review.isPending}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                {review.isPending ? 'Saving…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
