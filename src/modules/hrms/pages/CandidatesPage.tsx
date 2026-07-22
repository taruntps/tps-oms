// HRMS — Candidates pipeline (/hrms/recruit/candidates).
// Kanban-style board grouping candidates by status (new → screening → interview →
// offer → hired / rejected). Add candidate + advance/reject stage gated by
// hrms.recruitment.manage. Click a card → CandidateDetailPage.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useAuth } from '@/contexts/AuthContext'
import { useCan } from '@/core/access/useCan'
import { useCandidates, useCreateCandidate, useSetCandidateStatus } from '../hooks/useRecruitment'
import { inputCls, rupeesToPaise } from './recruitShared'
import { fmtPaise } from './payrollShared'
import type { Candidate, CandidateStatus, CandidateInput } from '../api/recruitment'

const COLUMNS: { key: CandidateStatus; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'screening', label: 'Screening' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
  { key: 'hired', label: 'Hired' },
  { key: 'rejected', label: 'Rejected' },
]

// Forward advance path for the pipeline (rejected is a side branch).
const NEXT: Partial<Record<CandidateStatus, CandidateStatus>> = {
  new: 'screening', screening: 'interview', interview: 'offer', offer: 'hired',
}

export default function CandidatesPage() {
  const navigate = useNavigate()
  const canManage = useCan('hrms.recruitment.manage')
  const { data: candidates = [], isLoading } = useCandidates()
  const [showForm, setShowForm] = useState(false)

  const setStatus = useSetCandidateStatus()

  const grouped = useMemo(() => {
    const m = new Map<CandidateStatus, Candidate[]>()
    for (const c of COLUMNS) m.set(c.key, [])
    for (const cand of candidates) m.get(cand.status)?.push(cand)
    return m
  }, [candidates])

  return (
    <div>
      <TopBar title="Candidates" subtitle={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'} in pipeline`} />

      <div className="p-6 animate-fade-up space-y-5">
        {canManage && (
          <div className="flex justify-end">
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
              <Sym name="add" size={16} /> Add Candidate
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-40 bg-white rounded-lg border border-border animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {COLUMNS.map(col => {
              const rows = grouped.get(col.key) ?? []
              return (
                <div key={col.key} className="bg-[#F8FAFC] rounded-xl border border-border p-2.5 min-h-[200px]">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <span className="text-xs font-semibold text-brand-950 capitalize">{col.label}</span>
                    <span className="text-[11px] text-muted-foreground bg-white border border-border rounded px-1.5">{rows.length}</span>
                  </div>
                  <div className="space-y-2">
                    {rows.map(cand => (
                      <div
                        key={cand.id}
                        onClick={() => navigate(`/hrms/recruit/candidates/${cand.id}`)}
                        className="bg-white rounded-lg border border-border p-2.5 cursor-pointer hover:border-brand-600/40 hover:shadow-sm transition"
                      >
                        <p className="text-sm font-medium text-brand-950 truncate">{cand.name}</p>
                        {cand.email && <p className="text-[11px] text-muted-foreground truncate">{cand.email}</p>}
                        {cand.expected_ctc != null && (
                          <p className="text-[11px] text-muted-foreground mt-1">Exp: {fmtPaise(cand.expected_ctc)}</p>
                        )}
                        {canManage && (
                          <div className="flex items-center gap-1 mt-2" onClick={e => e.stopPropagation()}>
                            {NEXT[cand.status] && (
                              <button
                                onClick={() => setStatus.mutate({ id: cand.id, status: NEXT[cand.status]! })}
                                disabled={setStatus.isPending}
                                title={`Advance to ${NEXT[cand.status]}`}
                                className="flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] border border-border rounded hover:bg-[#F8FAFC] disabled:opacity-50"
                              >
                                <Sym name="arrow_forward" size={12} /> {NEXT[cand.status]}
                              </button>
                            )}
                            {cand.status !== 'hired' && cand.status !== 'rejected' && (
                              <button
                                onClick={() => setStatus.mutate({ id: cand.id, status: 'rejected' })}
                                disabled={setStatus.isPending}
                                title="Reject"
                                className="px-1.5 py-0.5 text-[11px] border border-border rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                <Sym name="close" size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {rows.length === 0 && <p className="text-[11px] text-muted-foreground/60 px-1 py-4 text-center">—</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showForm && canManage && <CandidateForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

function CandidateForm({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const create = useCreateCandidate(user?.id)
  const [form, setForm] = useState({ name: '', email: '', phone: '', source: '', current_ctc: '', expected_ctc: '' })

  const submit = () => {
    if (!form.name.trim()) return
    const input: CandidateInput = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      source: form.source.trim() || null,
      current_ctc: rupeesToPaise(form.current_ctc),
      expected_ctc: rupeesToPaise(form.expected_ctc),
    }
    create.mutate(input, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">Add Candidate</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Name<span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Source</label>
            <input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Referral, LinkedIn, …" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Current CTC (₹/yr)</label>
              <input type="number" min={0} value={form.current_ctc} onChange={e => setForm({ ...form, current_ctc: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Expected CTC (₹/yr)</label>
              <input type="number" min={0} value={form.expected_ctc} onChange={e => setForm({ ...form, expected_ctc: e.target.value })} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={submit} disabled={create.isPending || !form.name.trim()} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Add</button>
        </div>
      </div>
    </div>
  )
}
