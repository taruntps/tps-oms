// HRMS — Payroll (M4): Statutory Config (/hrms/payroll/statutory), gate hrms.salary.manage.
// Effective-dated editor for PF/ESI/PT/TDS/GRATUITY/BONUS/LWF params. Amendments are additive
// inserts (never destructive) so historical runs reproduce. Placeholders are 0/[]/{} until set.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import { useStatutoryConfig, useAmendStatutoryConfig } from '../hooks/useSalary'
import { inputCls } from './payrollShared'
import type { Statute, StatutoryConfigInput } from '../api/statutoryConfig'

const STATUTES: Statute[] = ['PF', 'ESI', 'PT', 'TDS', 'GRATUITY', 'BONUS', 'LWF']

export default function StatutoryConfigPage() {
  const canManage = useCan('hrms.salary.manage')
  const { user } = useAuth()
  const { data: rows = [], isLoading } = useStatutoryConfig()
  const amendM = useAmendStatutoryConfig(user?.id)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<{ statute: Statute; param_key: string; valueText: string; effective_from: string; note: string }>({
    statute: 'PF', param_key: '', valueText: '0', effective_from: new Date().toISOString().slice(0, 10), note: '',
  })
  const [jsonError, setJsonError] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const m = new Map<string, typeof rows>()
    for (const r of rows) {
      const arr = m.get(r.statute) ?? []
      arr.push(r)
      m.set(r.statute, arr)
    }
    return m
  }, [rows])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    let value: unknown
    try {
      value = JSON.parse(form.valueText)
    } catch {
      setJsonError('Value must be valid JSON (e.g. 12, 1500000, [] or {}).')
      return
    }
    setJsonError(null)
    const input: StatutoryConfigInput = {
      statute: form.statute, param_key: form.param_key.trim(), value,
      effective_from: form.effective_from, note: form.note.trim() || null,
    }
    try {
      await amendM.mutateAsync(input)
      setOpen(false)
    } catch { /* toast surfaced by the hook */ }
  }

  return (
    <div>
      <TopBar title="Statutory Config" subtitle="Effective-dated PF / ESI / PT / TDS & other statutory parameters — nothing hardcoded" />
      <div className="p-6 animate-fade-up space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground max-w-2xl">
            Rates (percent), ceilings (paise) and PT slabs are read effective-dated by the engine. Placeholder rows compute to 0 until real values are entered here.
          </p>
          {canManage && (
            <button onClick={() => setOpen(true)} className="px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 flex items-center gap-1.5">
              <Sym name="add" size={16} /> Amend Param
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : (
          STATUTES.filter(s => grouped.has(s)).map(statute => (
            <div key={statute} className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-[#F8FAFC] font-medium text-brand-950">{statute}</div>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Param</th>
                    <th className="px-4 py-2 font-medium">Value</th>
                    <th className="px-4 py-2 font-medium">Effective From</th>
                    <th className="px-4 py-2 font-medium">Effective To</th>
                    <th className="px-4 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {(grouped.get(statute) ?? []).map(r => (
                    <tr key={r.id} className={`border-b border-border last:border-0 ${r.effective_to ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2 font-mono text-brand-950">{r.param_key}</td>
                      <td className="px-4 py-2 font-mono text-muted-foreground max-w-[280px] truncate">{JSON.stringify(r.value)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{formatDate(r.effective_from)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.effective_to ? formatDate(r.effective_to) : '— current'}</td>
                      <td className="px-4 py-2 text-muted-foreground/80 italic">{r.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          ))
        )}
      </div>

      {open && canManage && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display font-semibold text-brand-950">Amend Statutory Param</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
            </div>
            <form onSubmit={submit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Statute">
                  <select className={inputCls} value={form.statute} onChange={e => setForm({ ...form, statute: e.target.value as Statute })}>
                    {STATUTES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Param Key"><input className={inputCls} value={form.param_key} onChange={e => setForm({ ...form, param_key: e.target.value })} placeholder="employee_rate…" required /></Field>
              </div>
              <Field label="Value (JSON)">
                <textarea className={inputCls} rows={3} value={form.valueText} onChange={e => setForm({ ...form, valueText: e.target.value })} placeholder='12  ·  1500000  ·  [{"up_to":2500000,"amount":20000}]' />
              </Field>
              {jsonError && <p className="text-xs text-rose-600">{jsonError}</p>}
              <Field label="Effective From"><input type="date" className={inputCls} value={form.effective_from} onChange={e => setForm({ ...form, effective_from: e.target.value })} required /></Field>
              <Field label="Note"><input className={inputCls} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></Field>
            </form>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button onClick={() => setOpen(false)} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={submit} disabled={amendM.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Amend</button>
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
