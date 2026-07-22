// HRMS — Separations (/hrms/lifecycle/separations), gated hrms.lifecycle.manage.
// Separation workflow (initiated → approved → exit_interview → clearance → fnf →
// completed), exit interview capture, asset-clearance note, and F&F draft. F&F
// APPROVE is gated hrms.lifecycle.approve. Single-level approval throughout.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useCan } from '@/core/access/useCan'
import { useEmployees } from '../hooks/useEmployees'
import {
  useSeparations,
  useApproveSeparation,
  useSetSeparationStatus,
  useExitInterview,
  useSaveExitInterview,
  useFnf,
  useDraftFnf,
  useApproveFnf,
  useSetFnfStatus,
} from '../hooks/useLifecycle'
import { fmtPaise } from './payrollShared'
import { StatusPill, inputCls, rupeesToPaise } from './recruitShared'
import type { Separation, SeparationStatus } from '../api/lifecycle'

// Linear workflow advance map (cancel is a side action).
const NEXT_STAGE: Partial<Record<SeparationStatus, SeparationStatus>> = {
  approved: 'exit_interview',
  exit_interview: 'clearance',
  clearance: 'fnf',
  fnf: 'completed',
}

export default function SeparationsPage() {
  const canManage = useCan('hrms.lifecycle.manage')
  const { data: separations = [], isLoading } = useSeparations()
  const { data: employees = [] } = useEmployees()
  const [expanded, setExpanded] = useState<string | null>(null)

  const empName = useMemo(() => new Map(employees.map(e => [e.id, e.name ?? e.employee_code ?? e.id.slice(0, 8)])), [employees])
  const active = separations.filter(s => s.status !== 'completed' && s.status !== 'cancelled').length

  return (
    <div>
      <TopBar title="Separations" subtitle={`${active} active · ${separations.length} total`} />

      <div className="p-6 animate-fade-up space-y-5">
        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : separations.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="logout" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No separations. Initiate one from the Lifecycle page.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {separations.map(s => (
              <SeparationRow
                key={s.id}
                separation={s}
                employeeName={empName.get(s.employee_id) ?? s.employee_id.slice(0, 8)}
                canManage={canManage}
                expanded={expanded === s.id}
                onToggle={() => setExpanded(expanded === s.id ? null : s.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SeparationRow({ separation, employeeName, canManage, expanded, onToggle }: {
  separation: Separation
  employeeName: string
  canManage: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const { user } = useAuth()
  const approve = useApproveSeparation(user?.id)
  const setStatus = useSetSeparationStatus()
  const s = separation
  const nextStage = NEXT_STAGE[s.status]

  return (
    <div className="bg-white rounded-xl border border-border">
      <div className="p-4 flex items-center gap-4">
        <button onClick={onToggle} className="w-9 h-9 rounded-lg bg-brand-600/10 flex items-center justify-center shrink-0">
          <Sym name="logout" size={18} className="text-brand-600" />
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-brand-950">{employeeName}</span>
            <span className="text-[11px] text-muted-foreground bg-[#F8FAFC] border border-border rounded px-1.5 py-0.5 capitalize">{s.type}</span>
            <StatusPill status={s.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Notice {s.notice_date ? formatDate(s.notice_date) : '—'} · LWD {s.last_working_day ? formatDate(s.last_working_day) : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canManage && s.status === 'initiated' && user?.id && (
            <button onClick={() => approve.mutate(s.id)} disabled={approve.isPending} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              <Sym name="check" size={13} /> Approve
            </button>
          )}
          {canManage && nextStage && (
            <button onClick={() => setStatus.mutate({ id: s.id, status: nextStage })} disabled={setStatus.isPending} className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">
              <Sym name="arrow_forward" size={13} /> {nextStage.replace(/_/g, ' ')}
            </button>
          )}
          {canManage && s.status !== 'completed' && s.status !== 'cancelled' && (
            <button onClick={() => setStatus.mutate({ id: s.id, status: 'cancelled' })} disabled={setStatus.isPending} className="px-2.5 py-1 text-xs border border-border rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50">Cancel</button>
          )}
          <button onClick={onToggle}><Sym name={expanded ? 'expand_less' : 'expand_more'} size={18} className="text-muted-foreground" /></button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-4 space-y-5">
          {s.reason && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Reason</p>
              <p className="text-sm text-brand-900">{s.reason}</p>
            </div>
          )}
          <ExitInterviewBlock separationId={s.id} canManage={canManage} />
          <ClearanceNote />
          <FnfBlock separationId={s.id} canManage={canManage} />
        </div>
      )}
    </div>
  )
}

function ExitInterviewBlock({ separationId, canManage }: { separationId: string; canManage: boolean }) {
  const { user } = useAuth()
  const { data: exit } = useExitInterview(separationId)
  const save = useSaveExitInterview(user?.id)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ sentiment: 'neutral', notes: '' })

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-brand-950">Exit Interview</p>
        {canManage && !exit && !editing && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-[#F8FAFC]">
            <Sym name="rate_review" size={13} /> Record
          </button>
        )}
      </div>
      {exit ? (
        <div className="bg-[#F8FAFC] border border-border rounded-lg p-3">
          <p className="text-sm text-brand-950 capitalize">Sentiment: {exit.sentiment ?? '—'}</p>
          {exit.notes && <p className="text-sm text-muted-foreground mt-1">{exit.notes}</p>}
        </div>
      ) : editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Sentiment</label>
            <select value={form.sentiment} onChange={e => setForm({ ...form, sentiment: e.target.value })} className={inputCls}>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-brand-950 mb-1">Notes</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => save.mutate({ separation_id: separationId, sentiment: form.sentiment, notes: form.notes.trim() || null }, { onSuccess: () => setEditing(false) })}
              disabled={save.isPending}
              className="px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              Save
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not recorded.</p>
      )}
    </div>
  )
}

function ClearanceNote() {
  return (
    <div>
      <p className="text-sm font-semibold text-brand-950 mb-2">Asset Clearance</p>
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <Sym name="inventory_2" size={16} className="text-amber-700 mt-0.5" />
        <p className="text-sm text-amber-800">
          Confirm return of all allocated assets (laptop, ID card, access cards, documents) and revoke system access before advancing to F&amp;F. Track individual assets via the employee's asset records.
        </p>
      </div>
    </div>
  )
}

function FnfBlock({ separationId, canManage }: { separationId: string; canManage: boolean }) {
  const { user } = useAuth()
  const canApprove = useCan('hrms.lifecycle.approve')
  const { data: fnf } = useFnf(separationId)
  const draft = useDraftFnf(user?.id)
  const approve = useApproveFnf(separationId, user?.id)
  const setStatus = useSetFnfStatus(separationId)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ payable: '', recoverable: '' })

  const net = (rupeesToPaise(form.payable) ?? 0) - (rupeesToPaise(form.recoverable) ?? 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-brand-950">Full &amp; Final Settlement</p>
        {canManage && !fnf && !editing && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-[#F8FAFC]">
            <Sym name="request_quote" size={13} /> Draft F&amp;F
          </button>
        )}
      </div>
      {fnf ? (
        <div className="bg-[#F8FAFC] border border-border rounded-lg p-3 flex flex-wrap items-center gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Payable</p>
            <p className="text-sm text-brand-950">{fmtPaise(fnf.payable)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recoverable</p>
            <p className="text-sm text-brand-950">{fmtPaise(fnf.recoverable)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Net</p>
            <p className="text-sm font-semibold text-brand-950">{fmtPaise(fnf.net)}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StatusPill status={fnf.status} />
            {canApprove && fnf.status === 'draft' && user?.id && (
              <button onClick={() => approve.mutate(fnf.id)} disabled={approve.isPending} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                <Sym name="check" size={13} /> Approve
              </button>
            )}
            {canManage && fnf.status === 'approved' && (
              <button onClick={() => setStatus.mutate({ id: fnf.id, status: 'paid' })} disabled={setStatus.isPending} className="px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">Mark paid</button>
            )}
          </div>
        </div>
      ) : editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Payable (₹)</label>
            <input type="number" min={0} value={form.payable} onChange={e => setForm({ ...form, payable: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Recoverable (₹)</label>
            <input type="number" min={0} value={form.recoverable} onChange={e => setForm({ ...form, recoverable: e.target.value })} className={inputCls} />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Net</p>
            <p className="text-sm font-semibold text-brand-950 py-2">{fmtPaise(net)}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => draft.mutate({ separation_id: separationId, payable: rupeesToPaise(form.payable) ?? 0, recoverable: rupeesToPaise(form.recoverable) ?? 0 }, { onSuccess: () => setEditing(false) })}
              disabled={draft.isPending}
              className="px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              Save draft
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not drafted.</p>
      )}
    </div>
  )
}
