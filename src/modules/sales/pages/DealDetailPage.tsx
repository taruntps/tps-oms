// Sales — Deal detail (/sales/deals/:id).
// Shows the deal, its quotations (with an inline builder that draws line items from
// the service catalogue and computes subtotal/tax/discount/grand total client-side
// in paise), stage history, and a Mark Won action that records a confirmed order +
// a pending Finance handoff (the invoice/project creation is owned downstream).
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { cn, formatRupees, formatDate, formatDateTime } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import {
  useDeal, useDealStages, useProfileLookup, useClientLookup, useStageHistory, useMoveDealStage,
} from '../hooks/useDeals'
import {
  useQuotations, useCreateQuotation, useUpdateQuotationStatus, useMarkWon,
} from '../hooks/useQuotations'
import { useServices } from '../hooks/useServices'
import { computeLine, computeTotals, type LineDraft, type Quotation, type QuotationStatus } from '../api/quotations'
import type { SalesService } from '../api/services'

const QUOTE_STATUS_CLASSES: Record<QuotationStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
}

export default function DealDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const canClose = useCan('sales.deal.close')
  const canManageQuote = useCan('sales.quotation.manage')

  const dealQ = useDeal(id)
  const stagesQ = useDealStages()
  const profilesQ = useProfileLookup()
  const clientsQ = useClientLookup()
  const quotationsQ = useQuotations(id)
  const historyQ = useStageHistory(id)

  const moveStage = useMoveDealStage()
  const markWon = useMarkWon()
  const [showQuoteForm, setShowQuoteForm] = useState(false)

  const deal = dealQ.data
  const stages = stagesQ.data ?? []
  const wonStage = stages.find(s => s.is_won)

  const nameById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of profilesQ.data ?? []) m[p.id] = p.name
    return m
  }, [profilesQ.data])
  const clientById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of clientsQ.data ?? []) m[c.id] = c.company_name
    return m
  }, [clientsQ.data])

  const quotations = quotationsQ.data ?? []
  const latestQuote = quotations[0] // ordered by version desc

  const handleMarkWon = async () => {
    if (!deal) return
    if (!window.confirm('Mark this deal as won? This creates a confirmed order and hands it off to Finance for invoicing.')) return
    const total = latestQuote?.grand_total ?? deal.amount
    await markWon.mutateAsync({
      deal_id: deal.id,
      client_id: deal.client_id,
      quotation_id: latestQuote?.id ?? null,
      total,
    })
    // Advance the deal to the Won stage (records stage history).
    if (wonStage && deal.stage_key !== wonStage.stage_key) {
      await moveStage.mutateAsync({ deal, toStage: wonStage })
    }
  }

  if (dealQ.isLoading) {
    return (
      <div>
        <TopBar title="Deal" subtitle="Loading…" />
        <div className="p-6 space-y-3 animate-fade-up">
          {[1, 2, 3].map(i => <div key={i} className="h-24 glass-panel rounded-xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (dealQ.error || !deal) {
    return (
      <div>
        <TopBar title="Deal" subtitle="Not found" />
        <div className="p-6 animate-fade-up">
          <div className="glass-panel rounded-xl p-4 text-sm text-white">
            <div className="flex items-start gap-2">
              <Sym name="error" size={16} className="mt-0.5 shrink-0 text-red-300" />
              <div>
                <p className="font-medium mb-1">Couldn't load this deal</p>
                <p className="text-xs text-white/70">{(dealQ.error as Error)?.message ?? 'The deal does not exist.'}</p>
                <button onClick={() => navigate('/sales/deals')} className="mt-2 text-xs underline">Back to pipeline</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const stageLabel = stages.find(s => s.stage_key === deal.stage_key)?.label ?? deal.stage_key
  const isClosed = deal.status !== 'open'

  return (
    <div>
      <TopBar title={deal.title} subtitle="Deal detail" />
      <div className="p-6 space-y-6 animate-fade-up">

        <Link to="/sales/deals" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-600">
          <Sym name="arrow_back" size={14} /> Back to pipeline
        </Link>

        {/* Deal summary */}
        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display font-semibold text-brand-950">{deal.title}</h2>
                <span className={cn('inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full capitalize',
                  deal.status === 'won' ? 'bg-green-100 text-green-700'
                    : deal.status === 'lost' ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-700')}>
                  {deal.status}
                </span>
                <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">{stageLabel}</span>
              </div>
              <p className="text-2xl font-semibold text-brand-700 tabular-nums mt-2">{formatRupees(deal.amount)}</p>
            </div>
            {canClose && !isClosed && (
              <button onClick={handleMarkWon} disabled={markWon.isPending || moveStage.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 shrink-0">
                <Sym name="emoji_events" size={15} /> {markWon.isPending ? 'Working…' : 'Mark Won'}
              </button>
            )}
          </div>

          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-sm">
            <Field label="Client" value={deal.client_id ? (clientById[deal.client_id] ?? deal.client_id.slice(0, 8)) : '—'} />
            <Field label="Owner" value={deal.owner_id ? (nameById[deal.owner_id] ?? '—') : 'Unassigned'} />
            <Field label="Expected Close" value={formatDate(deal.expected_close_date)} />
            <Field label="Created" value={formatDate(deal.created_at)} />
            {deal.lead_id && <Field label="Linked Lead" value={deal.lead_id.slice(0, 8)} />}
            {deal.lost_reason && <Field label="Lost Reason" value={deal.lost_reason} />}
          </dl>

          {deal.notes && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-brand-950 whitespace-pre-wrap">{deal.notes}</p>
            </div>
          )}
        </div>

        {/* Quotations */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-brand-950 flex items-center gap-2">
              <Sym name="request_quote" size={16} className="text-brand-600" /> Quotations
            </h2>
            {canManageQuote && (
              <button onClick={() => setShowQuoteForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
                <Sym name="add" size={14} /> New Quotation
              </button>
            )}
          </div>

          {quotationsQ.isLoading ? (
            <div className="h-16 glass-panel rounded-xl animate-pulse" />
          ) : (
            <div className="bg-white rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F8FAFC] border-b border-border"><tr>
                  {['#', 'Status', 'Subtotal', 'Discount', 'Tax', 'Grand Total', 'Valid Until', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {quotations.map(q => (
                    <QuotationRow key={q.id} quote={q} dealId={id} canManage={canManageQuote} />
                  ))}
                  {quotations.length === 0 && (
                    <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-muted-foreground">No quotations yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Stage history */}
        <section className="space-y-3">
          <h2 className="font-display font-semibold text-brand-950 flex items-center gap-2">
            <Sym name="history" size={16} className="text-brand-600" /> Stage History
          </h2>
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-border"><tr>
                {['When', 'From', 'To', 'By'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {(historyQ.data ?? []).map(h => (
                  <tr key={h.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">{formatDateTime(h.changed_at)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{h.from_stage ?? '—'}</td>
                    <td className="px-5 py-3 text-brand-950">{h.to_stage}</td>
                    <td className="px-5 py-3 text-muted-foreground">{h.changed_by ? (nameById[h.changed_by] ?? '—') : 'System'}</td>
                  </tr>
                ))}
                {(historyQ.data ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-6 text-center text-sm text-muted-foreground">No stage changes recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {showQuoteForm && (
        <QuotationBuilder dealId={id} onClose={() => setShowQuoteForm(false)} />
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-brand-950 mt-0.5">{value}</dd>
    </div>
  )
}

function QuotationRow({ quote, dealId, canManage }: { quote: Quotation; dealId: string; canManage: boolean }) {
  const updateStatus = useUpdateQuotationStatus(dealId)
  return (
    <tr className="hover:bg-[#F8FAFC]">
      <td className="px-5 py-3 text-brand-950">v{quote.version}{quote.quote_no ? ` · ${quote.quote_no}` : ''}</td>
      <td className="px-5 py-3">
        <span className={cn('inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full capitalize', QUOTE_STATUS_CLASSES[quote.status])}>
          {quote.status}
        </span>
      </td>
      <td className="px-5 py-3 tabular-nums text-muted-foreground">{formatRupees(quote.subtotal)}</td>
      <td className="px-5 py-3 tabular-nums text-muted-foreground">{formatRupees(quote.discount_total)}</td>
      <td className="px-5 py-3 tabular-nums text-muted-foreground">{formatRupees(quote.tax_total)}</td>
      <td className="px-5 py-3 tabular-nums font-semibold text-brand-950">{formatRupees(quote.grand_total)}</td>
      <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">{formatDate(quote.valid_until)}</td>
      <td className="px-5 py-3 text-right">
        {canManage && quote.status === 'draft' && (
          <button
            onClick={() => updateStatus.mutate({ id: quote.id, status: 'sent' })}
            disabled={updateStatus.isPending}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 border border-border rounded-lg hover:bg-white disabled:opacity-50"
            title="Mark as sent">
            <Sym name="send" size={12} /> Send
          </button>
        )}
      </td>
    </tr>
  )
}

// ── Quotation builder ────────────────────────────────────────────────────────

function QuotationBuilder({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const servicesQ = useServices()
  const createQuote = useCreateQuotation(dealId)

  const [lines, setLines] = useState<LineDraft[]>([])
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')

  const services = (servicesQ.data ?? []).filter(s => s.is_active)
  const totals = useMemo(() => computeTotals(lines), [lines])

  const addLine = (service?: SalesService) => {
    setLines(prev => [...prev, service ? {
      service_id: service.id,
      description: service.name,
      quantity: 1,
      unit_price: service.default_fee,
      discount_percent: 0,
      gst_rate: service.gst_rate,
      hsn_sac: service.hsn_sac,
    } : {
      service_id: null,
      description: '',
      quantity: 1,
      unit_price: 0,
      discount_percent: 0,
      gst_rate: 18,
      hsn_sac: null,
    }])
  }

  const updateLine = (idx: number, patch: Partial<LineDraft>) =>
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx))

  const onServiceSelect = (idx: number, serviceId: string) => {
    const svc = services.find(s => s.id === serviceId)
    if (!svc) { updateLine(idx, { service_id: null }); return }
    updateLine(idx, {
      service_id: svc.id,
      description: svc.name,
      unit_price: svc.default_fee,
      gst_rate: svc.gst_rate,
      hsn_sac: svc.hsn_sac,
    })
  }

  const submit = async (status: 'draft' | 'sent') => {
    if (lines.length === 0) return
    await createQuote.mutateAsync({
      deal_id: dealId,
      valid_until: validUntil || null,
      notes: notes.trim() || null,
      status,
      lines,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-white z-10">
          <h2 className="font-display font-semibold text-brand-950">New Quotation</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-brand-950">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Lines */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground"><tr>
                {['Service', 'Description', 'Qty', 'Unit ₹', 'Disc %', 'GST %', 'Line Total', ''].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {lines.map((l, idx) => {
                  const computed = computeLine(l)
                  return (
                    <tr key={idx} className="border-t border-border">
                      <td className="px-2 py-1.5">
                        <select value={l.service_id ?? ''} onChange={e => onServiceSelect(idx, e.target.value)}
                          className="w-32 px-2 py-1 border border-border rounded bg-white">
                          <option value="">Custom</option>
                          {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={l.description} onChange={e => updateLine(idx, { description: e.target.value })}
                          className="w-40 px-2 py-1 border border-border rounded" placeholder="Description" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" min="0" step="0.01" value={l.quantity}
                          onChange={e => updateLine(idx, { quantity: parseFloat(e.target.value) || 0 })}
                          className="w-16 px-2 py-1 border border-border rounded tabular-nums" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" min="0" step="0.01" value={l.unit_price / 100}
                          onChange={e => updateLine(idx, { unit_price: Math.round((parseFloat(e.target.value) || 0) * 100) })}
                          className="w-24 px-2 py-1 border border-border rounded tabular-nums" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" min="0" max="100" step="0.01" value={l.discount_percent}
                          onChange={e => updateLine(idx, { discount_percent: parseFloat(e.target.value) || 0 })}
                          className="w-16 px-2 py-1 border border-border rounded tabular-nums" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" min="0" step="0.01" value={l.gst_rate}
                          onChange={e => updateLine(idx, { gst_rate: parseFloat(e.target.value) || 0 })}
                          className="w-16 px-2 py-1 border border-border rounded tabular-nums" />
                      </td>
                      <td className="px-2 py-1.5 tabular-nums font-medium text-brand-950 whitespace-nowrap">{formatRupees(computed.line_total)}</td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => removeLine(idx)} className="text-muted-foreground hover:text-red-600" title="Remove line">
                          <Sym name="delete" size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {lines.length === 0 && (
                  <tr><td colSpan={8} className="px-2 py-6 text-center text-muted-foreground border-t border-border">No line items yet — add one below.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => addLine()} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 border border-border rounded-lg hover:bg-[#F8FAFC]">
              <Sym name="add" size={13} /> Add line
            </button>
            {servicesQ.isLoading && <span className="text-xs text-muted-foreground">Loading services…</span>}
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <dl className="w-64 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatRupees(totals.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular-nums">− {formatRupees(totals.discount_total)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Tax (GST)</dt><dd className="tabular-nums">{formatRupees(totals.tax_total)}</dd></div>
              <div className="flex justify-between pt-1 border-t border-border font-semibold text-brand-950"><dt>Grand Total</dt><dd className="tabular-nums">{formatRupees(totals.grand_total)}</dd></div>
            </dl>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Valid Until</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                placeholder="Terms, remarks…" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border sticky bottom-0 bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={() => submit('draft')} disabled={createQuote.isPending || lines.length === 0}
            className="px-4 py-2 text-sm border border-brand-600 text-brand-700 font-medium rounded-lg hover:bg-brand-50 disabled:opacity-50">
            Save Draft
          </button>
          <button onClick={() => submit('sent')} disabled={createQuote.isPending || lines.length === 0}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {createQuote.isPending ? 'Saving…' : 'Save & Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
