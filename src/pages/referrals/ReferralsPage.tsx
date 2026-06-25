import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { formatRupees } from '@/lib/utils'
import { useReferralBreakdown, useUpsertReferral, type ReferralBreakdown } from '@/hooks/useReferrals'

export default function ReferralsPage() {
  const { data: referrals = [], isLoading } = useReferralBreakdown()
  const upsert = useUpsertReferral()
  const [editing, setEditing] = useState<Partial<ReferralBreakdown> | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const save = async () => {
    if (!editing?.name?.trim()) { toast.error('Referral name is required'); return }
    try {
      await upsert.mutateAsync({
        id: editing.id, name: editing.name.trim(),
        contact_person: editing.contact_person || null, phone: editing.phone || null,
        email: editing.email || null, notes: editing.notes || null,
      } as any)
      toast.success(editing.id ? 'Referral updated' : 'Referral added')
      setEditing(null)
    } catch (e: any) { toast.error('Failed', e.message) }
  }

  return (
    <div>
      <TopBar title="Referrals" subtitle={`${referrals.length} referral sources`} />
      <div className="p-6 animate-fade-up space-y-5">
        <div className="flex justify-end">
          <button onClick={() => setEditing({ name: '' })}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
            <Sym name="add" size={16} /> Add Referral
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-16 glass-panel rounded-xl" />)}</div>
        ) : referrals.length === 0 ? (
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="handshake" size={32} className="mx-auto text-white/40 mb-3" />
            <p className="text-sm text-white/60">No referrals yet. Add your first referral source.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {referrals.map(r => (
              <div key={r.id} className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="flex items-center gap-4 p-5">
                  <div className="w-10 h-10 rounded-xl bg-brand-600/10 flex items-center justify-center shrink-0">
                    <Sym name="handshake" size={18} className="text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-brand-950">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.contact_person ? `${r.contact_person} · ` : ''}{r.phone ?? ''} {r.email ? `· ${r.email}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-display font-bold text-brand-950">{formatRupees(r.total_received)}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{r.clients.length} client{r.clients.length !== 1 ? 's' : ''} · received</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditing(r)} className="p-1.5 text-muted-foreground hover:text-brand-600" title="Edit">
                      <Sym name="edit" size={14} />
                    </button>
                    {r.clients.length > 0 && (
                      <button onClick={() => setOpen(open === r.id ? null : r.id)} className="p-1.5 text-muted-foreground hover:text-brand-600" title="Clients">
                        <Sym name={open === r.id ? 'expand_less' : 'expand_more'} size={16} />
                      </button>
                    )}
                  </div>
                </div>
                {open === r.id && r.clients.length > 0 && (
                  <div className="border-t border-border bg-[#F8FAFC] px-5 py-3">
                    <table className="w-full text-sm">
                      <thead><tr className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        <th className="text-left py-1">Client</th><th className="text-right py-1">Received</th></tr></thead>
                      <tbody>
                        {r.clients.map(c => (
                          <tr key={c.id} className="border-t border-border/60">
                            <td className="py-1.5 text-brand-950">{c.company_name}</td>
                            <td className="py-1.5 text-right font-mono">{formatRupees(c.received)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit referral modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-3">
            <h2 className="font-display font-semibold text-brand-950">{editing.id ? 'Edit Referral' : 'Add Referral'}</h2>
            <Field label="Referral Name *"><input className={ic} value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Consultant / firm name" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact Person"><input className={ic} value={editing.contact_person ?? ''} onChange={e => setEditing({ ...editing, contact_person: e.target.value })} /></Field>
              <Field label="Phone"><input className={ic} value={editing.phone ?? ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} /></Field>
            </div>
            <Field label="Email"><input className={ic} value={editing.email ?? ''} onChange={e => setEditing({ ...editing, email: e.target.value })} /></Field>
            <Field label="Notes"><textarea rows={2} className={ic} value={editing.notes ?? ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></Field>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={save} disabled={upsert.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">{upsert.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>{children}</div>
}
const ic = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20'
