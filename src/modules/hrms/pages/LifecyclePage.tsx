// HRMS — Employee Lifecycle (/hrms/lifecycle), gated hrms.lifecycle.manage.
// Pick an employee → see their status-event timeline (reusing M1
// hr_employee_status_events), record a lifecycle event (confirmation / transfer /
// promotion / warning / suspension), or initiate a separation.
import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useCan } from '@/core/access/useCan'
import { useEmployees } from '../hooks/useEmployees'
import { useStatusEvents, useRecordStatusEvent, useCreateSeparation } from '../hooks/useLifecycle'
import { inputCls, istToday } from './recruitShared'
import type { StatusEventInput } from '../api/lifecycle'
import type { SeparationType } from '../api/lifecycle'

const EVENT_TYPES = ['confirmation', 'transfer', 'promotion', 'warning', 'suspension'] as const
type EventType = (typeof EVENT_TYPES)[number]

export default function LifecyclePage() {
  const canManage = useCan('hrms.lifecycle.manage')
  const { data: employees = [] } = useEmployees()
  const [employeeId, setEmployeeId] = useState('')

  const [showEvent, setShowEvent] = useState(false)
  const [showSeparation, setShowSeparation] = useState(false)

  const { data: events = [], isLoading } = useStatusEvents(employeeId)
  const selected = employees.find(e => e.id === employeeId)

  return (
    <div>
      <TopBar title="Employee Lifecycle" subtitle="Confirmation, transfer, promotion & separation" />

      <div className="p-6 animate-fade-up space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px]">
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className={inputCls}>
              <option value="">Select an employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name ?? e.employee_code ?? e.id.slice(0, 8)}</option>)}
            </select>
          </div>
          {employeeId && canManage && (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => setShowEvent(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">
                <Sym name="manage_accounts" size={15} /> Record event
              </button>
              <button onClick={() => setShowSeparation(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg text-red-600 hover:bg-red-50">
                <Sym name="logout" size={15} /> Initiate separation
              </button>
            </div>
          )}
        </div>

        {!employeeId ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="manage_accounts" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Select an employee to view their lifecycle timeline.</p>
          </div>
        ) : (
          <div>
            <h3 className="text-sm font-semibold text-brand-950 mb-3">
              Timeline{selected?.name ? ` — ${selected.name}` : ''}
            </h3>
            {isLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-white rounded-lg border border-border animate-pulse" />)}</div>
            ) : events.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">No lifecycle events recorded.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {events.map(ev => (
                  <div key={ev.id} className="bg-white rounded-xl border border-border p-4 flex items-start gap-4">
                    <div className="w-9 h-9 rounded-lg bg-brand-600/10 flex items-center justify-center shrink-0">
                      <Sym name="event_note" size={18} className="text-brand-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-brand-950 capitalize">{(ev.event_type ?? '—').replace(/_/g, ' ')}</span>
                        <span className="text-[11px] text-muted-foreground">{ev.effective_date ? formatDate(ev.effective_date) : '—'}</span>
                      </div>
                      {(ev.from_value || ev.to_value) && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {ev.from_value ?? '—'} <Sym name="arrow_forward" size={12} className="inline align-middle" /> {ev.to_value ?? '—'}
                        </p>
                      )}
                      {ev.notes && <p className="text-xs text-muted-foreground/80 mt-1 italic">{ev.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showEvent && canManage && employeeId && (
        <RecordEventModal employeeId={employeeId} onClose={() => setShowEvent(false)} />
      )}
      {showSeparation && canManage && employeeId && (
        <InitiateSeparationModal employeeId={employeeId} onClose={() => setShowSeparation(false)} />
      )}
    </div>
  )
}

function RecordEventModal({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const { user } = useAuth()
  const record = useRecordStatusEvent()
  const [form, setForm] = useState<{ event_type: EventType; effective_date: string; from_value: string; to_value: string; notes: string }>({
    event_type: 'confirmation', effective_date: istToday(), from_value: '', to_value: '', notes: '',
  })

  const submit = () => {
    const input: StatusEventInput = {
      employee_id: employeeId,
      event_type: form.event_type,
      effective_date: form.effective_date,
      from_value: form.from_value.trim() || null,
      to_value: form.to_value.trim() || null,
      approved_by: user?.id ?? null,
      notes: form.notes.trim() || null,
    }
    record.mutate(input, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">Record Lifecycle Event</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Event type</label>
              <select value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value as EventType })} className={inputCls}>
                {EVENT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Effective date</label>
              <input type="date" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">From</label>
              <input value={form.from_value} onChange={e => setForm({ ...form, from_value: e.target.value })} placeholder="e.g. Probation" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">To</label>
              <input value={form.to_value} onChange={e => setForm({ ...form, to_value: e.target.value })} placeholder="e.g. Confirmed" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={submit} disabled={record.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Record</button>
        </div>
      </div>
    </div>
  )
}

function InitiateSeparationModal({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const { user } = useAuth()
  const create = useCreateSeparation(user?.id)
  const [form, setForm] = useState<{ type: SeparationType; notice_date: string; last_working_day: string; reason: string }>({
    type: 'resignation', notice_date: istToday(), last_working_day: '', reason: '',
  })

  const submit = () => {
    create.mutate(
      {
        employee_id: employeeId,
        type: form.type,
        notice_date: form.notice_date || null,
        last_working_day: form.last_working_day || null,
        reason: form.reason.trim() || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">Initiate Separation</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Type</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as SeparationType })} className={inputCls}>
              <option value="resignation">Resignation</option>
              <option value="termination">Termination</option>
              <option value="retirement">Retirement</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Notice date</label>
              <input type="date" value={form.notice_date} onChange={e => setForm({ ...form, notice_date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Last working day</label>
              <input type="date" value={form.last_working_day} onChange={e => setForm({ ...form, last_working_day: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Reason</label>
            <textarea rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className={inputCls} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={submit} disabled={create.isPending} className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">Initiate</button>
        </div>
      </div>
    </div>
  )
}
