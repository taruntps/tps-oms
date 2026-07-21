// HRMS — config-driven CRUD list for an employee child table.
// Renders existing rows as compact cards with add/edit modal + delete, gated by
// `canManage`. One component backs bank, nominees, qualifications, etc.
import { useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useChildRows, useChildMutations } from '../hooks/useChildTables'
import type { ChildTable, ChildRow } from '../api/childTables'

export interface ChildField {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'checkbox' | 'select'
  options?: string[]
  required?: boolean
  colSpan?: 1 | 2
}

interface Props {
  table: ChildTable
  employeeId: string
  title: string
  icon: string
  fields: ChildField[]
  /** Field keys shown as the card's primary line (joined). */
  primaryKeys: string[]
  canManage: boolean
}

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

function emptyForm(fields: ChildField[]): Record<string, any> {
  const f: Record<string, any> = {}
  for (const fld of fields) f[fld.key] = fld.type === 'checkbox' ? false : ''
  return f
}

function toFormValues(fields: ChildField[], row: ChildRow): Record<string, any> {
  const f: Record<string, any> = {}
  for (const fld of fields) {
    const v = row[fld.key]
    f[fld.key] = fld.type === 'checkbox' ? !!v : v ?? ''
  }
  return f
}

function toPayload(fields: ChildField[], form: Record<string, any>): Record<string, unknown> {
  const p: Record<string, unknown> = {}
  for (const fld of fields) {
    const raw = form[fld.key]
    if (fld.type === 'checkbox') p[fld.key] = !!raw
    else if (fld.type === 'number') p[fld.key] = raw === '' || raw == null ? null : Number(raw)
    else p[fld.key] = raw === '' ? null : raw
  }
  return p
}

function display(fld: ChildField, v: any): string {
  if (v == null || v === '') return '—'
  if (fld.type === 'checkbox') return v ? 'Yes' : 'No'
  if (fld.type === 'date') return formatDate(v)
  return String(v)
}

export function ChildTableSection({ table, employeeId, title, icon, fields, primaryKeys, canManage }: Props) {
  const { data: rows = [], isLoading } = useChildRows(table, employeeId)
  const { create, update, remove } = useChildMutations(table, employeeId)

  const [editing, setEditing] = useState<ChildRow | 'new' | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})

  const openNew = () => { setForm(emptyForm(fields)); setEditing('new') }
  const openEdit = (row: ChildRow) => { setForm(toFormValues(fields, row)); setEditing(row) }
  const close = () => setEditing(null)

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const canSave = fields.filter(f => f.required).every(f => String(form[f.key] ?? '').trim() !== '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    const payload = toPayload(fields, form)
    try {
      if (editing === 'new') await create.mutateAsync(payload)
      else if (editing) await update.mutateAsync({ id: editing.id, payload })
      close()
    } catch { /* toast surfaced by the hook */ }
  }

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sym name={icon} size={18} className="text-brand-600" />
          <h3 className="text-sm font-semibold text-brand-950">{title}</h3>
          <span className="text-[10px] text-muted-foreground bg-[#F8FAFC] border border-border rounded-full px-1.5 py-0.5">{rows.length}</span>
        </div>
        {canManage && (
          <button onClick={openNew} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-[#F8FAFC]">
            <Sym name="add" size={14} /> Add
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="h-16 bg-[#F8FAFC] rounded-lg animate-pulse" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No records.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(row => (
            <li key={row.id} className="border border-border rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-brand-950">
                  {primaryKeys.map(k => row[k]).filter(Boolean).join(' · ') || '—'}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                  {fields.filter(f => !primaryKeys.includes(f.key)).map(f => (
                    <span key={f.key} className="text-[11px] text-muted-foreground">
                      <span className="text-muted-foreground/70">{f.label}:</span> {display(f, row[f.key])}
                    </span>
                  ))}
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(row)} title="Edit" className="p-1.5 rounded-lg text-muted-foreground hover:bg-[#F8FAFC] hover:text-brand-950">
                    <Sym name="edit" size={14} />
                  </button>
                  <button onClick={() => remove.mutate(row.id)} title="Remove" className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600">
                    <Sym name="delete" size={14} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display font-semibold text-brand-950">{editing === 'new' ? `Add ${title}` : `Edit ${title}`}</h2>
              <button onClick={close} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
            </div>
            <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                {fields.map(f => (
                  <div key={f.key} className={f.colSpan === 2 || f.type === 'checkbox' ? 'col-span-2' : ''}>
                    {f.type === 'checkbox' ? (
                      <label className="flex items-center gap-2 text-sm text-brand-950">
                        <input type="checkbox" checked={!!form[f.key]} onChange={e => set(f.key, e.target.checked)} />
                        {f.label}
                      </label>
                    ) : (
                      <>
                        <label className="block text-xs font-medium text-brand-950 mb-1">{f.label}{f.required ? ' *' : ''}</label>
                        {f.type === 'select' ? (
                          <select className={ic} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}>
                            <option value="">Select…</option>
                            {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            className={ic}
                            type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                            value={form[f.key] ?? ''}
                            onChange={e => set(f.key, e.target.value)}
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </form>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button onClick={close} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={submit} disabled={!canSave || create.isPending || update.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {create.isPending || update.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
