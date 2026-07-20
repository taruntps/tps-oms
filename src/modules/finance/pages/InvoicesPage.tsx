// Finance — invoices list (/finance/invoices).
// Filter by status; show client, grand_total, amount_paid and balance. Create a
// DRAFT invoice (gated finance.invoice.manage) and issue a draft to the billing
// provider. Provider artifacts (IRN/PDF) are shown read-only once synced.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate, formatRupees, cn } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { useInvoices, useIssueInvoice } from '../hooks/useInvoices'
import type { InvoiceRow, InvoiceStatus } from '../api/invoices'
import { InvoiceForm } from './InvoiceForm'

const STATUS_FILTERS: { key: InvoiceStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'issued', label: 'Issued' },
  { key: 'partially_paid', label: 'Part-paid' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
]

export const STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  issued: 'bg-blue-50 text-blue-700 border-blue-200',
  partially_paid: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
}

export function StatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <span className={cn('inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize', STATUS_BADGE[status])}>
      {status.replace('_', ' ')}
    </span>
  )
}

function clientName(inv: InvoiceRow): string {
  return inv.client?.trade_name || inv.client?.company_name || '—'
}

export default function InvoicesPage() {
  const navigate = useNavigate()
  const canManage = useCan('finance.invoice.manage')
  const [status, setStatus] = useState<InvoiceStatus | 'all'>('all')
  const { data: invoices = [], isLoading, error } = useInvoices(status)
  const issue = useIssueInvoice()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter(
      (i) =>
        (i.invoice_no ?? '').toLowerCase().includes(q) ||
        clientName(i).toLowerCase().includes(q),
    )
  }, [invoices, search])

  return (
    <div>
      <TopBar title="Invoices" subtitle={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`} />

      <div className="p-6 animate-fade-up">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Sym name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice no, client…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>
          {canManage && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors ml-auto"
            >
              <Sym name="add" size={16} />
              New Invoice
            </button>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                status === f.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-muted-foreground border-border hover:bg-[#F8FAFC]',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="bg-white rounded-xl border border-border p-4 text-sm text-red-600">
            {(error as Error).message}
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-white rounded-xl border border-border animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold">Client</th>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-right font-semibold">Grand Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Paid</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((inv) => {
                  const balance = Math.max(0, inv.grand_total - inv.amount_paid)
                  return (
                    <tr key={inv.id} className="hover:bg-[#F8FAFC] cursor-pointer" onClick={() => navigate(`/finance/invoices/${inv.id}`)}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-brand-950">{inv.invoice_no || 'Draft'}</p>
                        {(inv.irn || inv.provider_id) && (
                          <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[160px]">
                            {inv.irn ? `IRN ${inv.irn}` : `#${inv.provider_id}`}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-brand-950">{clientName(inv)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3 text-right text-brand-950">{formatRupees(inv.grand_total)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{formatRupees(inv.amount_paid)}</td>
                      <td className="px-4 py-3 text-right font-medium text-brand-950">{formatRupees(balance)}</td>
                      <td className="px-4 py-3"><StatusPill status={inv.status} /></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {inv.pdf_url && (
                          <a
                            href={inv.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-700 hover:text-brand-800 mr-3"
                          >
                            <Sym name="picture_as_pdf" size={14} /> PDF
                          </a>
                        )}
                        {canManage && inv.status === 'draft' && (
                          <button
                            onClick={() => issue.mutate(inv.id)}
                            disabled={issue.isPending}
                            className="inline-flex items-center gap-1 text-xs text-white bg-brand-600 hover:bg-brand-700 px-2.5 py-1 rounded-lg disabled:opacity-50"
                          >
                            <Sym name="send" size={13} /> Issue
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No invoices found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <InvoiceForm onClose={() => setShowForm(false)} />}
    </div>
  )
}
