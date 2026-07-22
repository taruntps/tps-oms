// HRMS — Payroll (M4): Salary Component master (/hrms/payroll/components), gate hrms.salary.manage.
// Configurable component catalogue — nothing hardcoded. CRUD over hr_component_master.
import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import { useComponents, useCreateComponent, useUpdateComponent } from '../hooks/useSalary'
import { inputCls } from './payrollShared'
import type { ComponentInput, ComponentType, CalcType } from '../api/salaryStructures'

const TYPES: ComponentType[] = ['earning', 'deduction', 'employer_contribution', 'reimbursement']
const CALC_TYPES: CalcType[] = ['fixed', 'percent_of_base', 'slab', 'formula', 'balancing']

const emptyForm: ComponentInput = {
  code: '', name: '', type: 'earning', calc_type: 'fixed', base_code: null, depends_on: null,
  is_taxable: true, is_pf_wage: false, is_esi_wage: false, is_part_of_ctc: true,
  is_part_of_gross: true, prorate_on_lop: true, sort_order: 100, is_active: true,
}

export default function ComponentMasterPage() {
  const canManage = useCan('hrms.salary.manage')
  const { data: components = [], isLoading } = useComponents()
  const createM = useCreateComponent()
  const updateM = useUpdateComponent()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<ComponentInput>(emptyForm)

  const startCreate = () => { setEditId(null); setForm(emptyForm); setOpen(true) }
  const startEdit = (c: any) => {
    setEditId(c.id)
    setForm({
      code: c.code, name: c.name, type: c.type, calc_type: c.calc_type, base_code: c.base_code,
      depends_on: c.depends_on, is_taxable: c.is_taxable, is_pf_wage: c.is_pf_wage,
      is_esi_wage: c.is_esi_wage, is_part_of_ctc: c.is_part_of_ctc, is_part_of_gross: c.is_part_of_gross,
      prorate_on_lop: c.prorate_on_lop, sort_order: c.sort_order, is_active: c.is_active,
    })
    setOpen(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editId) await updateM.mutateAsync({ id: editId, input: form })
      else await createM.mutateAsync(form)
      setOpen(false)
    } catch { /* toast surfaced by the hook */ }
  }

  return (
    <div>
      <TopBar title="Salary Components" subtitle="Component master — earnings, deductions, statutory & employer contributions" />
      <div className="p-6 animate-fade-up space-y-5">
        <div className="flex justify-end">
          {canManage && (
            <button onClick={startCreate} className="px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 flex items-center gap-1.5">
              <Sym name="add" size={16} /> New Component
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Calc</th>
                  <th className="px-4 py-3 font-medium">Base</th>
                  <th className="px-4 py-3 font-medium">Flags</th>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {components.map((c) => (
                  <tr key={c.id} className={`border-b border-border last:border-0 hover:bg-[#F8FAFC] ${c.is_active ? '' : 'opacity-50'}`}>
                    <td className="px-4 py-3 font-mono text-brand-950">{c.code}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.type.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.calc_type.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">{c.base_code ?? '—'}</td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground">
                      {[c.is_taxable && 'tax', c.is_pf_wage && 'pf', c.is_esi_wage && 'esi', c.prorate_on_lop && 'lop'].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.sort_order}</td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <button onClick={() => startEdit(c)} className="text-brand-600 hover:text-brand-700"><Sym name="edit" size={16} /></button>
                      )}
                    </td>
                  </tr>
                ))}
                {components.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No components.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && canManage && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display font-semibold text-brand-950">{editId ? 'Edit Component' : 'New Component'}</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
            </div>
            <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Code"><input className={inputCls} value={form.code} disabled={!!editId} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} required /></Field>
                <Field label="Name"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></Field>
                <Field label="Type">
                  <select className={inputCls} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as ComponentType })}>
                    {TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </Field>
                <Field label="Calc Type">
                  <select className={inputCls} value={form.calc_type} onChange={e => setForm({ ...form, calc_type: e.target.value as CalcType })}>
                    {CALC_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </Field>
                <Field label="Base Code"><input className={inputCls} value={form.base_code ?? ''} onChange={e => setForm({ ...form, base_code: e.target.value.toUpperCase() || null })} placeholder="GROSS, BASIC…" /></Field>
                <Field label="Sort Order"><input type="number" className={inputCls} value={form.sort_order ?? 0} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['is_taxable', 'Taxable'], ['is_pf_wage', 'PF wage'], ['is_esi_wage', 'ESI wage'],
                  ['is_part_of_ctc', 'Part of CTC'], ['is_part_of_gross', 'Part of gross'], ['prorate_on_lop', 'Prorate on LOP'],
                  ['is_active', 'Active'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-brand-950">
                    <input type="checkbox" checked={!!(form as any)[key]} onChange={e => setForm({ ...form, [key]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
            </form>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button onClick={() => setOpen(false)} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={submit} disabled={createM.isPending || updateM.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Save</button>
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
