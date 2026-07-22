// HRMS — Training (M7): Certifications register with expiry tracking (/hrms/training/certifications).
// View gated hrms.training.view; add/edit gated hrms.training.manage.
import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import { useEmployees } from '../hooks/useEmployees'
import { useCertifications, useExpiringCertifications, useCreateCertification, useUpdateCertification, useDeleteCertification } from '../hooks/useTraining'
import type { CertificationInput } from '../api/training'
import { ExpiryPill, expiryRowCls, inputCls } from './trainingShared'

export default function CertificationsPage() {
  const canManage = useCan('hrms.training.manage')
  const { data: certs = [], isLoading } = useCertifications()
  const { data: expiring = [] } = useExpiringCertifications(60)
  const { data: employees = [] } = useEmployees()
  const create = useCreateCertification()
  const update = useUpdateCertification()
  const del = useDeleteCertification()

  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<CertificationInput>({ employee_id: '', name: '', authority: '', issued_on: null, expires_on: null, document_id: null })
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? id.slice(0, 8)

  const startCreate = () => { setEditId(null); setForm({ employee_id: employees[0]?.id ?? '', name: '', authority: '', issued_on: null, expires_on: null, document_id: null }); setOpen(true) }
  const startEdit = (c: any) => { setEditId(c.id); setForm({ employee_id: c.employee_id, name: c.name, authority: c.authority ?? '', issued_on: c.issued_on, expires_on: c.expires_on, document_id: c.document_id }); setOpen(true) }
  const submit = async () => {
    if (editId) await update.mutateAsync({ id: editId, input: form }); else await create.mutateAsync(form)
    setOpen(false)
  }

  return (
    <div>
      <TopBar title="Certifications" subtitle={`${expiring.length} expiring in 60 days`}>
        {canManage && <button onClick={startCreate} className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"><Sym name="add" size={15} /> Add Certification</button>}
      </TopBar>
      <div className="p-6">
        <div className="border border-border rounded-xl bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2 text-left font-semibold">Employee</th><th className="px-4 py-2 text-left font-semibold">Certification</th><th className="px-4 py-2 text-left font-semibold">Authority</th><th className="px-4 py-2 text-left font-semibold">Issued</th><th className="px-4 py-2 text-left font-semibold">Expires</th>{canManage && <th className="px-2 py-2" />}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && certs.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No certifications.</td></tr>}
              {(certs as any[]).map((c) => (
                <tr key={c.id} className={expiryRowCls(c.expires_on)}>
                  <td className="px-4 py-2.5 font-medium text-brand-950">{nameOf(c.employee_id)}</td>
                  <td className="px-4 py-2.5">{c.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.authority}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.issued_on ?? '—'}</td>
                  <td className="px-4 py-2.5"><ExpiryPill expiresOn={c.expires_on} /></td>
                  {canManage && <td className="px-2 py-2.5 text-right whitespace-nowrap"><button onClick={() => startEdit(c)} className="text-muted-foreground hover:text-brand-700 mr-2"><Sym name="edit" size={15} /></button><button onClick={() => del.mutate(c.id)} className="text-muted-foreground hover:text-red-600"><Sym name="delete" size={15} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-3">
            <h2 className="font-display font-semibold text-brand-950">{editId ? 'Edit' : 'Add'} Certification</h2>
            <select className={inputCls} value={form.employee_id} onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
            <input className={inputCls} placeholder="Certification name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <input className={inputCls} placeholder="Authority" value={form.authority ?? ''} onChange={(e) => setForm((f) => ({ ...f, authority: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[11px] text-muted-foreground">Issued</label><input type="date" className={inputCls} value={form.issued_on ?? ''} onChange={(e) => setForm((f) => ({ ...f, issued_on: e.target.value || null }))} /></div>
              <div><label className="text-[11px] text-muted-foreground">Expires</label><input type="date" className={inputCls} value={form.expires_on ?? ''} onChange={(e) => setForm((f) => ({ ...f, expires_on: e.target.value || null }))} /></div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={submit} disabled={!form.employee_id || form.name.trim().length < 2} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
