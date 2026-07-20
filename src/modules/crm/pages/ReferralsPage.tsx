// CRM — Referrals (/crm/referrals).
// List + manage referral partners (name, contact, phone, email, code, commission).
// Managing is gated by crm.referral.manage.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import { useCrmReferrals, useUpsertReferral } from '../hooks/useReferrals'
import type { Referral } from '../api/referrals'

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

export default function ReferralsPage() {
  const canManage = useCan('crm.referral.manage')
  const { data: referrals = [], isLoading } = useCrmReferrals()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Referral | null | undefined>(undefined) // undefined = closed, null = new

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return referrals
    return referrals.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.contact_person ?? '').toLowerCase().includes(q) ||
      (r.phone ?? '').includes(q) ||
      (r.referral_code ?? '').toLowerCase().includes(q)
    )
  }, [referrals, search])

  return (
    <div>
      <TopBar title="Referrals" subtitle={`${referrals.length} referral partner${referrals.length === 1 ? '' : 's'}`} />

      <div className="p-6 animate-fade-up">
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Sym name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search referrals, code, phone…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>
          {canManage && (
            <button
              onClick={() => setEditing(null)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors ml-auto"
            >
              <Sym name="add" size={16} />
              Add Referral
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="bg-white rounded-xl border border-border h-64 animate-pulse" />
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="handshake" size={32} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{search ? 'No referrals match your search.' : 'No referral partners yet.'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium text-right">Commission</th>
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 font-medium text-brand-950">{r.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.contact_person || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.phone || '—'}</td>
                    <td className="px-4 py-3">
                      {r.referral_code
                        ? <span className="text-[11px] font-mono bg-brand-600/10 text-brand-700 px-1.5 py-0.5 rounded">{r.referral_code}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-brand-950">{r.commission_percent != null ? `${r.commission_percent}%` : '—'}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setEditing(r)} className="text-muted-foreground hover:text-brand-600"><Sym name="edit" size={15} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing !== undefined && <ReferralForm referral={editing} onClose={() => setEditing(undefined)} />}
    </div>
  )
}

function ReferralForm({ referral, onClose }: { referral: Referral | null; onClose: () => void }) {
  const isEdit = !!referral
  const upsert = useUpsertReferral()
  const [form, setForm] = useState({
    name: referral?.name ?? '',
    contact_person: referral?.contact_person ?? '',
    phone: referral?.phone ?? '',
    email: referral?.email ?? '',
    referral_code: referral?.referral_code ?? '',
    commission_percent: referral?.commission_percent != null ? String(referral.commission_percent) : '',
  })
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 2) return
    const commission = form.commission_percent.trim()
    try {
      await upsert.mutateAsync({
        id: referral?.id,
        name: form.name.trim(),
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        referral_code: form.referral_code.trim() || null,
        commission_percent: commission === '' ? null : Number(commission),
      })
      onClose()
    } catch {
      // toast surfaced by the hook
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{isEdit ? 'Edit Referral' : 'Add Referral'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <form onSubmit={onSubmit} className="px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name *" className="col-span-2">
              <input className={ic} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Referral partner name" autoFocus />
            </Field>
            <Field label="Contact Person">
              <input className={ic} value={form.contact_person} onChange={e => set('contact_person', e.target.value)} placeholder="Full name" />
            </Field>
            <Field label="Phone">
              <input className={ic} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Phone" />
            </Field>
            <Field label="Email" className="col-span-2">
              <input className={ic} value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@partner.com" />
            </Field>
            <Field label="Referral Code">
              <input className={ic} value={form.referral_code} onChange={e => set('referral_code', e.target.value)} placeholder="e.g. TPS-REF01" />
            </Field>
            <Field label="Commission (%)">
              <input className={ic} type="number" min={0} max={100} step="0.5" value={form.commission_percent} onChange={e => set('commission_percent', e.target.value)} placeholder="e.g. 10" />
            </Field>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
            <button type="submit" disabled={upsert.isPending || form.name.trim().length < 2} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {upsert.isPending ? 'Saving…' : isEdit ? 'Update' : 'Add Referral'}
            </button>
          </div>
        </form>
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
