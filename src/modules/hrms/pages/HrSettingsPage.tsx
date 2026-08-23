// HRMS — HR Settings / policies (/hrms/setup/policies).
// Lists hr_policy_settings (the single source of truth for all configurable HR
// policy — office timing, working days, weekly off, probation, etc.) with add/edit.
// Value is edited as a JSON textarea. Gated by hrms.config.manage.
import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { usePolicySettings, useUpsertPolicySetting } from '../hooks/useMasters'
import type { PolicySetting } from '../api/masters'

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

const SCOPE_TYPES = ['company', 'department', 'grade', 'employee']

export default function HrSettingsPage() {
  const canManage = useCan('hrms.config.manage')
  const { data: policies = [], isLoading } = usePolicySettings()
  const upsert = useUpsertPolicySetting()

  const [editing, setEditing] = useState<PolicySetting | 'new' | null>(null)
  const [form, setForm] = useState({ scope_type: 'company', scope_id: '', key: '', value: '{}', effective_from: '', note: '' })
  const [jsonError, setJsonError] = useState<string | null>(null)

  const openNew = () => {
    setForm({ scope_type: 'company', scope_id: '', key: '', value: '{}', effective_from: '', note: '' })
    setJsonError(null); setEditing('new')
  }
  const openEdit = (p: PolicySetting) => {
    setForm({
      scope_type: p.scope_type ?? 'company',
      scope_id: p.scope_id ?? '',
      key: p.key ?? '',
      value: JSON.stringify(p.value ?? {}, null, 2),
      effective_from: p.effective_from ?? '',
      note: p.note ?? '',
    })
    setJsonError(null); setEditing(p)
  }
  const close = () => setEditing(null)
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.key.trim() === '') return
    let parsed: unknown
    try {
      parsed = JSON.parse(form.value)
    } catch (err: any) {
      setJsonError(`Invalid JSON: ${err.message}`)
      return
    }
    const payload = {
      scope_type: form.scope_type,
      scope_id: form.scope_id.trim() || null,
      key: form.key.trim(),
      value: parsed,
      effective_from: form.effective_from || null,
      note: form.note.trim() || null,
    }
    try {
      if (editing === 'new') await upsert.mutateAsync(payload)
      else if (editing) await upsert.mutateAsync({ id: editing.id, ...payload })
      close()
    } catch { /* toast surfaced by hook */ }
  }

  return (
    <div>
      <TopBar title="HR Settings" subtitle="Configurable HR policies — the single source of truth" />

      <div className="p-6 animate-fade-up">
        <div className="mb-5 rounded-lg border border-brand-600/20 bg-brand-600/5 px-4 py-3 text-sm text-brand-800 flex items-start gap-2">
          <Sym name="info" size={16} className="mt-0.5 shrink-0 text-brand-600" />
          <p>
            Every HR policy — office timing, working days, weekly off, probation period, leave rules and more — is configured here.
            No values are hardcoded in the app; the resolver reads these settings (via <code className="text-[12px]">get_hr_policy</code>) at runtime.
            Company-wide defaults use scope <strong>company</strong>; narrower scopes (department / grade / employee) override them.
          </p>
        </div>

        <div className="flex justify-end mb-4">
          {canManage && (
            <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
              <Sym name="add" size={16} /> Add Policy
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : policies.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="tune" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No policy settings configured yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">Scope</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Effective</th>
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {policies.map(p => (
                  <tr key={p.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3 font-medium text-brand-950 font-mono text-xs">{p.key}</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded border bg-[#F8FAFC] border-border text-muted-foreground capitalize">
                        {p.scope_type}{p.scope_id ? ` · ${p.scope_id.slice(0, 8)}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-[11px] text-brand-800 whitespace-pre-wrap break-all block max-w-md">{JSON.stringify(p.value)}</code>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{p.effective_from ? formatDate(p.effective_from) : '—'}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(p)} title="Edit" className="p-1.5 rounded-lg text-muted-foreground hover:bg-[#F8FAFC] hover:text-brand-950"><Sym name="edit" size={14} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display font-semibold text-brand-950">{editing === 'new' ? 'Add Policy' : 'Edit Policy'}</h2>
              <button onClick={close} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
            </div>
            <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-brand-950 mb-1">Scope Type</label>
                  <select className={ic} value={form.scope_type} onChange={e => set('scope_type', e.target.value)}>
                    {SCOPE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-950 mb-1">Scope ID (optional)</label>
                  <input className={ic} value={form.scope_id} onChange={e => set('scope_id', e.target.value)} placeholder="dept/grade/employee id" disabled={form.scope_type === 'company'} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-950 mb-1">Policy Key *</label>
                <input className={ic} value={form.key} onChange={e => set('key', e.target.value)} placeholder="e.g. office_timing, working_days, weekly_off, probation_months" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-950 mb-1">Value (JSON) *</label>
                <textarea className={`${ic} font-mono text-xs`} rows={6} value={form.value} onChange={e => { set('value', e.target.value); setJsonError(null) }} />
                {jsonError && <p className="text-[11px] text-red-600 mt-1">{jsonError}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-brand-950 mb-1">Effective From</label>
                  <input type="date" className={ic} value={form.effective_from} onChange={e => set('effective_from', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-950 mb-1">Note</label>
                  <input className={ic} value={form.note} onChange={e => set('note', e.target.value)} />
                </div>
              </div>
            </form>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button onClick={close} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={submit} disabled={form.key.trim() === '' || upsert.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {upsert.isPending ? 'Saving…' : 'Save Policy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
