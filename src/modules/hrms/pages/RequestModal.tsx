// HRMS — Attendance (M2): employee self-service request modals.
// One modal component switches form by `kind` (regularization / od / overtime) and
// writes the matching table with employee_id = current user via the hooks.
import { useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { istToday } from './attendanceShared'
import {
  useCreateRegularization,
  useCreateOutdoorDuty,
  useCreateOvertime,
} from '../hooks/useAttendance'

export type RequestKind = 'regularization' | 'od' | 'overtime'

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

const TITLES: Record<RequestKind, string> = {
  regularization: 'Raise Regularization',
  od: 'OD / WFH Request',
  overtime: 'Overtime Request',
}

interface Props {
  kind: RequestKind
  employeeId: string
  /** Prefill work_date (e.g. clicked from a specific day). */
  defaultDate?: string
  onClose: () => void
}

export function RequestModal({ kind, employeeId, defaultDate, onClose }: Props) {
  const today = defaultDate || istToday()
  const reg = useCreateRegularization(employeeId)
  const od = useCreateOutdoorDuty(employeeId)
  const ot = useCreateOvertime(employeeId)

  // Regularization
  const [rWorkDate, setRWorkDate] = useState(today)
  const [rKind, setRKind] = useState<'missed_punch' | 'wrong_punch' | 'forgot' | 'other'>('missed_punch')
  const [rIn, setRIn] = useState('')
  const [rOut, setROut] = useState('')
  const [rReason, setRReason] = useState('')

  // OD / WFH
  const [oMode, setOMode] = useState<'od' | 'wfh'>('od')
  const [oFrom, setOFrom] = useState(today)
  const [oTo, setOTo] = useState(today)
  const [oPurpose, setOPurpose] = useState('')
  const [oLocation, setOLocation] = useState('')

  // Overtime
  const [tWorkDate, setTWorkDate] = useState(today)
  const [tMinutes, setTMinutes] = useState('')
  const [tComp, setTComp] = useState<'paid' | 'comp_off'>('comp_off')
  const [tReason, setTReason] = useState('')

  const pending = reg.isPending || od.isPending || ot.isPending
  const [err, setErr] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    try {
      if (kind === 'regularization') {
        // At least one time, and Out must be after In (both are on the work date).
        if (!rIn && !rOut) { setErr('Enter the In and/or Out time you actually worked.'); return }
        if (rIn && rOut && rOut <= rIn) { setErr('Out time must be later than In time.'); return }
        const toTs = (t: string) => new Date(`${rWorkDate}T${t}:00`).toISOString()
        await reg.mutateAsync({
          work_date: rWorkDate,
          kind: rKind,
          requested_in: rIn ? toTs(rIn) : null,
          requested_out: rOut ? toTs(rOut) : null,
          reason: rReason.trim() || null,
        })
      } else if (kind === 'od') {
        await od.mutateAsync({
          mode: oMode,
          from_date: oFrom,
          to_date: oTo,
          purpose: oPurpose.trim() || null,
          location: oLocation.trim() || null,
        })
      } else {
        await ot.mutateAsync({
          work_date: tWorkDate,
          minutes: Number(tMinutes) || 0,
          compensation: tComp,
          reason: tReason.trim() || null,
        })
      }
      onClose()
    } catch { /* toast surfaced by the hook */ }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{TITLES[kind]}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {kind === 'regularization' && (
            <>
              <Field label="Work Date">
                <input type="date" className={ic} value={rWorkDate} onChange={e => setRWorkDate(e.target.value)} />
              </Field>
              <Field label="Kind">
                <select className={ic} value={rKind} onChange={e => setRKind(e.target.value as any)}>
                  <option value="missed_punch">Missed punch</option>
                  <option value="wrong_punch">Wrong punch</option>
                  <option value="forgot">Forgot</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="In time"><input type="time" className={ic} value={rIn} onChange={e => setRIn(e.target.value)} /></Field>
                <Field label="Out time"><input type="time" className={ic} value={rOut} onChange={e => setROut(e.target.value)} /></Field>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-2">Times are on the work date above. Out must be later than In.</p>
              <Field label="Reason"><textarea className={ic} rows={3} value={rReason} onChange={e => setRReason(e.target.value)} /></Field>
            </>
          )}

          {kind === 'od' && (
            <>
              <Field label="Mode">
                <select className={ic} value={oMode} onChange={e => setOMode(e.target.value as any)}>
                  <option value="od">Outdoor Duty (OD)</option>
                  <option value="wfh">Work From Home (WFH)</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="From"><input type="date" className={ic} value={oFrom} onChange={e => setOFrom(e.target.value)} /></Field>
                <Field label="To"><input type="date" className={ic} value={oTo} onChange={e => setOTo(e.target.value)} /></Field>
              </div>
              <Field label="Purpose"><textarea className={ic} rows={2} value={oPurpose} onChange={e => setOPurpose(e.target.value)} /></Field>
              {oMode === 'od' && (
                <Field label="Location"><input className={ic} value={oLocation} onChange={e => setOLocation(e.target.value)} placeholder="Client site, city…" /></Field>
              )}
            </>
          )}

          {kind === 'overtime' && (
            <>
              <Field label="Work Date"><input type="date" className={ic} value={tWorkDate} onChange={e => setTWorkDate(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Minutes"><input type="number" min={0} className={ic} value={tMinutes} onChange={e => setTMinutes(e.target.value)} /></Field>
                <Field label="Compensation">
                  <select className={ic} value={tComp} onChange={e => setTComp(e.target.value as any)}>
                    <option value="comp_off">Comp-off</option>
                    <option value="paid">Paid</option>
                  </select>
                </Field>
              </div>
              <Field label="Reason"><textarea className={ic} rows={3} value={tReason} onChange={e => setTReason(e.target.value)} /></Field>
            </>
          )}
        </form>

        {err && <p className="px-6 -mt-1 text-xs text-red-600">{err}</p>}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={submit} disabled={pending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {pending ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>
      {children}
    </div>
  )
}
