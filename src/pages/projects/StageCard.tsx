import { useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { useUpdateStage } from '@/hooks/useProjects'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { StageAttachments } from './StageAttachments'
import { toast } from '@/components/shared/Toast'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import type { Tables } from '@/types/database'
import type { Database } from '@/types/database'

type Stage = Tables<'stages'>
type ClockType = Database['public']['Enums']['clock_type']

interface Props {
  stage: Stage
  projectId: string
  isBlocked: boolean
  serviceType?: string
  appRefNo?: string | null   // from project header
  clientId?: string
  assigneeName?: string
}

// FSSAI status values per service type (status_fssai stage)
const FSSAI_STATUSES_DEFAULT = ['Document Scrutinisation', 'Pending at IO', 'Inspection Marked', 'Query Raised', 'Approved', 'Rejected']
const FSSAI_STATUSES_FORM2   = ['Document Scrutinisation', 'Technical Committee', 'Query Raised', 'Approved', 'Rejected']
const needsProductKob = (st?: string) => !!st && ['New Application', 'Modification'].includes(st)
const needsAppRef     = (st?: string) => !!st && ['New Application', 'Modification', 'Renewal', 'Form II'].includes(st)

export function StageCard({ stage, projectId, isBlocked, serviceType, appRefNo, clientId, assigneeName }: Props) {
  const employeeLabel = assigneeName?.trim().split(/\s+/)[0] || 'Employee'
  const kind = (stage as any).stage_kind as string
  const clock = ((stage as any).active_clock ?? 'employee') as ClockType
  const meta = ((stage as any).meta ?? {}) as Record<string, any>
  const docStatus = (stage as any).doc_status as string | null

  const [open, setOpen] = useState(false)
  const [capture, setCapture] = useState<null | string>(null)   // which capture modal is open
  const [form, setForm] = useState<Record<string, any>>({})
  const [skipReason, setSkipReason] = useState('')
  const [showSkip, setShowSkip] = useState(false)

  const updateStage   = useUpdateStage()
  const qc            = useQueryClient()

  const isDone = ['completed', 'skipped', 'not_required'].includes(stage.status)
  const canAct = !isDone && !isBlocked

  const patch = async (payload: Record<string, any>, okMsg = 'Stage updated') => {
    try { await updateStage.mutateAsync({ id: stage.id, projectId, ...(payload as any) }); if (okMsg) toast.success(okMsg) }
    catch (e: any) { toast.error('Update failed', e.message) }
  }
  const setClock = (c: ClockType) => patch({ active_clock: c, status: 'in_progress' }, c === 'client' ? 'Moved to client' : c === 'authority' ? 'Submitted to FSSAI' : 'Back with us')
  const start    = () => patch({ status: 'in_progress', started_at: new Date().toISOString() }, 'Started')
  const complete = (extra: Record<string, any> = {}) => patch({ status: 'completed', completed_at: new Date().toISOString(), ...extra }, 'Stage completed')

  const openCapture = (key: string, initial: Record<string, any> = {}) => { setForm(initial); setCapture(key) }
  const recordPayment = async (amount: number, date: string, paidBy: string) => {
    if (!clientId || !amount) return
    await supabase.from('payments').insert({
      project_id: projectId, client_id: clientId, amount: Math.round(amount * 100),
      payment_date: date, payment_mode: paidBy === 'Client' ? 'Client-paid' : 'TPS-paid',
      notes: `${stage.stage_name} — paid by ${paidBy}`,
    } as any)
  }

  // ── Submit handlers for the capture modals ──
  const submitFeeSubmit = async () => {
    if (needsAppRef(serviceType) && !appRefNo) { toast.error('App Ref No is blank', 'Add it in the project header first.'); return }
    if (!form.amount || !form.date || !form.paid_by) { toast.error('Fees amount, date and paid-by are required'); return }
    if (needsProductKob(serviceType)) {
      if (form.domestic == null || form.export == null) { toast.error('Enter domestic & export product counts'); return }
      if (form.kob_added === 'yes' && !form.kob_details?.trim()) { toast.error('Enter KOB details'); return }
    }
    await recordPayment(Number(form.amount), form.date, form.paid_by)
    await complete({
      active_clock: 'authority',
      meta: { ...meta, fee_amount: Number(form.amount), fee_date: form.date, paid_by: form.paid_by,
        domestic_products: form.domestic ?? null, export_products: form.export ?? null,
        kob_added: form.kob_added === 'yes', kob_details: form.kob_details ?? null, app_ref_no: appRefNo },
    })
    setCapture(null)
  }
  const submitFeeOnly = async () => {
    if (!form.amount || !form.date || !form.paid_by) { toast.error('Amount, date and paid-by are required'); return }
    await recordPayment(Number(form.amount), form.date, form.paid_by)
    await complete({ meta: { ...meta, fee_amount: Number(form.amount), fee_date: form.date, paid_by: form.paid_by } })
    setCapture(null)
  }
  const submitLateFee = async () => {
    if (!form.amount || !form.date) { toast.error('Amount and date are required'); return }
    await recordPayment(Number(form.amount), form.date, form.paid_by ?? 'TPS')
    await complete({ meta: { ...meta, penalty_amount: Number(form.amount), penalty_date: form.date } })
    setCapture(null)
  }
  const submitToFssai = async () => {
    if (!appRefNo) { toast.error('App Ref No is blank', 'Add it in the project header first.'); return }
    if (!form.date) { toast.error('Submission date is required'); return }
    await complete({ active_clock: 'authority', meta: { ...meta, app_ref_no: appRefNo, submission_date: form.date } })
    setCapture(null)
  }
  const submitEntry = async () => {
    if (stage.stage_code === 'LICENCE_ISSUED') {
      if (!form.licence_no?.trim() || !form.issue_date) { toast.error('Licence No and issue date are required'); return }
      if (clientId) await supabase.from('licenses').update({ license_number: form.licence_no, status: 'active' } as any)
        .eq('client_id', clientId).is('license_number', null)
      await complete({ meta: { ...meta, licence_no: form.licence_no, issue_date: form.issue_date } })
      qc.invalidateQueries({ queryKey: ['licenses', clientId] })
    } else if (stage.stage_code === 'APPROVAL_ISSUED') {
      if (!form.approval_date) { toast.error('Approval date is required'); return }
      await complete({ meta: { ...meta, app_ref_no: appRefNo, approval_date: form.approval_date } })
    } else { // RETURN_SUBMITTED, ART_APPROVED, CLAIM_COMPLETED — date only
      if (!form.date) { toast.error('Date is required'); return }
      await complete({ meta: { ...meta, date: form.date } })
    }
    setCapture(null)
  }
  const submitAppeal = async () => {
    if (!form.filed_date) { toast.error('Appeal filed date is required'); return }
    const decision = form.decision
    await patch({
      status: decision ? 'completed' : 'in_progress',
      completed_at: decision ? new Date().toISOString() : null,
      meta: { ...meta, filed_date: form.filed_date, hearing_received: form.hearing_received ?? null,
        hearing_done: form.hearing_done ?? null, decision: decision ?? null },
    }, decision ? `Appeal ${decision}` : 'Appeal updated')
    setCapture(null)
  }
  const setFssaiStatus = async (status: string) => {
    // Gating: cannot mark Approved while any query round is unanswered.
    if (status === 'Approved') {
      const { count } = await supabase.from('authority_queries')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId).is('response_submitted_date', null)
      if ((count ?? 0) > 0) { toast.error('Open queries pending', 'Respond to all query rounds in the Queries tab before marking Approved.'); return }
    }
    if (status === 'Query Raised') {
      toast.info?.('Record the query', 'Open the Queries tab and log the deficiency letter (date + points).')
    }
    const done = status === 'Approved'
    await patch({ fssai_status: status, status: done ? 'completed' : 'in_progress',
      completed_at: done ? new Date().toISOString() : null }, `Status: ${status}`)
  }
  const submitSkip = async () => {
    if (!skipReason.trim()) { toast.error('Reason required'); return }
    await patch({ status: 'skipped', skip_reason: skipReason, skipped_at: new Date().toISOString() }, 'Stage skipped')
    setShowSkip(false); setSkipReason('')
  }

  const clockBadge = (
    <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium hidden sm:inline-flex items-center gap-1',
      clock === 'employee' ? 'bg-green-50 text-green-700 border-green-200' :
      clock === 'client'   ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200')}>
      {clock === 'employee' ? '🟢' : clock === 'client' ? '🟡' : '🔵'}
      {clock === 'employee' ? employeeLabel : clock === 'client' ? 'With Client' : 'FSSAI'}
    </span>
  )

  return (
    <div className={cn('rounded-xl border p-4 transition-all',
      isDone ? 'bg-green-50 border-green-200' : 'bg-white border-border')}>
      <div className="flex items-center gap-3">
        <span className="w-6 h-6 rounded-full bg-white border border-border flex items-center justify-center text-[11px] font-mono text-muted-foreground shrink-0">{stage.stage_order}</span>
        <Sym name={isDone ? 'check_circle' : stage.status === 'in_progress' ? 'play_circle' : 'schedule'} size={15}
          className={cn(isDone ? 'text-green-600' : stage.status === 'in_progress' ? 'text-brand-600' : 'text-muted-foreground', 'shrink-0')} />
        <span className="flex-1 text-sm font-medium text-brand-950 truncate">{stage.stage_name}</span>
        {kind === 'status_fssai' && (stage as any).fssai_status && !isDone && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 font-medium">{(stage as any).fssai_status}</span>
        )}
        {!isDone && kind !== 'entry' && clockBadge}
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize',
          stage.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
          stage.status === 'in_progress' ? 'bg-brand-100 text-brand-700 border-brand-200' :
          stage.status === 'skipped' || stage.status === 'not_required' ? 'bg-gray-100 text-gray-400 border-gray-200' :
          'bg-gray-100 text-gray-600 border-gray-200')}>
          {stage.status === 'not_required' ? 'not required' : stage.status.replace('_', ' ')}
        </span>
        <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-brand-950">
          <Sym name={open ? 'expand_more' : 'chevron_right'} size={14} />
        </button>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-black/5 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <TimeRow label="Started" value={stage.started_at} dt />
            <TimeRow label="Completed" value={stage.completed_at} dt />
            <TimeRow label="Due" value={stage.due_date} />
            {stage.stage_code && <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Code</p><p className="font-mono text-brand-950">{stage.stage_code}</p></div>}
          </div>
          {(stage as any).skip_reason && <p className="text-xs text-muted-foreground italic">Skipped: {(stage as any).skip_reason}</p>}
          {/* captured meta summary */}
          {Object.keys(meta).length > 0 && (
            <div className="text-[11px] text-muted-foreground bg-[#F8FAFC] border border-border rounded-lg p-2 space-y-0.5">
              {meta.licence_no && <div>Licence No: <b className="text-brand-950">{meta.licence_no}</b> · {meta.issue_date}</div>}
              {meta.fee_amount && <div>Fee: ₹{meta.fee_amount} · {meta.fee_date} · by {meta.paid_by}</div>}
              {meta.domestic_products != null && <div>Products — domestic {meta.domestic_products}, export {meta.export_products}{meta.kob_added ? ` · KOB: ${meta.kob_details}` : ''}</div>}
              {meta.submission_date && <div>Submitted to FSSAI: {meta.submission_date} · App Ref {meta.app_ref_no}</div>}
              {meta.approval_date && <div>Approval date: {meta.approval_date}</div>}
              {meta.date && <div>Date: {meta.date}</div>}
              {meta.decision && <div>Appeal: {meta.decision} (filed {meta.filed_date})</div>}
            </div>
          )}

          {(kind === 'review_loop' || kind === 'dtm') && serviceType === 'Artwork' && (
            <StageAttachments stageId={stage.id} projectId={projectId}
              docType={kind === 'dtm' ? 'dtm' : 'revision'}
              label={kind === 'dtm' ? 'DTM file' : 'Artwork versions (V1, V2…)'} />
          )}

          <RoleGuard roles={['super_admin', 'director', 'manager', 'executive']}>
            {canAct && <div className="flex flex-wrap gap-2 pt-1">{renderActions()}</div>}
          </RoleGuard>

          {showSkip && (
            <div className="mt-2 space-y-2">
              <input value={skipReason} onChange={e => setSkipReason(e.target.value)} placeholder="Reason for skipping…"
                className="w-full px-3 py-2 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
              <div className="flex gap-2">
                <button onClick={submitSkip} className="px-3 py-1 bg-gray-600 text-white text-xs rounded-lg">Confirm</button>
                <button onClick={() => setShowSkip(false)} className="px-3 py-1 border border-border text-xs rounded-lg">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {capture && <CaptureModal kind={capture} stageCode={stage.stage_code ?? ''} serviceType={serviceType}
        appRefNo={appRefNo} form={form} setForm={setForm} busy={updateStage.isPending}
        onClose={() => setCapture(null)}
        onSubmit={
          capture === 'fee_submit' ? submitFeeSubmit : capture === 'fee' ? submitFeeOnly :
          capture === 'late_fee' ? submitLateFee : capture === 'submit_fssai' ? submitToFssai :
          capture === 'appeal' ? submitAppeal : submitEntry
        } />}
    </div>
  )

  // ── Per-kind action buttons ──
  function renderActions(): React.ReactNode {
    const started = stage.status === 'in_progress'
    switch (kind) {
      case 'doc_collection':
        return <>
          <label className="flex items-center gap-1.5 text-xs">Documents:
            <select value={docStatus ?? 'partial'} onChange={e => patch({ doc_status: e.target.value }, 'Document status updated')}
              className="text-xs px-2 py-1 border border-border rounded-lg">
              <option value="partial">Partial received</option>
              <option value="completed">Completed (all received)</option>
            </select>
          </label>
          <ActionBtn label="Mark Complete" icon="check_circle" color="green" disabled={docStatus !== 'completed'}
            title={docStatus !== 'completed' ? 'Set documents to "Completed" first' : ''} onClick={() => complete()} />
        </>
      case 'draft_approval':
        return <>
          {!started && <ActionBtn label="Start" icon="play_circle" color="brand" onClick={start} />}
          {started && clock === 'employee' && <ActionBtn label="Send to Client for Approval" icon="send" color="amber" onClick={() => setClock('client')} />}
          {started && clock === 'client' && <ActionBtn label="Received from Client" icon="inbox" color="green" onClick={() => setClock('employee')} />}
          {started && clock === 'employee' && <ActionBtn label="Mark Complete" icon="check_circle" color="green" onClick={() => complete()} />}
        </>
      case 'work':
        return <>
          {!started && <ActionBtn label="Start" icon="play_circle" color="brand" onClick={start} />}
          {started && clock === 'client' && <ActionBtn label="Received from Client" icon="inbox" color="green" onClick={() => setClock('employee')} />}
          {started && clock === 'employee' && <ActionBtn label="Mark Complete" icon="check_circle" color="green" onClick={() => complete()} />}
        </>
      case 'dtm':
        return <>
          {!started && <ActionBtn label="Start" icon="play_circle" color="brand" onClick={start} />}
          {started && clock === 'employee' && <ActionBtn label="Submit to Client" icon="send" color="amber" onClick={() => setClock('client')} />}
          {started && <ActionBtn label="Mark Complete" icon="check_circle" color="green" onClick={() => complete()} />}
        </>
      case 'client_review':
        return <>
          {clock === 'client' && <ActionBtn label="Received from Client" icon="inbox" color="green" onClick={() => setClock('employee')} />}
          <ActionBtn label="Mark Complete" icon="check_circle" color="green" onClick={() => complete()} />
        </>
      case 'review_loop':
        return <>
          {!started && <ActionBtn label="Start Review" icon="play_circle" color="brand" onClick={start} />}
          {started && clock === 'employee' && <ActionBtn label="Send Correction to Client" icon="send" color="amber" onClick={() => setClock('client')} />}
          {started && clock === 'client' && <ActionBtn label="Received for Review" icon="inbox" color="green" onClick={() => setClock('employee')} />}
          {started && clock === 'employee' && <ActionBtn label="Approve" icon="check_circle" color="green" onClick={() => complete()} />}
        </>
      case 'form_submit':
        return <ActionBtn label="Completed" icon="check_circle" color="green" onClick={() => complete()} />
      case 'fee_submit':
        return <>
          {clock === 'employee' && <ActionBtn label="Move to Client" icon="swap_horiz" color="amber" onClick={() => setClock('client')} />}
          {clock === 'client' && <ActionBtn label="Received from Client" icon="inbox" color="green" onClick={() => setClock('employee')} />}
          <ActionBtn label="Submit to FSSAI" icon="send" color="blue" onClick={() => openCapture('fee_submit', { paid_by: 'Client', kob_added: 'no' })} />
        </>
      case 'fee':
        return <ActionBtn label="Record Fee & Complete" icon="payments" color="green" onClick={() => openCapture('fee', { paid_by: 'Client' })} />
      case 'fee_optional':
        return <>
          <ActionBtn label="Not Applicable" icon="block" color="gray" onClick={() => patch({ status: 'not_required' }, 'Marked not required')} />
          <ActionBtn label="Record Penalty" icon="payments" color="amber" onClick={() => openCapture('late_fee', { paid_by: 'Client' })} />
        </>
      case 'submit_fssai':
        return <ActionBtn label="Submit to FSSAI" icon="send" color="blue" onClick={() => openCapture('submit_fssai', {})} />
      case 'status_fssai': {
        const opts = serviceType === 'Form II' ? FSSAI_STATUSES_FORM2 : FSSAI_STATUSES_DEFAULT
        return <label className="flex items-center gap-1.5 text-xs">FSSAI status:
          <select value={(stage as any).fssai_status ?? ''} onChange={e => setFssaiStatus(e.target.value)}
            className="text-xs px-2 py-1 border border-border rounded-lg">
            <option value="">— select —</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      }
      case 'appeal':
        return <>
          <ActionBtn label="Not Applicable" icon="block" color="gray" onClick={() => patch({ status: 'not_required' }, 'Marked not required')} />
          <ActionBtn label="Record Appeal" icon="gavel" color="brand" onClick={() => openCapture('appeal', {})} />
        </>
      case 'entry':
        return <ActionBtn label="Enter & Complete" icon="edit_note" color="green" onClick={() => openCapture('entry', {})} />
      default:
        return <>
          {!started && <ActionBtn label="Start" icon="play_circle" color="brand" onClick={start} />}
          {started && <ActionBtn label="Mark Complete" icon="check_circle" color="green" onClick={() => complete()} />}
        </>
    }
  }
}

