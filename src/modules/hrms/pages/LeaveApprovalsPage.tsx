// HRMS — Leave Approvals (/hrms/leave/approvals), gate hrms.leave.approve.
// Pending queue: Approve → set status/approver/decided_at AND post a ledger debit
// (hr_leave_ledger entry_type='applied', quantity = −days, ref_type='leave_request').
// Reject → status + note only. HR can cancel an already-approved leave, which posts a
// reversal (+days). All ledger math lives in api/leave.ts.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useCan } from '@/core/access/useCan'
import { useEmployees } from '../hooks/useEmployees'
import {
  useActiveLeaveTypes,
  useLeaveRequests,
  useDecideLeaveRequest,
  useReverseApprovedLeave,
} from '../hooks/useLeave'
import { LeaveStatusPill, fmtDays } from './leaveShared'
import type { LeaveRequest } from '../api/leave'

export default function LeaveApprovalsPage() {
  const { user } = useAuth()
  const approverId = user?.id
  const canManage = useCan('hrms.leave.manage')

  const [view, setView] = useState<'pending' | 'approved'>('pending')
  const { data: leaveTypes = [] } = useActiveLeaveTypes()
  const { data: employees = [] } = useEmployees()
  const { data: pending = [], isLoading: lp } = useLeaveRequests('pending')
  const { data: approved = [], isLoading: la } = useLeaveRequests('approved')

  const decide = useDecideLeaveRequest()
  const reverse = useReverseApprovedLeave(approverId)

  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null)

  const empName = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of employees) m.set(e.id, e.name ?? e.employee_code ?? e.id.slice(0, 8))
    return m
  }, [employees])
  const typeCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of leaveTypes) m.set(t.id, t.code)
    return m
  }, [leaveTypes])

  const rows = view === 'pending' ? pending : approved
  const isLoading = view === 'pending' ? lp : la

  const onApprove = (r: LeaveRequest) => {
    if (!approverId) return
    decide.mutate({ request: r, approve: true, approverId })
  }

  return (
    <div>
      <TopBar title="Leave Approvals" subtitle={`${pending.length} pending request${pending.length === 1 ? '' : 's'}`} />

      <div className="p-6 animate-fade-up space-y-5">
        <div className="flex gap-2">
          {(['pending', 'approved'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm rounded-lg border capitalize ${view === v ? 'bg-brand-600 text-white border-brand-600' : 'border-border text-muted-foreground hover:bg-[#F8FAFC]'}`}
            >
              {v} {v === 'pending' ? `(${pending.length})` : `(${approved.length})`}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="how_to_reg" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No {view} leave requests.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.id} className="bg-white rounded-xl border border-border p-4 flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg bg-brand-600/10 flex items-center justify-center shrink-0">
                  <Sym name="beach_access" size={18} className="text-brand-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-brand-950">{empName.get(r.employee_id) ?? r.employee_id.slice(0, 8)}</span>
                    <span className="text-[11px] text-muted-foreground bg-[#F8FAFC] border border-border rounded px-1.5 py-0.5">{typeCode.get(r.leave_type_id) ?? '—'}</span>
                    <LeaveStatusPill status={r.status} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    <span className="text-brand-800">
                      {r.from_date === r.to_date ? formatDate(r.from_date) : `${formatDate(r.from_date)} → ${formatDate(r.to_date)}`}
                    </span>
                    {' · '}{fmtDays(r.days)} day(s){r.is_half_day ? ' · half day' : ''}
                  </p>
                  {r.reason && <p className="text-xs text-muted-foreground/80 mt-1 italic">“{r.reason}”</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {view === 'pending' ? (
                    <>
                      <button
                        onClick={() => setRejecting(r)}
                        disabled={decide.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Sym name="close" size={15} /> Reject
                      </button>
                      <button
                        onClick={() => onApprove(r)}
                        disabled={decide.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                      >
                        <Sym name="check" size={15} /> Approve
                      </button>
                    </>
                  ) : (
                    canManage && (
                      <button
                        onClick={() => reverse.mutate(r)}
                        disabled={reverse.isPending}
                        title="Cancel this approved leave and reverse the balance"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Sym name="undo" size={15} /> Cancel & Reverse
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {rejecting && approverId && (
        <RejectModal
          request={rejecting}
          typeCode={typeCode.get(rejecting.leave_type_id) ?? '—'}
          onClose={() => setRejecting(null)}
          onConfirm={(note) => {
            decide.mutate({ request: rejecting, approve: false, approverId, note })
            setRejecting(null)
          }}
        />
      )}
    </div>
  )
}

function RejectModal({ request, typeCode, onClose, onConfirm }: {
  request: LeaveRequest; typeCode: string; onClose: () => void; onConfirm: (note: string | null) => void
}) {
  const [note, setNote] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">Reject Leave</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-muted-foreground">{typeCode} · {formatDate(request.from_date)} → {formatDate(request.to_date)}</p>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Reason (optional)</label>
            <textarea
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={() => onConfirm(note.trim() || null)} className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700">Reject</button>
        </div>
      </div>
    </div>
  )
}
