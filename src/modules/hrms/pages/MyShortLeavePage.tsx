// HRMS — Employee short-leave self-service (/hrms/short-leave), gate hrms.ess.view.
// 2h/month (1h x2 or 2h x1), lapses monthly. Apply → approval. Shows this month's
// remaining balance and the employee's history.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import { istToday } from './attendanceShared'
import { RequestStatusPill } from './attendanceShared'
import { useMyShortLeaves, useSubmitShortLeave, useCancelShortLeave } from '../hooks/useShortLeave'
import { usedHoursForMonth, SLOT_LABEL, type ShortLeaveSlot } from '../api/shortLeave'

export default function MyShortLeavePage() {
  const { user } = useAuth()
  const uid = user?.id
  const { data: rows = [], isLoading } = useMyShortLeaves(uid)
  const submit = useSubmitShortLeave(uid)
  const cancel = useCancelShortLeave(uid)

  const [date, setDate] = useState(istToday())
  const [hours, setHours] = useState<1 | 2>(1)
  const [slot, setSlot] = useState<ShortLeaveSlot>('late_in')
  const [reason, setReason] = useState('')

  const ym = date.slice(0, 7)
  const used = useMemo(() => usedHoursForMonth(rows, ym), [rows, ym])
  const remaining = Math.max(0, 2 - used)
  const canApply = remaining >= hours

  const apply = () => {
    if (!canApply) return
    submit.mutate({ leave_date: date, hours, slot, reason: reason.trim() || null },
      { onSuccess: () => setReason('') })
  }

  return (
    <div>
      <TopBar title="Short Leave" subtitle="Up to 2 hours a month · resets each month" />
      <div className="p-6 animate-fade-up space-y-5 max-w-3xl">

        {/* Balance for the selected month */}
        <div className="bg-white rounded-xl border border-border p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
            <Sym name="hourglass_bottom" size={24} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Short leave left · {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
            <p className="text-2xl font-display font-semibold text-brand-950">{remaining} <span className="text-base font-normal text-muted-foreground">hr{remaining === 1 ? '' : 's'} left</span></p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{used} of 2 hours used this month · resets on the 1st</p>
          </div>
        </div>

        {/* Apply */}
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="font-display font-semibold text-brand-950 mb-4 flex items-center gap-2">
            <Sym name="add_circle" size={17} className="text-brand-600" /> Apply for short leave
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Date">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={ic} />
            </Field>
            <Field label="Duration">
              <select value={hours} onChange={e => setHours(Number(e.target.value) as 1 | 2)} className={ic}>
                <option value={1}>1 hour</option>
                <option value={2}>2 hours</option>
              </select>
            </Field>
            <Field label="When">
              <select value={slot} onChange={e => setSlot(e.target.value as ShortLeaveSlot)} className={ic}>
                <option value="late_in">Late arrival</option>
                <option value="early_out">Early departure</option>
                <option value="general">General</option>
              </select>
            </Field>
            <Field label="Reason (optional)">
              <input value={reason} onChange={e => setReason(e.target.value)} className={ic} placeholder="e.g. bank work" />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-3 mt-4">
            {!canApply && <p className="text-xs text-red-600 mr-auto">Only {remaining} hour(s) left this month.</p>}
            <button onClick={apply} disabled={!canApply || submit.isPending}
              className="px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {submit.isPending ? 'Applying…' : 'Apply'}
            </button>
          </div>
        </div>

        {/* History */}
        <div>
          <h3 className="font-display font-semibold text-white text-sm mb-3">My short leaves</h3>
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-white rounded-lg border border-border animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="glass-panel rounded-xl border-dashed !border-white/20 p-8 text-center">
              <p className="text-sm text-white/60">No short leaves yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border overflow-hidden divide-y divide-border">
              {rows.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-brand-950 text-sm">{formatDate(r.leave_date)} · {r.hours}h</div>
                    <div className="text-[11px] text-muted-foreground">{SLOT_LABEL[r.slot]}{r.reason ? ` · ${r.reason}` : ''}{r.note ? ` · note: ${r.note}` : ''}</div>
                  </div>
                  <RequestStatusPill status={r.status === 'cancelled' ? 'cancelled' : r.status} />
                  {r.status === 'pending' && (
                    <button onClick={() => cancel.mutate(r.id)} disabled={cancel.isPending}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50">Cancel</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const ic = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>
      {children}
    </div>
  )
}