// ── Capture modal ──
function CaptureModal({ kind, stageCode, serviceType, appRefNo, form, setForm, onSubmit, onClose, busy }: {
  kind: string; stageCode: string; serviceType?: string; appRefNo?: string | null
  form: Record<string, any>; setForm: (f: Record<string, any>) => void
  onSubmit: () => void; onClose: () => void; busy: boolean
}) {
  const set = (k: string, v: any) => setForm({ ...form, [k]: v })
  const ic = 'w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20'
  const title = kind === 'fee_submit' ? 'Submit to FSSAI' : kind === 'fee' ? 'Record Fee' : kind === 'late_fee' ? 'Late Fee / Penalty'
    : kind === 'submit_fssai' ? 'Submit Application to FSSAI' : kind === 'appeal' ? 'CEO Appeal'
    : stageCode === 'LICENCE_ISSUED' ? 'Licence Issued' : stageCode === 'APPROVAL_ISSUED' ? 'Approval Issued' : 'Complete Stage'
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 className="font-display font-semibold text-brand-950 text-sm">{title}</h3>

        {(kind === 'fee_submit' || kind === 'submit_fssai') && (
          <div className="text-xs bg-[#F8FAFC] border border-border rounded-lg p-2">
            App Ref No: {appRefNo ? <b className="text-brand-950">{appRefNo}</b> : <span className="text-red-600">Not set — add it in the project header first</span>}
          </div>
        )}

        {(kind === 'fee_submit' || kind === 'fee' || kind === 'late_fee') && <>
          <Field label="Amount paid (₹)"><input type="number" className={ic} value={form.amount ?? ''} onChange={e => set('amount', e.target.value)} /></Field>
          <Field label="Date"><input type="date" className={ic} value={form.date ?? ''} onChange={e => set('date', e.target.value)} /></Field>
          {kind !== 'late_fee' && <Field label="Paid by"><select className={ic} value={form.paid_by ?? 'Client'} onChange={e => set('paid_by', e.target.value)}><option>Client</option><option>TPS</option></select></Field>}
        </>}

        {kind === 'fee_submit' && needsProductKob(serviceType) && <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Products — Domestic"><input type="number" className={ic} value={form.domestic ?? ''} onChange={e => set('domestic', e.target.value)} /></Field>
            <Field label="Products — Export"><input type="number" className={ic} value={form.export ?? ''} onChange={e => set('export', e.target.value)} /></Field>
          </div>
          <Field label="Additional KOB added?"><select className={ic} value={form.kob_added ?? 'no'} onChange={e => set('kob_added', e.target.value)}><option value="no">No</option><option value="yes">Yes</option></select></Field>
          {form.kob_added === 'yes' && <Field label="KOB details"><input className={ic} value={form.kob_details ?? ''} onChange={e => set('kob_details', e.target.value)} /></Field>}
        </>}

        {kind === 'submit_fssai' && <Field label="Submission date"><input type="date" className={ic} value={form.date ?? ''} onChange={e => set('date', e.target.value)} /></Field>}

        {kind === 'entry' && stageCode === 'LICENCE_ISSUED' && <>
          <Field label="Licence No."><input className={ic} value={form.licence_no ?? ''} onChange={e => set('licence_no', e.target.value)} placeholder="e.g. 11225099000123" /></Field>
          <Field label="Issue Date"><input type="date" className={ic} value={form.issue_date ?? ''} onChange={e => set('issue_date', e.target.value)} /></Field>
        </>}
        {kind === 'entry' && stageCode === 'APPROVAL_ISSUED' && <Field label="Approval Date"><input type="date" className={ic} value={form.approval_date ?? ''} onChange={e => set('approval_date', e.target.value)} /></Field>}
        {kind === 'entry' && !['LICENCE_ISSUED', 'APPROVAL_ISSUED'].includes(stageCode) && <Field label="Date"><input type="date" className={ic} value={form.date ?? ''} onChange={e => set('date', e.target.value)} /></Field>}

        {kind === 'appeal' && <>
          <Field label="Appeal filed date"><input type="date" className={ic} value={form.filed_date ?? ''} onChange={e => set('filed_date', e.target.value)} /></Field>
          <Field label="Hearing date received"><input type="date" className={ic} value={form.hearing_received ?? ''} onChange={e => set('hearing_received', e.target.value)} /></Field>
          <Field label="Hearing done (date)"><input type="date" className={ic} value={form.hearing_done ?? ''} onChange={e => set('hearing_done', e.target.value)} /></Field>
          <Field label="Final decision"><select className={ic} value={form.decision ?? ''} onChange={e => set('decision', e.target.value)}><option value="">— pending —</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option></select></Field>
        </>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg">Cancel</button>
          <button onClick={onSubmit} disabled={busy} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  )
}

function ActionBtn({ label, icon, color, onClick, disabled, title }: {
  label: string; icon: string; color: 'brand' | 'green' | 'amber' | 'blue' | 'gray'; onClick: () => void; disabled?: boolean; title?: string
}) {
  const cls = { brand: 'bg-brand-600 hover:bg-brand-700', green: 'bg-green-600 hover:bg-green-700', amber: 'bg-amber-500 hover:bg-amber-600', blue: 'bg-blue-600 hover:bg-blue-700', gray: 'bg-gray-500 hover:bg-gray-600' }[color]
  return <button disabled={disabled} title={title} onClick={onClick}
    className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed', cls)}>
    <Sym name={icon} size={12} />{label}</button>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>{children}</div>
}
function TimeRow({ label, value, dt }: { label: string; value: string | null | undefined; dt?: boolean }) {
  if (!value) return null
  return <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p><p className="text-brand-950">{dt ? formatDateTime(value) : formatDate(value)}</p></div>
}
