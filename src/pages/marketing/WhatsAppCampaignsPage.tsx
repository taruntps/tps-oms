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
const DEFAULT_BROCHURE = 'https://portal.tpsxpert.com/tps-brochure.pdf'
const DEFAULT_BROCHURE_NAME = 'TPS Xperts Group Profile.pdf'

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

// Approved templates + their exact structure, fetched live from Meta (wa-templates fn).
interface WaTemplate {
  name: string; language: string; status: string; category: string
  headerType: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | null
  bodyText: string; varCount: number; hasButtons: boolean
}
function useWaTemplates() {
  return useQuery({
    queryKey: ['wa', 'templates'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('wa-templates')
      if (error) throw error
      const list = ((data as any)?.templates ?? []) as WaTemplate[]
      return list.filter(t => t.status === 'APPROVED')
    },
  })
}
const headerKind = (t?: WaTemplate | null) =>
  t?.headerType === 'DOCUMENT' ? 'document' : t?.headerType === 'IMAGE' ? 'image' : 'none'

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
            <div className="overflow-x-auto"><table className="w-full text-sm">
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
            </table></div>
          )}
        </div>
      </div>

      {open && user?.id && <NewCampaignModal createdBy={user.id} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); qc.invalidateQueries({ queryKey: ['wa', 'campaigns'] }) }} />}
    </div>
  )
}

