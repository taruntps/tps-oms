// CRM — create / edit lead modal.
import { useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { useCreateLead, useUpdateLead, useStages, useCrmProfiles } from '../hooks/useLeads'
import { useCrmReferrals } from '../hooks/useReferrals'
import type { Lead, LeadInput } from '../api/leads'

interface Props {
  lead?: Lead
  onClose: () => void
}

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

export function LeadForm({ lead, onClose }: Props) {
  const isEdit = !!lead
  const create = useCreateLead()
  const update = useUpdateLead()
  const { data: stages = [] } = useStages()
  const { data: profiles = [] } = useCrmProfiles()
  const { data: referrals = [] } = useCrmReferrals()

  // estimated_value is stored as bigint paise; the form edits whole rupees.
  const [form, setForm] = useState({
    company_name: lead?.company_name ?? '',
    contact_person: lead?.contact_person ?? '',
    phone: lead?.phone ?? '',
    email: lead?.email ?? '',
    source: lead?.source ?? '',
    stage_key: lead?.stage_key ?? 'new',
    owner_id: lead?.owner_id ?? '',
    estimated_value_rupees: lead?.estimated_value != null ? String(lead.estimated_value / 100) : '',
    service_interest: lead?.service_interest ?? '',
    referral_id: lead?.referral_id ?? '',
    notes: lead?.notes ?? '',
  })

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submitting = create.isPending || update.isPending

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.company_name.trim().length < 2) return

    const rupees = form.estimated_value_rupees.trim()
    const estimated_value = rupees === '' ? null : Math.round(Number(rupees) * 100)

    const payload: LeadInput = {
      company_name: form.company_name.trim(),
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      source: form.source.trim() || null,
      stage_key: form.stage_key,
      owner_id: form.owner_id || null,
      estimated_value: Number.isFinite(estimated_value as number) ? estimated_value : null,
      service_interest: form.service_interest.trim() || null,
      referral_id: form.referral_id || null,
      notes: form.notes.trim() || null,
    }

    try {
      if (isEdit) await update.mutateAsync({ id: lead!.id, ...payload })
      else await create.mutateAsync(payload)
      onClose()
    } catch {
      // toast surfaced by the mutation hook
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{isEdit ? 'Edit Lead' : 'New Lead'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <Sym name="close" size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="overflow-y-auto flex-1 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company Name *" className="col-span-2">
              <input className={ic} value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Company / organisation" autoFocus />
            </Field>

            <Field label="Contact Person">
              <input className={ic} value={form.contact_person} onChange={e => set('contact_person', e.target.value)} placeholder="Full name" />
            </Field>
            <Field label="Phone">
              <input className={ic} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Phone" />
            </Field>

            <Field label="Email" className="col-span-2">
              <input className={ic} value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@company.com" />
            </Field>

            <Field label="Stage">
              <select className={ic} value={form.stage_key} onChange={e => set('stage_key', e.target.value)}>
                {stages.map(s => <option key={s.stage_key} value={s.stage_key}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Owner">
              <select className={ic} value={form.owner_id} onChange={e => set('owner_id', e.target.value)}>
                <option value="">Unassigned</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.name ?? p.id}</option>)}
              </select>
            </Field>

            <Field label="Estimated Value (₹)">
              <input className={ic} type="number" min={0} step="1" value={form.estimated_value_rupees} onChange={e => set('estimated_value_rupees', e.target.value)} placeholder="e.g. 50000" />
            </Field>
            <Field label="Source">
              <input className={ic} value={form.source} onChange={e => set('source', e.target.value)} placeholder="e.g. Website, Referral" />
            </Field>

            <Field label="Service Interest" className="col-span-2">
              <input className={ic} value={form.service_interest} onChange={e => set('service_interest', e.target.value)} placeholder="e.g. FSSAI License, ISO 22000" />
            </Field>

            <Field label="Referral / Source Partner" className="col-span-2">
              <select className={ic} value={form.referral_id} onChange={e => set('referral_id', e.target.value)}>
                <option value="">None</option>
                {referrals.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>

            <Field label="Notes" className="col-span-2">
              <textarea className={ic} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything worth remembering…" />
            </Field>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={onSubmit} disabled={submitting || form.company_name.trim().length < 2} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {submitting ? 'Saving…' : isEdit ? 'Update Lead' : 'Create Lead'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>
      {children}
    </div>
  )
}
