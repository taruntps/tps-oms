// HRMS — Leave (M3): employee Apply-Leave modal.
// Inserts hr_leave_requests with employee_id = current user. Days are computed from the
// date span (half-day → 0.5). Balance is blocked when balance < days UNLESS the type is
// LWP or policy leave.allow_negative is true (rules read from get_hr_policy, never hardcoded).
import { useMemo, useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { istToday, fmtDays } from './leaveShared'
import { daySpan, type LeaveType, type LeaveTypeBalance } from '../api/leave'
import { useCreateLeaveRequest } from '../hooks/useLeave'

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

interface Props {
  employeeId: string
  leaveTypes: LeaveType[]
  balances: LeaveTypeBalance[]
  /** Resolved policy: leave.allow_negative (boolean-ish) + leave.min_unit. */
  allowNegative: boolean
  minUnit: number
  onClose: () => void
}

export function LeaveRequestModal({
  employeeId, leaveTypes, balances, allowNegative, minUnit, onClose,
}: Props) {
  const today = istToday()
  const create = useCreateLeaveRequest(employeeId)

  const [typeId, setTypeId] = useState(leaveTypes[0]?.id ?? '')
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [isHalfDay, setIsHalfDay] = useState(false)
  const [halfSession, setHalfSession] = useState<'first' | 'second'>('first')
  const [reason, setReason] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')

  const selectedType = useMemo(() => leaveTypes.find(t => t.id === typeId), [leaveTypes, typeId])
  const isLWP = selectedType?.code === 'LWP'
  const balance = useMemo(
    () => balances.find(b => b.type.id === typeId)?.balance ?? 0,
    [balances, typeId],
  )

  // Half-day only allowed for a single day.
  const canHalfDay = fromDate === toDate
  const days = useMemo(() => {
    const span = daySpan(fromDate, toDate)
    if (span === 0) return 0
    if (isHalfDay && canHalfDay) return Math.max(minUnit, 0.5)
    return span
  }, [fromDate, toDate, isHalfDay, canHalfDay, minUnit])

  const insufficient = !isLWP && !allowNegative && days > 0 && balance < days
  const canSubmit = !!typeId && days > 0 && !insufficient && !create.isPending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    try {
      await create.mutateAsync({
        leave_type_id: typeId,
        from_date: fromDate,
        to_date: toDate,
        days,
        is_half_day: isHalfDay && canHalfDay,
        half_session: isHalfDay && canHalfDay ? halfSession : null,
        reason: reason.trim() || null,
        attachment_url: attachmentUrl.trim() || null,
      })
      onClose()
    } catch { /* toast surfaced by the hook */ }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">Apply for Leave</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Leave Type</label>
            <select className={ic} value={typeId} onChange={e => setTypeId(e.target.value)}>
              {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
            </select>
            {selectedType && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Balance: <span className="font-medium text-brand-800">{fmtDays(balance)}</span> day(s)
                {isLWP && ' · unpaid'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">From</label>
              <input type="date" className={ic} value={fromDate} onChange={e => { setFromDate(e.target.value); if (e.target.value > toDate) setToDate(e.target.value) }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">To</label>
              <input type="date" className={ic} min={fromDate} value={toDate} onChange={e => setToDate(e.target.value)} />
            </div>
          </div>

          {canHalfDay && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-brand-950">
                <input type="checkbox" checked={isHalfDay} onChange={e => setIsHalfDay(e.target.checked)} /> Half day
              </label>
              {isHalfDay && (
                <select className={ic} value={halfSession} onChange={e => setHalfSession(e.target.value as 'first' | 'second')}>
                  <option value="first">First half</option>
                  <option value="second">Second half</option>
                </select>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Reason</label>
            <textarea className={ic} rows={3} value={reason} onChange={e => setReason(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">
              Attachment (proof){leaveTypes.find(t => t.id === typeId)?.requires_proof ? ' *' : ''}
            </label>
            <input className={ic} value={attachmentUrl} onChange={e => setAttachmentUrl(e.target.value)}
              placeholder="Document link (e.g. medical certificate)" />
            <p className="text-[11px] text-muted-foreground mt-1">Paste a document link; file upload via Document Management is a follow-up.</p>
          </div>

          <div className="rounded-lg border border-border bg-[#F8FAFC] px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Days requested</span>
            <span className="font-semibold text-brand-950">{fmtDays(days)}</span>
          </div>

          {insufficient && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Insufficient balance ({fmtDays(balance)} available). Choose fewer days, or apply as LWP.
            </div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={submit} disabled={!canSubmit} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {create.isPending ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
