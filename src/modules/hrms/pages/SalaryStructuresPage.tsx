// HRMS — Payroll (M4): Salary Structures + effective-dated employee salary assignment
// (/hrms/payroll/structures), gate hrms.salary.view (view) / hrms.salary.manage (edit).
// Two tabs: structure templates (CRUD + component lines) and per-employee salary assignment
// with revision history. Money is paise — inputs are in ₹ and converted (×100) on save.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import { useEmployees } from '../hooks/useEmployees'
import {
  useStructures, useStructureComponents, useCreateStructure, useSetStructureComponents,
  useComponents, useEmployeeSalaries, useCurrentSalary, useSalaryComponents, useAssignSalary, useRevisions,
} from '../hooks/useSalary'
import { fmtPaise, inputCls } from './payrollShared'
import type { StructureComponentInput } from '../api/salaryStructures'

export default function SalaryStructuresPage() {
  const canManage = useCan('hrms.salary.manage')
  const [tab, setTab] = useState<'structures' | 'assignment'>('structures')

  return (
    <div>
      <TopBar title="Salary Structures" subtitle="CTC templates & effective-dated employee salary assignment" />
      <div className="p-6 animate-fade-up space-y-5">
        <div className="flex gap-1 border-b border-border">
          {(['structures', 'assignment'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-brand-950'}`}>
              {t === 'structures' ? 'Structures' : 'Employee Salary'}
            </button>
          ))}
        </div>
        {tab === 'structures' ? <StructuresTab canManage={canManage} /> : <AssignmentTab canManage={canManage} />}
      </div>
    </div>
  )
}

