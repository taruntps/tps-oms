// HRMS — Payroll (M4): Payroll Run detail (/hrms/payroll/runs/:id), gate hrms.payroll.view.
// Register (lines + component/statutory breakdown), validation exceptions panel, and the run
// lifecycle: recompute (process) → approve + lock (approve) → payslips → Finance handoff →
// bank advice (only when handoff authorized). Finance writes NO GL — this only records the batch.
import { Fragment, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import { useAuth } from '@/contexts/AuthContext'
import { useEmployees } from '../hooks/useEmployees'
import {
  useRun, useRunLines, useComponentLines, useComputeRun, useValidateRun,
  useApproveRun, useRejectRun, useLockRun, useGeneratePayslips,
  useHandoff, useSetHandoffStatus, useBankAdvice, useBankAdviceLines,
  useGenerateBankAdvice, useMarkBankAdviceExported,
} from '../hooks/usePayroll'
import { RunStatusPill, HandoffStatusPill, monthName, fmtPaise, fmtDays } from './payrollShared'

export default function PayrollRunDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const canProcess = useCan('hrms.payroll.process')
  const canApprove = useCan('hrms.payroll.approve')

  const { data: run, isLoading } = useRun(id)
  const { data: lines = [] } = useRunLines(id)
  const { data: employees = [] } = useEmployees()
  const lineIds = useMemo(() => lines.map(l => l.id), [lines])
  const { data: compLines = [] } = useComponentLines(lineIds)
  const { data: validation } = useValidateRun(run?.status === 'computed' ? id : undefined)
  const { data: handoff } = useHandoff(run?.status === 'locked' || run?.status === 'paid' ? id : undefined)
  const { data: advice } = useBankAdvice(handoff?.status === 'authorized' || handoff?.status === 'paid' ? id : undefined)
  const { data: adviceLines = [] } = useBankAdviceLines(advice?.id)

  const computeM = useComputeRun()
  const approveM = useApproveRun(user?.id)
  const rejectM = useRejectRun()
  const lockM = useLockRun()
  const payslipM = useGeneratePayslips()
  const handoffM = useSetHandoffStatus(user?.id)
  const adviceM = useGenerateBankAdvice(user?.id)
  const exportM = useMarkBankAdviceExported()

  const [expanded, setExpanded] = useState<string | null>(null)

  const empName = useMemo(() => new Map(employees.map(e => [e.id, e.name ?? e.employee_code ?? e.id.slice(0, 8)])), [employees])
  const compByLine = useMemo(() => {
    const m = new Map<string, typeof compLines>()
    for (const c of compLines) { const a = m.get(c.payroll_line_id) ?? []; a.push(c); m.set(c.payroll_line_id, a) }
    return m
  }, [compLines])

  const totalNet = lines.reduce((a, l) => a + Number(l.net_pay), 0)

  if (isLoading || !run) {
    return <div><TopBar title="Payroll Run" /><div className="p-6"><div className="h-40 bg-white rounded-xl border border-border animate-pulse" /></div></div>
  }

  const isLocked = run.status === 'locked' || run.status === 'paid'

  return (
    <div>
      <TopBar title={`Payroll — ${monthName(run.period_month)} ${run.period_year}`} subtitle={run.run_no ?? undefined} />
      <div className="p-6 animate-fade-up space-y-5">
        <Link to="/hrms/payroll/runs" className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1"><Sym name="arrow_back" size={16} /> All runs</Link>

        {/* Summary + lifecycle actions */}
        <div className="bg-white rounded-xl border border-border p-5 flex flex-wrap items-center gap-x-8 gap-y-3">
          <div><div className="text-[11px] uppercase text-muted-foreground">Status</div><RunStatusPill status={run.status} /></div>
          <div><div className="text-[11px] uppercase text-muted-foreground">Lines</div><div className="font-medium text-brand-950">{lines.length}</div></div>
          <div><div className="text-[11px] uppercase text-muted-foreground">Total Net</div><div className="font-medium text-brand-950">{fmtPaise(totalNet)}</div></div>
          <div className="flex-1" />
          <div className="flex flex-wrap gap-2">
            {canProcess && (run.status === 'draft' || run.status === 'computed') && (
              <button onClick={() => computeM.mutate(id)} disabled={computeM.isPending} className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">
                {run.status === 'draft' ? 'Compute' : 'Recompute'}
              </button>
            )}
            {canApprove && run.status === 'computed' && (
              <>
                <button onClick={() => approveM.mutate(id)} disabled={approveM.isPending || (validation && !validation.ok)} title={validation && !validation.ok ? 'Resolve blocking exceptions first' : ''} className="px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Approve</button>
                <button onClick={() => rejectM.mutate({ runId: id })} disabled={rejectM.isPending} className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">Reject</button>
              </>
            )}
            {canApprove && run.status === 'approved' && (
              <button onClick={() => lockM.mutate(id)} disabled={lockM.isPending} className="px-3 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">Lock & Handoff</button>
            )}
            {isLocked && (
              <button onClick={() => payslipM.mutate(id)} disabled={payslipM.isPending} className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">Publish Payslips</button>
            )}
          </div>
        </div>

        {/* Segregation-of-duties note */}
        {run.created_by && run.created_by === user?.id && run.status === 'computed' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800">
            <Sym name="info" size={14} className="inline mr-1" /> You created this run — segregation of duties requires a different approver to approve/lock it.
          </div>
        )}

        {/* Validation / exceptions */}
        {run.status === 'computed' && validation && (
          <div className={`rounded-xl border p-4 ${validation.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
            <div className="flex items-center gap-2 font-medium text-sm mb-1">
              <Sym name={validation.ok ? 'check_circle' : 'error'} size={16} className={validation.ok ? 'text-emerald-600' : 'text-rose-600'} />
              {validation.ok ? 'Validation passed' : 'Validation exceptions'}
            </div>
            {validation.errors.map((er, i) => <div key={`e${i}`} className="text-sm text-rose-700">• {er}</div>)}
            {validation.warnings.map((w, i) => <div key={`w${i}`} className="text-sm text-amber-700">• {w}</div>)}
          </div>
        )}

        {/* Register */}
        <div className="bg-white rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium text-right">Payable</th>
                <th className="px-4 py-3 font-medium text-right">LOP</th>
                <th className="px-4 py-3 font-medium text-right">Gross</th>
                <th className="px-4 py-3 font-medium text-right">Statutory</th>
                <th className="px-4 py-3 font-medium text-right">Deductions</th>
                <th className="px-4 py-3 font-medium text-right">Net</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <Fragment key={l.id}>
                  <tr className="border-b border-border hover:bg-[#F8FAFC] cursor-pointer" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                    <td className="px-4 py-3 font-medium text-brand-950">{empName.get(l.employee_id) ?? l.employee_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{fmtDays(l.payable_days)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{fmtDays(l.lop_days)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{fmtPaise(l.gross)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{fmtPaise(l.total_statutory)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{fmtPaise(l.total_deductions)}</td>
                    <td className="px-4 py-3 text-right font-medium text-brand-950">{fmtPaise(l.net_pay)}</td>
                    <td className="px-4 py-3 text-right"><Sym name={expanded === l.id ? 'expand_less' : 'expand_more'} size={16} className="text-muted-foreground" /></td>
                  </tr>
                  {expanded === l.id && (
                    <tr className="bg-[#FBFCFE]">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Component breakdown{Number(l.round_off) !== 0 && ` · round-off ${fmtPaise(l.round_off)}`}</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-1">
                          {(compByLine.get(l.id) ?? []).map(c => (
                            <div key={c.id} className="flex justify-between text-sm">
                              <span className="text-muted-foreground font-mono">{c.component_code}{c.component_type === 'employer_contribution' ? ' (er)' : ''}</span>
                              <span className={c.component_type === 'deduction' ? 'text-rose-600' : 'text-brand-950'}>
                                {c.component_type === 'deduction' ? '−' : ''}{fmtPaise(c.amount)}
                              </span>
                            </div>
                          ))}
                          {(compByLine.get(l.id) ?? []).length === 0 && <span className="text-sm text-muted-foreground">No component lines.</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {lines.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No lines — compute the run.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Finance handoff + bank advice */}
        {isLocked && (
          <div className="bg-white rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-medium text-brand-950 flex items-center gap-2"><Sym name="account_balance" size={16} /> Finance Handoff</h3>
            {handoff ? (
              <>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                  <div><span className="text-muted-foreground">Batch</span> <span className="font-mono text-brand-950">{handoff.batch_ref}</span></div>
                  <div><span className="text-muted-foreground">Total</span> <span className="font-medium text-brand-950">{fmtPaise(handoff.amount_total)}</span></div>
                  <div><HandoffStatusPill status={handoff.status} /></div>
                </div>
                <p className="text-[11px] text-muted-foreground">Payroll records the approved batch only — Finance authorizes and executes disbursement; no GL entries are posted by Payroll.</p>
                <div className="flex flex-wrap gap-2">
                  {canApprove && handoff.status === 'pending' && (
                    <button onClick={() => handoffM.mutate({ runId: id, status: 'finance_review' })} className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Send to Finance review</button>
                  )}
                  {canApprove && (handoff.status === 'pending' || handoff.status === 'finance_review') && (
                    <button onClick={() => handoffM.mutate({ runId: id, status: 'authorized' })} className="px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700">Authorize</button>
                  )}
                  {canApprove && handoff.status === 'authorized' && !advice && (
                    <button onClick={() => adviceM.mutate(id)} disabled={adviceM.isPending} className="px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Generate Bank Advice</button>
                  )}
                  {canApprove && handoff.status === 'authorized' && (
                    <button onClick={() => handoffM.mutate({ runId: id, status: 'paid' })} className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Confirm Paid</button>
                  )}
                </div>
              </>
            ) : <p className="text-sm text-muted-foreground">Handoff not created.</p>}

            {advice && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-brand-950">Bank Advice · <span className="capitalize">{advice.status}</span></h4>
                  {advice.status === 'generated' && (
                    <button onClick={() => exportM.mutate(advice.id)} className="text-sm text-brand-600 hover:text-brand-700">Mark exported</button>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] uppercase text-muted-foreground border-b border-border"><th className="py-1.5 font-medium">Employee</th><th className="py-1.5 font-medium">Bank Ref</th><th className="py-1.5 font-medium text-right">Amount</th></tr></thead>
                  <tbody>
                    {adviceLines.map(al => (
                      <tr key={al.id} className="border-b border-border last:border-0">
                        <td className="py-1.5 text-brand-950">{empName.get(al.employee_id) ?? al.employee_id.slice(0, 8)}</td>
                        <td className="py-1.5 font-mono text-muted-foreground">{al.bank_ref || '— no bank —'}</td>
                        <td className="py-1.5 text-right text-brand-950">{fmtPaise(al.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
