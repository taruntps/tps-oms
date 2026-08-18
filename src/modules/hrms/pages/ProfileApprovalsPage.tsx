// HRMS — Admin review of employee profile change requests (/hrms/profile/approvals).
// Lists pending submissions; approve writes to the real tables (review_profile_change),
// reject returns it to the employee with a note. Admin-only (migration 104).
import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { usePendingRequests, useReviewProfileChange } from '../hooks/useProfileSelf'
import type { ProfileChangeRequest } from '../api/profileSelf'

const SECTIONS: { key: keyof ProfileChangeRequest['payload']; title: string; fields: [string, string][] }[] = [
  { key: 'personal', title: 'Personal & contact', fields: [
    ['date_of_birth', 'Date of birth'], ['gender', 'Gender'], ['marital_status', 'Marital status'],
    ['blood_group', 'Blood group'], ['nationality', 'Nationality'], ['personal_email', 'Personal email'],
    ['home_phone', 'Phone'], ['father_name', "Father's name"], ['mother_name', "Mother's name"],
    ['local_address', 'Current address'], ['permanent_address', 'Permanent address'] ] },
  { key: 'emergency', title: 'Emergency contact', fields: [
    ['name', 'Name'], ['relation', 'Relationship'], ['phone', 'Phone'] ] },
  { key: 'bank', title: 'Bank details', fields: [
    ['account_name', 'Account holder'], ['account_no', 'Account no.'], ['ifsc', 'IFSC'],
    ['bank_name', 'Bank'], ['branch', 'Branch'] ] },
  { key: 'statutory', title: 'Statutory IDs', fields: [
    ['pan_no', 'PAN'], ['aadhar_no', 'Aadhaar'], ['uan', 'UAN'], ['pf_no', 'PF no.'],
    ['esi_no', 'ESIC'], ['pran', 'PRAN'] ] },
]

const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

export default function ProfileApprovalsPage() {
  const { data: pending = [], isLoading } = usePendingRequests()
  const review = useReviewProfileChange()
  const [openId, setOpenId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const doReject = () => {
    if (!rejectId) return
    review.mutate({ id: rejectId, approve: false, note: note.trim() || null },
      { onSuccess: () => { setRejectId(null); setNote(''); setOpenId(null) } })
  }

  return (
    <div>
      <TopBar title="Profile Approvals" subtitle="Employee self-service submissions awaiting review" />
      <div className="p-6 animate-fade-up space-y-4 max-w-3xl">
        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-white rounded-xl border border-border animate-pulse" />)}</div>
        ) : pending.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="task_alt" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No submissions awaiting approval.</p>
          </div>
        ) : pending.map(req => {
          const open = openId === req.id
          return (
            <div key={req.id} className="bg-white rounded-xl border border-border overflow-hidden">
              <button onClick={() => setOpenId(open ? null : req.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F8FAFC]">
                <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                  <Sym name="person" size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-brand-950">{req.profiles?.name || 'Employee'}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {req.profiles?.employee_code ? req.profiles.employee_code + ' · ' : ''}Submitted {fmtDate(req.submitted_at)}
                  </div>
                </div>
                <Sym name={open ? 'expand_less' : 'expand_more'} size={20} className="text-muted-foreground" />
              </button>

              {open && (
                <div className="border-t border-border px-4 py-4 space-y-4">
                  {SECTIONS.map(sec => {
                    const data = (req.payload[sec.key] ?? {}) as unknown as Record<string, string>
                    const rows = sec.fields.filter(([k]) => (data[k] ?? '') !== '')
                    if (rows.length === 0) return null
                    return (
                      <div key={sec.key}>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{sec.title}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                          {rows.map(([k, label]) => (
                            <div key={k} className="flex justify-between gap-3 text-sm py-0.5 border-b border-border/50">
                              <span className="text-muted-foreground">{label}</span>
                              <span className="text-brand-950 font-medium text-right break-all">{data[k]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button onClick={() => { setRejectId(req.id); setNote('') }} disabled={review.isPending}
                      className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] text-red-600 disabled:opacity-50">
                      Reject
                    </button>
                    <button onClick={() => review.mutate({ id: req.id, approve: true })} disabled={review.isPending}
                      className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
                      {review.isPending ? 'Working…' : 'Approve & apply'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {rejectId && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h2 className="font-display font-semibold text-brand-950 mb-1">Return for correction</h2>
            <p className="text-xs text-muted-foreground mb-4">Add a note telling the employee what to fix. They'll be able to edit and resubmit.</p>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} autoFocus
              placeholder="e.g. Bank account number looks incomplete."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setRejectId(null); setNote('') }}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={doReject} disabled={review.isPending}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                {review.isPending ? 'Saving…' : 'Reject & return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
