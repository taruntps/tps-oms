// HRMS — Org setup (/hrms/setup/org).
// Simple CRUD lists (in sections) for the org masters: departments, designations,
// grades, employment types. Gated by hrms.config.manage.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import {
  useDepartments,
  useDesignations,
  useGrades,
  useEmploymentTypes,
  useUpsertMaster,
  useDeactivateMaster,
} from '../hooks/useMasters'
import type { MasterTable } from '../api/masters'

interface MasterFieldDef {
  key: string
  label: string
  type?: 'text' | 'number' | 'select'
  options?: { value: string; label: string }[]
  required?: boolean
}

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

const SECTIONS = ['departments', 'designations', 'grades', 'employment_types'] as const
type SectionId = (typeof SECTIONS)[number]
const SECTION_LABEL: Record<SectionId, { label: string; icon: string }> = {
  departments: { label: 'Departments', icon: 'apartment' },
  designations: { label: 'Designations', icon: 'work' },
  grades: { label: 'Grades', icon: 'stairs' },
  employment_types: { label: 'Employment Types', icon: 'contract' },
}

export default function OrgSetupPage() {
  const canManage = useCan('hrms.config.manage')
  const [section, setSection] = useState<SectionId>('departments')

  const departments = useDepartments()
  const designations = useDesignations()
  const grades = useGrades()
  const employmentTypes = useEmploymentTypes()

  const gradeOptions = useMemo(
    () => (grades.data ?? []).map(g => ({ value: g.id, label: g.name })),
    [grades.data],
  )

  return (
    <div>
      <TopBar title="Org Setup" subtitle="Departments, designations, grades & employment types" />

      <div className="p-6 animate-fade-up">
        {!canManage && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            You have read-only access to org masters.
          </div>
        )}

        <div className="flex gap-1 overflow-x-auto border-b border-border mb-5">
          {SECTIONS.map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                section === s ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-brand-950'
              }`}
            >
              <Sym name={SECTION_LABEL[s].icon} size={15} /> {SECTION_LABEL[s].label}
            </button>
          ))}
        </div>

        {section === 'departments' && (
          <MasterCrud
            table="hr_departments"
            title="Department"
            rows={departments.data ?? []}
            isLoading={departments.isLoading}
            canManage={canManage}
            fields={[
              { key: 'code', label: 'Code' },
              { key: 'name', label: 'Name', required: true },
            ]}
          />
        )}
        {section === 'designations' && (
          <MasterCrud
            table="hr_designations"
            title="Designation"
            rows={designations.data ?? []}
            isLoading={designations.isLoading}
            canManage={canManage}
            fields={[
              { key: 'code', label: 'Code' },
              { key: 'name', label: 'Name', required: true },
              { key: 'grade_id', label: 'Grade', type: 'select', options: gradeOptions },
            ]}
          />
        )}
        {section === 'grades' && (
          <MasterCrud
            table="hr_grades"
            title="Grade"
            rows={grades.data ?? []}
            isLoading={grades.isLoading}
            canManage={canManage}
            fields={[
              { key: 'code', label: 'Code' },
              { key: 'name', label: 'Name', required: true },
              { key: 'level', label: 'Level', type: 'number' },
            ]}
          />
        )}
        {section === 'employment_types' && (
          <MasterCrud
            table="hr_employment_types"
            title="Employment Type"
            rows={employmentTypes.data ?? []}
            isLoading={employmentTypes.isLoading}
            canManage={canManage}
            fields={[
              { key: 'code', label: 'Code' },
              { key: 'name', label: 'Name', required: true },
            ]}
          />
        )}
      </div>
    </div>
  )
}

interface MasterRow {
  id: string
  is_active: boolean
  [k: string]: any
}

function MasterCrud({
  table, title, rows, isLoading, canManage, fields,
}: {
  table: MasterTable
  title: string
  rows: MasterRow[]
  isLoading: boolean
  canManage: boolean
  fields: MasterFieldDef[]
}) {
  const upsert = useUpsertMaster(table)
  const deactivate = useDeactivateMaster(table)
  const [editing, setEditing] = useState<MasterRow | 'new' | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})

  const optionLabel = (f: MasterFieldDef, v: any) =>
    f.options?.find(o => o.value === v)?.label ?? (v ?? '—')

  const openNew = () => {
    const f: Record<string, any> = { is_active: true }
    for (const fld of fields) f[fld.key] = ''
    setForm(f); setEditing('new')
  }
  const openEdit = (row: MasterRow) => {
    const f: Record<string, any> = { is_active: row.is_active }
    for (const fld of fields) f[fld.key] = row[fld.key] ?? ''
    setForm(f); setEditing(row)
  }
  const close = () => setEditing(null)
  const set = (k: string, v: any) => setForm(fm => ({ ...fm, [k]: v }))

  const canSave = fields.filter(f => f.required).every(f => String(form[f.key] ?? '').trim() !== '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    const payload: Record<string, unknown> = { is_active: form.is_active ?? true }
    for (const f of fields) {
      const raw = form[f.key]
      payload[f.key] = f.type === 'number' ? (raw === '' || raw == null ? null : Number(raw)) : (raw === '' ? null : raw)
    }
    try {
      if (editing === 'new') await upsert.mutateAsync(payload)
      else if (editing) await upsert.mutateAsync({ id: editing.id, ...payload })
      close()
    } catch { /* toast surfaced by hook */ }
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <p className="text-sm font-semibold text-brand-950">{title}s</p>
        {canManage && (
          <button onClick={openNew} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-[#F8FAFC]">
            <Sym name="add" size={14} /> Add {title}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[#F8FAFC] rounded animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No {title.toLowerCase()}s yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              {fields.map(f => <th key={f.key} className="px-5 py-2.5 font-medium">{f.label}</th>)}
              <th className="px-5 py-2.5 font-medium">Active</th>
              {canManage && <th className="px-5 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b border-border last:border-0">
                {fields.map(f => (
                  <td key={f.key} className="px-5 py-2.5 text-brand-950">
                    {f.type === 'select' ? optionLabel(f, row[f.key]) : (row[f.key] ?? '—')}
                  </td>
                ))}
                <td className="px-5 py-2.5">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${row.is_active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                    {row.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                {canManage && (
                  <td className="px-5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(row)} title="Edit" className="p-1.5 rounded-lg text-muted-foreground hover:bg-[#F8FAFC] hover:text-brand-950"><Sym name="edit" size={14} /></button>
                      {row.is_active && (
                        <button onClick={() => deactivate.mutate(row.id)} title="Deactivate" className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"><Sym name="block" size={14} /></button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display font-semibold text-brand-950">{editing === 'new' ? `Add ${title}` : `Edit ${title}`}</h2>
              <button onClick={close} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
            </div>
            <form onSubmit={submit} className="px-6 py-5 space-y-4">
              {fields.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-brand-950 mb-1">{f.label}{f.required ? ' *' : ''}</label>
                  {f.type === 'select' ? (
                    <select className={ic} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}>
                      <option value="">—</option>
                      {(f.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input className={ic} type={f.type === 'number' ? 'number' : 'text'} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
                  )}
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm text-brand-950">
                <input type="checkbox" checked={!!form.is_active} onChange={e => set('is_active', e.target.checked)} /> Active
              </label>
            </form>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button onClick={close} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={submit} disabled={!canSave || upsert.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {upsert.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
