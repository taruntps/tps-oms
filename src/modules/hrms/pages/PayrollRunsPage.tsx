// HRMS — Payroll (M4): Payroll Runs (/hrms/payroll/runs), gate hrms.payroll.view.
// List runs; create + compute gated by hrms.payroll.process (segregation of duties — a
// different holder approves/locks in the detail page).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import { useRuns, useCreateRun, useComputeRun } from '../hooks/usePayroll'
import { useOrganizations } from '../hooks/useSalary'
import { RunStatusPill, monthName, MONTHS, inputCls } from './payrollShared'

export default function PayrollRunsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canProcess = useCan('hrms.payroll.process')
  const { data: runs = [], isLoading } = useRuns()
  const { data: orgs = [] } = useOrganizations()
  const createM = useCreateRun(user?.id)
  const computeM = useComputeRun()

  const now = new Date()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ org_id: '', period_month: now.getUTCMonth() + 1, period_year: now.getUTCFullYear() })

  const openCreate = () => {
    setForm({ org_id: orgs[0]?.id ?? '', period_month: now.getUTCMonth() + 1, period_year: now.getUTCFullYear() })
    setOpen(true)
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.org_id) return
    try {
      const run = await createM.mutateAsync({ org_id: form.org_id, period_month: Number(form.period_month), period_year: Number(form.period_year) })
      setOpen(false)
      navigate(`/hrms/payroll/runs/${run.id}`)
    } catch { /* toast */ }
  }

  return (
    <div>
      <TopBar title="Payroll Runs" subtitle="Create, compute and process monthly payroll" />
      <div className="p-6 animate-fade-up space-y-5">
        <div className="flex justify-end">
          {canProcess && (
            <button onClick={openCreate} className="px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 flex items-center gap-1.5">
              <Sym name="add" size={16} /> New Run
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : runs.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="receipt_long" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No payroll runs yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Run</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Version</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-[#F8FAFC] cursor-pointer" onClick={() => navigate(`/hrms/payroll/runs/${r.id}`)}>
                    <td className="px-4 py-3 font-mono text-brand-950">{r.run_no ?? r.id.slice(0, 8)}{r.is_adjustment && <span className="ml-2 text-[10px] text-amber-600">ADJ</span>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{monthName(r.period_month)} {r.period_year}</td>
                    <td className="px-4 py-3 text-muted-foreground">v{r.version}</td>
                    <td className="px-4 py-3"><RunStatusPill status={r.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {canProcess && (r.status === 'draft' || r.status === 'computed') && (
                        <button onClick={() => computeM.mutate(r.id)} disabled={computeM.isPending} className="px-2.5 py-1.5 text-xs border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">
                          {r.status === 'draft' ? 'Compute' : 'Recompute'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && canProcess && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display font-semibold text-brand-950">New Payroll Run</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
            </div>
            <form onSubmit={submit} className="px-6 py-5 space-y-4">
              <Field label="Organization">
                <select className={inputCls} value={form.org_id} onChange={e => setForm({ ...form, org_id: e.target.value })} required>
                  <option value="">Select…</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.legal_name ?? o.id.slice(0, 8)}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Month">
                  <select className={inputCls} value={form.period_month} onChange={e => setForm({ ...form, period_month: Number(e.target.value) })}>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Year"><input type="number" className={inputCls} value={form.period_year} onChange={e => setForm({ ...form, period_year: Number(e.target.value) })} /></Field>
              </div>
            </form>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button onClick={() => setOpen(false)} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={submit} disabled={createM.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}
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
