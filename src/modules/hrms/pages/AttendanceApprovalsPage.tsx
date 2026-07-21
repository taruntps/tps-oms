// HRMS — Attendance Approvals (/hrms/attendance/approvals), gate hrms.attendance.approve.
// Unified queue of pending regularizations + OD/WFH + overtime for the approver.
// Approve/Reject sets status + approver_id + decided_at (+ note on regularizations).
// Approving a regularization flags the matching hr_attendance_days.is_regularized (best-effort).
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { usePendingApprovals, useDecideApproval } from '../hooks/useAttendance'
import { useEmployees } from '../hooks/useEmployees'
import type { ApprovalItem, ApprovalKind } from '../api/attendance'

const KIND_META: Record<ApprovalKind, { label: string; icon: string }> = {
  regularization: { label: 'Regularization', icon: 'edit_calendar' },
  od: { label: 'OD / WFH', icon: 'travel_explore' },
  overtime: { label: 'Overtime', icon: 'more_time' },
}

export default function AttendanceApprovalsPage() {
  const { user } = useAuth()
  const { data: items = [], isLoading } = usePendingApprovals()
  const { data: employees = [] } = useEmployees()
  const decide = useDecideApproval()

  const [filter, setFilter] = useState<ApprovalKind | 'all'>('all')
  const [rejecting, setRejecting] = useState<ApprovalItem | null>(null)

  const empName = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of employees) m.set(e.id, e.name ?? e.employee_code ?? e.id.slice(0, 8))
    return m
  }, [employees])

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter(i => i.kind === filter)),
    [items, filter],
  )

  const approverId = user?.id

  const onApprove = (item: ApprovalItem) => {
    if (!approverId) return
    decide.mutate({
      kind: item.kind, id: item.id, approve: true, approverId,
      employeeId: item.employee_id, workDate: item.work_date,
    })
  }

  return (
    <div>
      <TopBar title="Approvals" subtitle={`${items.length} pending request${items.length === 1 ? '' : 's'}`} />

      <div className="p-6 animate-fade-up space-y-5">
        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'regularization', 'od', 'overtime'] as const).map(k => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 text-sm rounded-lg border ${filter === k ? 'bg-brand-600 text-white border-brand-600' : 'border-border text-muted-foreground hover:bg-[#F8FAFC]'}`}
            >
              {k === 'all' ? 'All' : KIND_META[k].label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="inbox" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No pending approvals.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => {
              const meta = KIND_META[item.kind]
              return (
                <div key={`${item.kind}|${item.id}`} className="bg-white rounded-xl border border-border p-4 flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-brand-600/10 flex items-center justify-center shrink-0">
                    <Sym name={meta.icon} size={18} className="text-brand-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-brand-950">{empName.get(item.employee_id) ?? item.employee_id.slice(0, 8)}</span>
                      <span className="text-[11px] text-muted-foreground bg-[#F8FAFC] border border-border rounded px-1.5 py-0.5">{meta.label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{item.detail} · <span className="text-brand-800">{item.when.includes('-') && !item.when.includes('→') ? formatDate(item.when) : item.when}</span></p>
                    {item.reason && <p className="text-xs text-muted-foreground/80 mt-1 italic">“{item.reason}”</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setRejecting(item)}
                      disabled={decide.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Sym name="close" size={15} /> Reject
                    </button>
                    <button
                      onClick={() => onApprove(item)}
                      disabled={decide.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                    >
                      <Sym name="check" size={15} /> Approve
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {rejecting && approverId && (
        <RejectModal
          item={rejecting}
          onClose={() => setRejecting(null)}
          onConfirm={(note) => {
            decide.mutate({ kind: rejecting.kind, id: rejecting.id, approve: false, approverId, note })
            setRejecting(null)
          }}
        />
      )}
    </div>
  )
}

function RejectModal({ item, onClose, onConfirm }: {
  item: ApprovalItem; onClose: () => void; onConfirm: (note: string | null) => void
}) {
  const [note, setNote] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">Reject Request</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-muted-foreground">{KIND_META[item.kind].label} · {item.when}</p>
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