// ── Structures tab ──────────────────────────────────────────────────────────────
function StructuresTab({ canManage }: { canManage: boolean }) {
  const { data: structures = [], isLoading } = useStructures()
  const { data: components = [] } = useComponents()
  const createM = useCreateStructure()
  const [selId, setSelId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [nc, setNc] = useState({ code: '', name: '' })

  const { data: lines = [] } = useStructureComponents(selId ?? undefined)
  const setLinesM = useSetStructureComponents()
  const [draft, setDraft] = useState<StructureComponentInput[] | null>(null)
  const rows = draft ?? lines.map(l => ({ component_code: l.component_code, value_type: l.value_type, value: l.value, sort_order: l.sort_order }))

  const createStructure = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const s = await createM.mutateAsync({ code: nc.code, name: nc.name, is_active: true })
      setNewOpen(false); setNc({ code: '', name: '' }); setSelId(s.id); setDraft([])
    } catch { /* toast */ }
  }

  const saveLines = async () => {
    if (!selId || !draft) return
    try { await setLinesM.mutateAsync({ structureId: selId, lines: draft }); setDraft(null) } catch { /* toast */ }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-1 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium text-brand-950">Templates</h3>
          {canManage && <button onClick={() => setNewOpen(true)} className="text-brand-600 hover:text-brand-700 flex items-center gap-1 text-sm"><Sym name="add" size={16} /> New</button>}
        </div>
        {isLoading ? <div className="h-24 bg-white rounded-lg border border-border animate-pulse" /> : (
          <div className="space-y-2">
            {structures.map(s => (
              <button key={s.id} onClick={() => { setSelId(s.id); setDraft(null) }}
                className={`w-full text-left px-4 py-3 rounded-lg border ${selId === s.id ? 'border-brand-600 bg-brand-50' : 'border-border bg-white hover:bg-[#F8FAFC]'}`}>
                <div className="font-medium text-brand-950">{s.name}</div>
                <div className="text-[11px] font-mono text-muted-foreground">{s.code}</div>
              </button>
            ))}
            {structures.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No structures.</p>}
          </div>
        )}
      </div>

      <div className="lg:col-span-2">
        {selId ? (
          <div className="bg-white rounded-xl border border-border p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-brand-950">Component Lines</h3>
              {canManage && (
                <div className="flex gap-2">
                  <button onClick={() => setDraft([...rows, { component_code: components[0]?.code ?? '', value_type: 'percent', value: 0, sort_order: rows.length }])}
                    className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1"><Sym name="add" size={14} /> Add line</button>
                  {draft && <button onClick={saveLines} disabled={setLinesM.isPending} className="px-3 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50">Save</button>}
                </div>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 font-medium">Component</th>
                  <th className="py-2 font-medium">Value Type</th>
                  <th className="py-2 font-medium">Value</th>
                  {canManage && <th className="py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2">
                      {draft ? (
                        <select className={inputCls} value={r.component_code} onChange={e => updateRow(draft, setDraft, i, { component_code: e.target.value })}>
                          {components.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                        </select>
                      ) : <span className="font-mono text-brand-950">{r.component_code}</span>}
                    </td>
                    <td className="py-2">
                      {draft ? (
                        <select className={inputCls} value={r.value_type} onChange={e => updateRow(draft, setDraft, i, { value_type: e.target.value as 'amount' | 'percent' })}>
                          <option value="percent">percent</option>
                          <option value="amount">amount (paise)</option>
                        </select>
                      ) : <span className="text-muted-foreground">{r.value_type}</span>}
                    </td>
                    <td className="py-2">
                      {draft ? (
                        <input type="number" className={inputCls} value={r.value} onChange={e => updateRow(draft, setDraft, i, { value: Number(e.target.value) })} />
                      ) : <span className="text-muted-foreground">{r.value_type === 'amount' ? fmtPaise(r.value) : `${r.value}%`}</span>}
                    </td>
                    {canManage && draft && (
                      <td className="py-2 text-right"><button onClick={() => setDraft(draft.filter((_, j) => j !== i))} className="text-rose-500 hover:text-rose-600"><Sym name="delete" size={16} /></button></td>
                    )}
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No component lines.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="payments" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Select a structure to edit its component lines.</p>
          </div>
        )}
      </div>

      {newOpen && canManage && (
        <Modal title="New Structure" onClose={() => setNewOpen(false)} onSubmit={createStructure} pending={createM.isPending}>
          <Field label="Code"><input className={inputCls} value={nc.code} onChange={e => setNc({ ...nc, code: e.target.value.toUpperCase() })} required /></Field>
          <Field label="Name"><input className={inputCls} value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} required /></Field>
        </Modal>
      )}
    </div>
  )
}

function updateRow(draft: StructureComponentInput[], setDraft: (d: StructureComponentInput[]) => void, i: number, patch: Partial<StructureComponentInput>) {
  setDraft(draft.map((r, j) => (j === i ? { ...r, ...patch } : r)))
}

// ── Assignment tab ──────────────────────────────────────────────────────────────
function AssignmentTab({ canManage }: { canManage: boolean }) {
  const { user } = useAuth()
  const { data: employees = [] } = useEmployees()
  const { data: structures = [] } = useStructures()
  const { data: components = [] } = useComponents()
  const [empId, setEmpId] = useState<string>('')
  const { data: current } = useCurrentSalary(empId || undefined)
  const { data: history = [] } = useEmployeeSalaries(empId || undefined)
  const { data: curComps = [] } = useSalaryComponents(current?.id)
  const { data: revisions = [] } = useRevisions(empId || undefined)
  const assignM = useAssignSalary(user?.id)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ structure_id: '', ctcRupees: '', effective_from: new Date().toISOString().slice(0, 10), reason: '' })
  const [compRows, setCompRows] = useState<{ component_code: string; mode: 'amount' | 'percent'; value: string }[]>([])

  const empName = useMemo(() => new Map(employees.map(e => [e.id, e.name ?? e.employee_code ?? e.id.slice(0, 8)])), [employees])

  const openAssign = () => {
    setForm({ structure_id: structures[0]?.id ?? '', ctcRupees: '', effective_from: new Date().toISOString().slice(0, 10), reason: '' })
    setCompRows([])
    setOpen(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!empId) return
    const ctcPaise = Math.round(Number(form.ctcRupees || 0) * 100)
    try {
      await assignM.mutateAsync({
        employee_id: empId,
        structure_id: form.structure_id || null,
        ctc: ctcPaise,
        effective_from: form.effective_from,
        reason: form.reason.trim() || null,
        source: 'manual',
        components: compRows.map(r => ({
          component_code: r.component_code,
          amount: r.mode === 'amount' ? Math.round(Number(r.value || 0) * 100) : null,
          percent: r.mode === 'percent' ? Number(r.value || 0) : null,
        })),
      })
      setOpen(false)
    } catch { /* toast */ }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-brand-950 mb-1">Employee</label>
          <select className={`${inputCls} min-w-[240px]`} value={empId} onChange={e => setEmpId(e.target.value)}>
            <option value="">Select employee…</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name || e.employee_code || e.id.slice(0, 8)}</option>)}
          </select>
        </div>
        {empId && canManage && (
          <button onClick={openAssign} className="px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 flex items-center gap-1.5">
            <Sym name="add" size={16} /> Assign / Revise
          </button>
        )}
      </div>

      {empId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="text-sm font-medium text-brand-950 mb-3">Current Salary</h3>
            {current ? (
              <>
                <div className="flex justify-between text-sm mb-1"><span className="text-muted-foreground">CTC (annual)</span><span className="font-medium text-brand-950">{fmtPaise(current.ctc)}</span></div>
                <div className="flex justify-between text-sm mb-3"><span className="text-muted-foreground">Effective from</span><span className="text-brand-950">{formatDate(current.effective_from)}</span></div>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border"><th className="py-1.5 font-medium">Component</th><th className="py-1.5 font-medium">Value</th></tr></thead>
                  <tbody>
                    {curComps.map(c => (
                      <tr key={c.id} className="border-b border-border last:border-0">
                        <td className="py-1.5 font-mono text-brand-950">{c.component_code}</td>
                        <td className="py-1.5 text-muted-foreground">{c.amount != null ? fmtPaise(c.amount) : c.percent != null ? `${c.percent}%` : '—'}</td>
                      </tr>
                    ))}
                    {curComps.length === 0 && <tr><td colSpan={2} className="py-4 text-center text-muted-foreground">No resolved components.</td></tr>}
                  </tbody>
                </table>
              </>
            ) : <p className="text-sm text-muted-foreground py-4">No active salary assigned.</p>}
          </div>

          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="text-sm font-medium text-brand-950 mb-3">Revision History</h3>
            <div className="space-y-2">
              {revisions.map(r => (
                <div key={r.id} className="flex justify-between text-sm border-b border-border last:border-0 py-1.5">
                  <span className="text-muted-foreground">{formatDate(r.effective_date)} · <span className="capitalize">{r.source}</span></span>
                  <span className="text-brand-950 italic">{r.reason || '—'}</span>
                </div>
              ))}
              {revisions.length === 0 && <p className="text-sm text-muted-foreground py-4">No revisions.</p>}
            </div>
            {history.length > 0 && (
              <div className="mt-4 text-[11px] text-muted-foreground">{history.length} salary record{history.length === 1 ? '' : 's'} (incl. superseded) for {empName.get(empId)}.</div>
            )}
          </div>
        </div>
      )}

      {open && canManage && (
        <Modal title="Assign / Revise Salary" onClose={() => setOpen(false)} onSubmit={submit} pending={assignM.isPending} wide>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Structure">
              <select className={inputCls} value={form.structure_id} onChange={e => setForm({ ...form, structure_id: e.target.value })}>
                <option value="">— none —</option>
                {structures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="CTC (annual, ₹)"><input type="number" className={inputCls} value={form.ctcRupees} onChange={e => setForm({ ...form, ctcRupees: e.target.value })} required /></Field>
            <Field label="Effective From"><input type="date" className={inputCls} value={form.effective_from} onChange={e => setForm({ ...form, effective_from: e.target.value })} required /></Field>
            <Field label="Reason"><input className={inputCls} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Annual increment…" /></Field>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs font-medium text-brand-950">Resolved Components (overrides)</span>
            <button type="button" onClick={() => setCompRows([...compRows, { component_code: components[0]?.code ?? '', mode: 'percent', value: '' }])} className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1"><Sym name="add" size={14} /> Add</button>
          </div>
          {compRows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              <select className={inputCls} value={r.component_code} onChange={e => setCompRows(compRows.map((x, j) => j === i ? { ...x, component_code: e.target.value } : x))}>
                {components.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
              <select className={inputCls} value={r.mode} onChange={e => setCompRows(compRows.map((x, j) => j === i ? { ...x, mode: e.target.value as 'amount' | 'percent' } : x))}>
                <option value="percent">percent</option>
                <option value="amount">amount (₹)</option>
              </select>
              <input type="number" className={inputCls} value={r.value} onChange={e => setCompRows(compRows.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
              <button type="button" onClick={() => setCompRows(compRows.filter((_, j) => j !== i))} className="text-rose-500 hover:text-rose-600"><Sym name="delete" size={16} /></button>
            </div>
          ))}
        </Modal>
      )}
    </div>
  )
}

// ── shared modal + field ──────────────────────────────────────────────────────
function Modal({ title, children, onClose, onSubmit, pending, wide }: { title: string; children: React.ReactNode; onClose: () => void; onSubmit: (e: React.FormEvent) => void; pending?: boolean; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} shadow-2xl max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <form onSubmit={onSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">{children}</form>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={onSubmit} disabled={pending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Save</button>
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
