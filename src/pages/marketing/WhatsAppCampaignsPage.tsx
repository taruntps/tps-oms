// WhatsApp Campaigns (/marketing/whatsapp) — send Meta-approved template messages via the
// org's OWN Cloud API (no platform fees). Create a campaign, paste opted-in numbers, start;
// a throttled cron worker (wa-campaign-worker) drains it and skips opted-out numbers.
import { useState, useRef, type ChangeEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'

const db = supabase as any
const ic = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'
const DEFAULT_BANNER = 'https://portal.tpsxpert.com/tps-signature.jpg'

interface Campaign {
  id: string; name: string; template_name: string; header_image_url: string | null
  status: 'draft' | 'sending' | 'paused' | 'sent'; total: number; sent: number; failed: number; created_at: string
}

const STATUS_CLS: Record<string, string> = {
  draft: 'bg-gray-50 border-gray-200 text-gray-600',
  sending: 'bg-blue-50 border-blue-200 text-blue-700',
  paused: 'bg-amber-50 border-amber-200 text-amber-700',
  sent: 'bg-green-50 border-green-200 text-green-700',
}

// Parse a textarea/CSV of "phone" or "phone,name" per line → {phone,name}[] (digits only).
// Accepts comma OR tab separators (so pasting two Excel columns works) and CRLF line ends;
// header rows and blanks are skipped automatically (any line whose first cell has <10 digits).
function parseRecipients(text: string): { phone: string; name: string | null }[] {
  const out: { phone: string; name: string | null }[] = []
  const seen = new Set<string>()
  for (const rawLine of text.split(/\r?\n/)) {
    const [rawPhone, ...rest] = rawLine.split(/[,\t]/)
    const phone = (rawPhone ?? '').replace(/\D/g, '')
    if (phone.length < 10 || seen.has(phone)) continue
    seen.add(phone)
    out.push({ phone, name: rest.join(' ').replace(/\s+/g, ' ').trim() || null })
  }
  return out
}

export default function WhatsAppCampaignsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['wa', 'campaigns'],
    queryFn: async () => {
      const { data, error } = await db.from('wa_campaigns').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Campaign[]
    },
    refetchInterval: 15_000, // live progress while sending
  })

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: string }) => {
      const { error } = await db.from('wa_campaigns').update({ status: v.status }).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wa', 'campaigns'] }) },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })

  return (
    <div>
      <TopBar title="WhatsApp Campaigns" subtitle="Send approved templates via your own Cloud API" />
      <div className="p-6 animate-fade-up space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          Only message contacts who have <b>consented</b>. Meta bills per marketing conversation, and a template must be
          <b> approved in Meta WhatsApp Manager</b> before you enter its name here. Replies of “STOP” are added to the opt-out list.
        </div>

        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">{campaigns.length} campaign{campaigns.length === 1 ? '' : 's'}</p>
          <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg">
            <Sym name="add" size={16} /> New Campaign
          </button>
        </div>

        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-[#F8FAFC] rounded animate-pulse" />)}</div>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No campaigns yet. Click “New Campaign” to create one.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Campaign</th>
                  <th className="px-5 py-2.5 font-medium">Template</th>
                  <th className="px-5 py-2.5 font-medium">Progress</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 font-medium text-brand-950">{c.name}</td>
                    <td className="px-5 py-2.5 text-muted-foreground font-mono text-xs">{c.template_name}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{c.sent}/{c.total} sent{c.failed ? ` · ${c.failed} failed` : ''}</td>
                    <td className="px-5 py-2.5"><span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${STATUS_CLS[c.status]}`}>{c.status}</span></td>
                    <td className="px-5 py-2.5 text-right">
                      {(c.status === 'draft' || c.status === 'paused') && (
                        <button onClick={() => setStatus.mutate({ id: c.id, status: 'sending' })} className="px-2.5 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-[#F8FAFC] text-green-700">
                          {c.status === 'paused' ? 'Resume' : 'Start sending'}
                        </button>
                      )}
                      {c.status === 'sending' && (
                        <button onClick={() => setStatus.mutate({ id: c.id, status: 'paused' })} className="px-2.5 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-amber-50 text-amber-700">Pause</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {open && user?.id && <NewCampaignModal createdBy={user.id} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); qc.invalidateQueries({ queryKey: ['wa', 'campaigns'] }) }} />}
    </div>
  )
}

function NewCampaignModal({ createdBy, onClose, onCreated }: { createdBy: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({ name: '', template_name: '', header_image_url: DEFAULT_BANNER, body_params: '', numbers: '' })
  const [personalize, setPersonalize] = useState(false)
  const [fallback, setFallback] = useState('Sir/Madam')
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const recipients = parseRecipients(form.numbers)
  const withNames = recipients.filter(r => r.name).length
  const canSave = form.name.trim() && form.template_name.trim() && recipients.length > 0

  // Read an uploaded CSV/TXT and append its rows to the numbers box (phone in the first
  // column, optional name in the second). parseRecipients handles the live parsing/dedup.
  const onCsv = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      setForm(f => ({ ...f, numbers: f.numbers.trim() ? `${f.numbers.trim()}\n${text}` : text }))
    }
    reader.readAsText(file)
    e.target.value = '' // allow re-selecting the same file
  }

  const create = useMutation({
    mutationFn: async () => {
      const fb = fallback.trim() || 'Sir/Madam'
      // When personalizing, {{1}} = each recipient's name (fallback for blanks) and the
      // campaign-level default mirrors the fallback. Otherwise use the manual variables.
      const bodyParams = personalize ? [fb] : form.body_params.split(',').map(s => s.trim()).filter(Boolean)
      const { data: camp, error } = await db.from('wa_campaigns').insert({
        name: form.name.trim(),
        template_name: form.template_name.trim(),
        header_image_url: form.header_image_url.trim() || null,
        body_params: bodyParams,
        total: recipients.length,
        created_by: createdBy,
      }).select('id').single()
      if (error) throw error
      // Insert recipients in chunks (queued). Personalized sends carry per-recipient params.
      const rows = recipients.map(r => ({
        campaign_id: camp.id, phone: r.phone, name: r.name,
        ...(personalize ? { params: [r.name || fb] } : {}),
      }))
      for (let i = 0; i < rows.length; i += 500) {
        const { error: rErr } = await db.from('wa_campaign_recipients').insert(rows.slice(i, i + 500))
        if (rErr) throw rErr
      }
    },
    onSuccess: () => { toast.success('Campaign created', 'Click “Start sending” when ready.'); onCreated() },
    onError: (e: Error) => toast.error('Create failed', e.message),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">New WhatsApp Campaign</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Campaign name *</label>
            <input className={ic} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. IPHEX 2026 Intro" />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Approved template name *</label>
            <input className={ic} value={form.template_name} onChange={e => set('template_name', e.target.value)} placeholder="e.g. tps_marketing_intro" />
            <p className="text-[11px] text-muted-foreground mt-1">Must be an <b>approved</b> template in Meta WhatsApp Manager (language: English).</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Header image URL <span className="font-normal text-muted-foreground">(if the template has an image header)</span></label>
            <input className={ic} value={form.header_image_url} onChange={e => set('header_image_url', e.target.value)} />
          </div>

          <div className="rounded-lg border border-border bg-[#F8FAFC] px-3 py-3 space-y-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={personalize} onChange={e => setPersonalize(e.target.checked)} className="mt-0.5" />
              <span className="text-xs text-brand-950">
                <b>Personalize with recipient name</b>
                <span className="block text-muted-foreground font-normal mt-0.5">
                  Sends each contact’s name as the template’s first variable <code>{'{{1}}'}</code>. Use an approved template whose body starts with a name variable (e.g. <code>tps_marketing_intro_named</code>).
                </span>
              </span>
            </label>
            {personalize && (
              <div>
                <label className="block text-xs font-medium text-brand-950 mb-1">Fallback name <span className="font-normal text-muted-foreground">(used when a row has no name)</span></label>
                <input className={ic} value={fallback} onChange={e => setFallback(e.target.value)} placeholder="Sir/Madam" />
              </div>
            )}
          </div>

          {!personalize && (
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Body variables <span className="font-normal text-muted-foreground">(comma-separated, in order — leave blank if none)</span></label>
              <input className={ic} value={form.body_params} onChange={e => set('body_params', e.target.value)} placeholder="e.g. Sir/Madam" />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-brand-950">Phone numbers *</label>
              <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700">
                <Sym name="upload_file" size={14} /> Upload CSV
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onCsv} className="hidden" />
            </div>
            <textarea className={ic} rows={6} value={form.numbers} onChange={e => set('numbers', e.target.value)}
              placeholder={'One per line, with country code. Add a name after a comma (or paste two Excel columns):\n919876543210\n919812345678, Acme Foods'} />
            <p className="text-[11px] text-muted-foreground mt-1">
              {recipients.length} valid number{recipients.length === 1 ? '' : 's'} detected
              {personalize && recipients.length > 0 ? ` · ${withNames} with a name, ${recipients.length - withNames} will use “${fallback.trim() || 'Sir/Madam'}”` : ''} · only send to opted-in contacts.
            </p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={() => create.mutate()} disabled={!canSave || create.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {create.isPending ? 'Creating…' : 'Create campaign'}
          </button>
        </div>
      </div>
    </div>
  )
}
