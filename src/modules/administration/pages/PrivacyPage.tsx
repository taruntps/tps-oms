// Administration — Privacy / DPDP (/admin/privacy).
// Lists consent records + data-subject requests, and lets an admin log a new
// data-subject request under the DPDP Act.
import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { cn, formatDate } from '@/lib/utils'
import { useConsentRecords, useDataSubjectRequests, useCreateDsr } from '../hooks/usePrivacy'
import type { NewDsrInput } from '../api/privacy'

const DSR_KINDS = ['access', 'erasure', 'rectification', 'portability'] as const
const SUBJECT_TYPES = ['client', 'employee', 'vendor', 'contact'] as const

function dsrStatusClasses(status: string): string {
  switch (status.toLowerCase()) {
    case 'fulfilled': return 'bg-green-100 text-green-700'
    case 'in_progress': return 'bg-amber-100 text-amber-700'
    case 'rejected': return 'bg-red-100 text-red-700'
    default: return 'bg-gray-100 text-gray-600'   // open
  }
}

export default function PrivacyPage() {
  const consentQ = useConsentRecords()
  const dsrQ = useDataSubjectRequests()
  const createDsr = useCreateDsr()
  const [showForm, setShowForm] = useState(false)

  return (
    <div>
      <TopBar title="Privacy & DPDP" subtitle="Consent records and data-subject requests" />
      <div className="p-6 space-y-8 animate-fade-up">

        {/* Data-subject requests */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-brand-950 flex items-center gap-2">
              <Sym name="privacy_tip" size={16} className="text-brand-600" /> Data-Subject Requests
            </h2>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
              <Sym name="add" size={14} /> New Request
            </button>
          </div>

          {dsrQ.error ? <ErrorPanel message={(dsrQ.error as Error).message} />
          : dsrQ.isLoading ? <SkeletonRows />
          : (
            <div className="bg-white rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F8FAFC] border-b border-border"><tr>
                  {['Subject', 'Kind', 'Status', 'Detail', 'Raised'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {(dsrQ.data ?? []).map(r => (
                    <tr key={r.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-3 text-brand-950 capitalize">{r.subject_type}{r.subject_id ? ` · ${r.subject_id.slice(0, 8)}` : ''}</td>
                      <td className="px-5 py-3 capitalize">{r.kind}</td>
                      <td className="px-5 py-3">
                        <span className={cn('inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full capitalize', dsrStatusClasses(r.status))}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground max-w-[280px] truncate">{r.detail ?? '—'}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">{formatDate(r.requested_at)}</td>
                    </tr>
                  ))}
                  {(dsrQ.data ?? []).length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">No data-subject requests yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Consent records */}
        <section className="space-y-3">
          <h2 className="font-display font-semibold text-brand-950 flex items-center gap-2">
            <Sym name="verified_user" size={16} className="text-brand-600" /> Consent Records
          </h2>

          {consentQ.error ? <ErrorPanel message={(consentQ.error as Error).message} />
          : consentQ.isLoading ? <SkeletonRows />
          : (
            <div className="bg-white rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F8FAFC] border-b border-border"><tr>
                  {['Subject', 'Purpose', 'Basis', 'Consent', 'Granted'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {(consentQ.data ?? []).map(c => (
                    <tr key={c.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-3 text-brand-950 capitalize">{c.subject_type}{c.subject_id ? ` · ${c.subject_id.slice(0, 8)}` : ''}</td>
                      <td className="px-5 py-3">{c.purpose}</td>
                      <td className="px-5 py-3 capitalize text-muted-foreground">{c.basis}</td>
                      <td className="px-5 py-3">
                        <span className={cn('inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full',
                          c.granted && !c.revoked_at ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                          {c.revoked_at ? 'Revoked' : c.granted ? 'Granted' : 'Denied'}
                        </span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">{formatDate(c.granted_at)}</td>
                    </tr>
                  ))}
                  {(consentQ.data ?? []).length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">No consent records yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {showForm && (
        <DsrForm pending={createDsr.isPending}
          onClose={() => setShowForm(false)}
          onSubmit={async (input) => { await createDsr.mutateAsync(input); setShowForm(false) }} />
      )}
    </div>
  )
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="glass-panel rounded-xl p-4 text-sm text-white">
      <div className="flex items-start gap-2">
        <Sym name="error" size={16} className="mt-0.5 shrink-0 text-red-300" />
        <div>
          <p className="font-medium mb-1">Couldn't load this section</p>
          <p className="text-xs text-white/70">{message}</p>
        </div>
      </div>
    </div>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <div key={i} className="h-12 glass-panel rounded-xl animate-pulse" />)}
    </div>
  )
}

function DsrForm({
  pending, onClose, onSubmit,
}: {
  pending: boolean
  onClose: () => void
  onSubmit: (input: NewDsrInput) => void
}) {
  const [subjectType, setSubjectType] = useState<string>(SUBJECT_TYPES[0])
  const [subjectId, setSubjectId] = useState('')
  const [kind, setKind] = useState<string>(DSR_KINDS[0])
  const [detail, setDetail] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ subject_type: subjectType, subject_id: subjectId.trim() || null, kind, detail: detail.trim() || undefined })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">New Data-Subject Request</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-brand-950">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Subject Type *</label>
            <select value={subjectType} onChange={e => setSubjectType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none capitalize">
              {SUBJECT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Subject ID (optional)</label>
            <input type="text" value={subjectId} onChange={e => setSubjectId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              placeholder="uuid of the client/employee/vendor" />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Request Kind *</label>
            <select value={kind} onChange={e => setKind(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none capitalize">
              {DSR_KINDS.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Detail</label>
            <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              placeholder="Context or details for this request" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
            <button type="submit" disabled={pending}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {pending ? 'Saving…' : 'Log Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