function NewCampaignModal({ createdBy, onClose, onCreated }: { createdBy: string; onClose: () => void; onCreated: () => void }) {
  const { data: templates = [], isLoading: tplLoading, error: tplError } = useWaTemplates()
  const [form, setForm] = useState<Record<string, string>>({
    name: '', template_name: '', language_code: 'en', header_type: 'none',
    header_image_url: DEFAULT_BANNER, header_doc_url: DEFAULT_BROCHURE, header_doc_filename: DEFAULT_BROCHURE_NAME,
    body_params: '', extra_vars: '', numbers: '',
  })
  const [personalize, setPersonalize] = useState(false)
  const [fallback, setFallback] = useState('Sir/Madam')
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const tpl = templates.find(t => t.name === form.template_name) ?? null
  const varCount = tpl?.varCount ?? 0
  // Picking a template auto-configures the header, language, and default personalization.
  const pickTemplate = (name: string) => {
    const t = templates.find(x => x.name === name)
    setForm(f => ({ ...f, template_name: name, language_code: t?.language ?? 'en', header_type: headerKind(t) }))
    setPersonalize((t?.varCount ?? 0) >= 1) // {{1}} is the recipient name for our marketing templates
  }

  const extraVars = form.extra_vars.split('|').map(s => s.trim()).filter(Boolean)
  const manualParams = form.body_params.split(',').map(s => s.trim()).filter(Boolean)
  const providedCount = personalize ? 1 + extraVars.length : manualParams.length
  const paramsOk = providedCount === varCount
  const recipients = parseRecipients(form.numbers)
  const withNames = recipients.filter(r => r.name).length
  const headerOk = form.header_type === 'none'
    || (form.header_type === 'document' && form.header_doc_url.trim().length > 0)
    || (form.header_type === 'image' && form.header_image_url.trim().length > 0)
  const canSave = form.name.trim() && tpl && recipients.length > 0 && headerOk && paramsOk

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
      const ht = form.header_type
      // Campaign-level variables after the name — {{2}}, {{3}}, … (e.g. the expo name).
      // Split on "|" so an event that itself contains a comma stays one variable.
      const extraVars = form.extra_vars.split('|').map(s => s.trim()).filter(Boolean)
      // When personalizing, {{1}} = each recipient's name (fallback for blanks), then the
      // extra variables. Otherwise all variables come from the manual field, in order.
      const bodyParams = personalize ? [fb, ...extraVars] : form.body_params.split(',').map(s => s.trim()).filter(Boolean)
      const { data: camp, error } = await db.from('wa_campaigns').insert({
        name: form.name.trim(),
        template_name: form.template_name.trim(),
        language_code: form.language_code || 'en',
        header_type: ht,
        header_image_url: ht === 'image' ? (form.header_image_url.trim() || null) : null,
        header_doc_url: ht === 'document' ? (form.header_doc_url.trim() || null) : null,
        header_doc_filename: ht === 'document' ? (form.header_doc_filename.trim() || DEFAULT_BROCHURE_NAME) : null,
        body_params: bodyParams,
        total: recipients.length,
        created_by: createdBy,
      }).select('id').single()
      if (error) throw error
      // Insert recipients in chunks (queued). Personalized sends carry per-recipient params.
      const rows = recipients.map(r => ({
        campaign_id: camp.id, phone: r.phone, name: r.name,
        ...(personalize ? { params: [r.name || fb, ...extraVars] } : {}),
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
            <label className="block text-xs font-medium text-brand-950 mb-1">Template *</label>
            {tplError ? (
              <p className="text-[11px] text-red-600">Couldn’t load templates from Meta. Check the WhatsApp settings and try again.</p>
            ) : (
              <select className={ic} value={form.template_name} onChange={e => pickTemplate(e.target.value)} disabled={tplLoading}>
                <option value="">{tplLoading ? 'Loading approved templates…' : 'Select an approved template…'}</option>
                {templates.map(t => (
                  <option key={t.name} value={t.name}>
                    {t.name} · {t.category === 'MARKETING' ? 'Marketing' : 'Utility'} · {t.varCount} var{t.varCount === 1 ? '' : 's'}{t.headerType === 'DOCUMENT' ? ' · PDF' : t.headerType === 'IMAGE' ? ' · Image' : ''}
                  </option>
                ))}
              </select>
            )}
            {tpl && (
              <div className="mt-2 rounded-lg border border-border bg-[#F8FAFC] px-3 py-2">
                <p className="text-[11px] text-muted-foreground whitespace-pre-line line-clamp-4">{tpl.bodyText}</p>
                <p className="text-[11px] text-brand-700 mt-1.5">
                  Needs {varCount} variable{varCount === 1 ? '' : 's'}{tpl.headerType === 'DOCUMENT' ? ' + a PDF' : tpl.headerType === 'IMAGE' ? ' + an image' : ''} · language {tpl.language}
                </p>
              </div>
            )}
          </div>

          {tpl && form.header_type === 'document' && (
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">PDF document <span className="font-normal text-muted-foreground">(this template has a document header)</span></label>
              <div className="space-y-2">
                <input className={ic} value={form.header_doc_url} onChange={e => set('header_doc_url', e.target.value)} placeholder="https://portal.tpsxpert.com/tps-brochure.pdf" />
                <input className={ic} value={form.header_doc_filename} onChange={e => set('header_doc_filename', e.target.value)} placeholder="File name shown in WhatsApp, e.g. TPS Xperts Group Profile.pdf" />
                <p className="text-[11px] text-muted-foreground">Direct link to a public PDF (the default brochure is prefilled). Paste a different URL to change it.</p>
              </div>
            </div>
          )}
          {tpl && form.header_type === 'image' && (
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Image <span className="font-normal text-muted-foreground">(this template has an image header)</span></label>
              <input className={ic} value={form.header_image_url} onChange={e => set('header_image_url', e.target.value)} placeholder="https://portal.tpsxpert.com/tps-signature.jpg" />
            </div>
          )}

          {tpl && varCount === 0 && (
            <p className="text-[11px] text-muted-foreground">This template has no variables — it sends exactly as shown above.</p>
          )}

          {tpl && varCount >= 1 && (
            <div className="rounded-lg border border-border bg-[#F8FAFC] px-3 py-3 space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={personalize} onChange={e => setPersonalize(e.target.checked)} className="mt-0.5" />
                <span className="text-xs text-brand-950">
                  <b>Personalize <code>{'{{1}}'}</code> with the recipient’s name</b>
                  <span className="block text-muted-foreground font-normal mt-0.5">Each contact’s name (from your list) fills the first variable.</span>
                </span>
              </label>
              {personalize && (
                <div>
                  <label className="block text-xs font-medium text-brand-950 mb-1">Fallback name <span className="font-normal text-muted-foreground">(when a row has no name)</span></label>
                  <input className={ic} value={fallback} onChange={e => setFallback(e.target.value)} placeholder="Sir/Madam" />
                </div>
              )}
              {personalize && varCount > 1 && (
                <div>
                  <label className="block text-xs font-medium text-brand-950 mb-1">
                    Variables {'{{2}}'}–{`{{${varCount}}}`} <span className="font-normal text-muted-foreground">(same for everyone; separate with <code>|</code>)</span>
                  </label>
                  <input className={ic} value={form.extra_vars} onChange={e => set('extra_vars', e.target.value)} placeholder={varCount === 2 ? 'e.g. IPHEX Milan 2026' : 'e.g. IPHEX | Milan 2026'} />
                </div>
              )}
              {!personalize && (
                <div>
                  <label className="block text-xs font-medium text-brand-950 mb-1">
                    All {varCount} variable{varCount === 1 ? '' : 's'} <span className="font-normal text-muted-foreground">(in order, comma-separated)</span>
                  </label>
                  <input className={ic} value={form.body_params} onChange={e => set('body_params', e.target.value)} placeholder="e.g. Sir/Madam, IPHEX Milan 2026" />
                </div>
              )}
              <p className={`text-[11px] ${paramsOk ? 'text-green-700' : 'text-amber-700'}`}>
                {paramsOk ? '✓ ' : ''}Providing {providedCount} of {varCount} variable{varCount === 1 ? '' : 's'}{paramsOk ? '' : ' — must match exactly before sending.'}
              </p>
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
