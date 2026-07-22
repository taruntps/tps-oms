// HRMS — Candidate detail (/hrms/recruit/candidates/:id).
// The candidate's applications; per selected application: interviews + feedback
// (schedule/feedback gated by hrms.recruitment.interview) and offers (draft/send/
// accept). Accepting an offer provisions the employee (admin_create_user) and starts
// onboarding — see api/recruitment.acceptOffer. Base manage gated by
// hrms.recruitment.manage.
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate, formatDateTime } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useCan } from '@/core/access/useCan'
import { useActiveProfiles } from '../hooks/useEmployees'
import {
  useCandidate,
  useApplications,
  useCreateApplication,
  useSetApplicationStatus,
  useInterviews,
  useCreateInterview,
  useSetInterviewStatus,
  useFeedback,
  useSubmitFeedback,
  useOffers,
  useCreateOffer,
  useSendOffer,
  useSetOfferStatus,
  useAcceptOffer,
} from '../hooks/useRecruitment'
import { usePostings } from '../hooks/useRecruitment'
import { fmtPaise } from './payrollShared'
import { StatusPill, RecommendationPill, inputCls, istToday, rupeesToPaise } from './recruitShared'
import type {
  CandidateApplication,
  Interview,
  Offer,
  Recommendation,
} from '../api/recruitment'

export default function CandidateDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const canManage = useCan('hrms.recruitment.manage')

  const { data: candidate, isLoading } = useCandidate(id)
  const { data: applications = [] } = useApplications(id)
  const { data: postings = [] } = usePostings('open')
  const createApp = useCreateApplication()

  const [selectedApp, setSelectedApp] = useState<string | null>(null)
  const activeApp = useMemo(
    () => applications.find(a => a.id === (selectedApp ?? applications[0]?.id)) ?? null,
    [applications, selectedApp],
  )

  if (isLoading) {
    return (
      <div>
        <TopBar title="Candidate" />
        <div className="p-6"><div className="h-40 bg-white rounded-lg border border-border animate-pulse" /></div>
      </div>
    )
  }
  if (!candidate) {
    return (
      <div>
        <TopBar title="Candidate" />
        <div className="p-6"><p className="text-sm text-muted-foreground">Candidate not found.</p></div>
      </div>
    )
  }

  return (
    <div>
      <TopBar title={candidate.name} subtitle={candidate.email ?? undefined} />

      <div className="p-6 animate-fade-up space-y-6">
        <button onClick={() => navigate('/hrms/recruit/candidates')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-950">
          <Sym name="arrow_back" size={15} /> Back to pipeline
        </button>

        {/* Candidate summary */}
        <div className="bg-white rounded-xl border border-border p-5 flex flex-wrap items-center gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
            <div className="mt-1"><StatusPill status={candidate.status} /></div>
          </div>
          <Meta label="Phone" value={candidate.phone ?? '—'} />
          <Meta label="Source" value={candidate.source ?? '—'} />
          <Meta label="Current CTC" value={candidate.current_ctc != null ? fmtPaise(candidate.current_ctc) : '—'} />
          <Meta label="Expected CTC" value={candidate.expected_ctc != null ? fmtPaise(candidate.expected_ctc) : '—'} />
        </div>

        {/* Applications */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-brand-950">Applications</h3>
            {canManage && (
              <AddApplicationButton
                candidateId={id}
                postings={postings}
                onAdd={(posting_id, stage) => createApp.mutate({ candidate_id: id, posting_id, stage })}
                pending={createApp.isPending}
              />
            )}
          </div>
          {applications.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">No applications yet.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {applications.map(a => (
                <button
                  key={a.id}
                  onClick={() => setSelectedApp(a.id)}
                  className={`px-3 py-2 text-sm rounded-lg border text-left ${activeApp?.id === a.id ? 'border-brand-600 bg-brand-600/5' : 'border-border bg-white hover:bg-[#F8FAFC]'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-brand-950">{postingTitle(postings, a.posting_id)}</span>
                    <StatusPill status={a.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Stage: {a.stage || '—'}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        {activeApp && (
          <>
            <ApplicationActions application={activeApp} canManage={canManage} />
            <InterviewsSection application={activeApp} />
            <OffersSection application={activeApp} candidate={candidate} />
          </>
        )}
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-brand-950 mt-1">{value}</p>
    </div>
  )
}

function postingTitle(postings: { id: string; title: string }[], id: string | null): string {
  if (!id) return 'General application'
  return postings.find(p => p.id === id)?.title ?? 'Application'
}

function AddApplicationButton({ candidateId, postings, onAdd, pending }: {
  candidateId: string
  postings: { id: string; title: string }[]
  onAdd: (postingId: string | null, stage: string) => void
  pending: boolean
}) {
  const [open, setOpen] = useState(false)
  const [postingId, setPostingId] = useState('')
  const [stage, setStage] = useState('Applied')
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">
        <Sym name="add" size={14} /> Add application
      </button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <select value={postingId} onChange={e => setPostingId(e.target.value)} className="px-2 py-1.5 text-sm border border-border rounded-lg bg-white">
        <option value="">General</option>
        {postings.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>
      <input value={stage} onChange={e => setStage(e.target.value)} placeholder="Stage" className="px-2 py-1.5 text-sm border border-border rounded-lg bg-white w-28" />
      <button
        onClick={() => { onAdd(postingId || null, stage.trim() || 'Applied'); setOpen(false) }}
        disabled={pending}
        className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
      >
        Add
      </button>
      <button onClick={() => setOpen(false)} className="px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"><Sym name="close" size={14} /></button>
      <span className="sr-only">{candidateId}</span>
    </div>
  )
}

function ApplicationActions({ application, canManage }: { application: CandidateApplication; canManage: boolean }) {
  const setStatus = useSetApplicationStatus()
  if (!canManage || application.status !== 'active') return null
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setStatus.mutate({ id: application.id, status: 'rejected', candidateId: application.candidate_id })}
        disabled={setStatus.isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        <Sym name="close" size={14} /> Reject application
      </button>
      <button
        onClick={() => setStatus.mutate({ id: application.id, status: 'withdrawn', candidateId: application.candidate_id })}
        disabled={setStatus.isPending}
        className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50"
      >
        Mark withdrawn
      </button>
    </div>
  )
}

// ── Interviews + feedback ──────────────────────────────────────────────────────
function InterviewsSection({ application }: { application: CandidateApplication }) {
  const { user } = useAuth()
  const canInterview = useCan('hrms.recruitment.interview')
  const { data: interviews = [] } = useInterviews(application.id)
  const { data: profiles = [] } = useActiveProfiles()
  const createInterview = useCreateInterview()
  const setStatus = useSetInterviewStatus(application.id)

  const profName = useMemo(() => new Map(profiles.map(p => [p.id, p.name ?? p.id.slice(0, 8)])), [profiles])
  const [scheduling, setScheduling] = useState(false)
  const [form, setForm] = useState({ stage: 'Round 1', scheduled_at: '', interviewer_id: '' })

  const schedule = () => {
    createInterview.mutate(
      {
        application_id: application.id,
        stage: form.stage.trim() || null,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        interviewer_id: form.interviewer_id || null,
      },
      { onSuccess: () => { setScheduling(false); setForm({ stage: 'Round 1', scheduled_at: '', interviewer_id: '' }) } },
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-brand-950">Interviews</h3>
        {canInterview && !scheduling && (
          <button onClick={() => setScheduling(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">
            <Sym name="event" size={14} /> Schedule
          </button>
        )}
      </div>

      {scheduling && canInterview && (
        <div className="bg-white rounded-xl border border-border p-4 mb-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Stage</label>
            <input value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">When</label>
            <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Interviewer</label>
            <select value={form.interviewer_id} onChange={e => setForm({ ...form, interviewer_id: e.target.value })} className={inputCls}>
              <option value="">—</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name ?? p.id.slice(0, 8)}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={schedule} disabled={createInterview.isPending} className="px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">Save</button>
            <button onClick={() => setScheduling(false)} className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          </div>
        </div>
      )}

      {interviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No interviews scheduled.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {interviews.map(iv => (
            <InterviewCard
              key={iv.id}
              interview={iv}
              interviewerName={iv.interviewer_id ? profName.get(iv.interviewer_id) ?? '—' : '—'}
              canInterview={canInterview}
              currentUserId={user?.id}
              applicationId={application.id}
              onCancel={() => setStatus.mutate({ id: iv.id, status: 'cancelled' })}
              cancelPending={setStatus.isPending}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function InterviewCard({ interview, interviewerName, canInterview, currentUserId, applicationId, onCancel, cancelPending }: {
  interview: Interview
  interviewerName: string
  canInterview: boolean
  currentUserId?: string
  applicationId: string
  onCancel: () => void
  cancelPending: boolean
}) {
  const { data: feedback = [] } = useFeedback(interview.id)
  const submit = useSubmitFeedback(applicationId, currentUserId)
  const [giving, setGiving] = useState(false)
  const [form, setForm] = useState<{ score: string; recommendation: Recommendation; notes: string }>({ score: '', recommendation: 'hold', notes: '' })

  const save = () => {
    submit.mutate(
      {
        interview_id: interview.id,
        score: form.score ? Number(form.score) : null,
        recommendation: form.recommendation,
        notes: form.notes.trim() || null,
      },
      { onSuccess: () => { setGiving(false); setForm({ score: '', recommendation: 'hold', notes: '' }) } },
    )
  }

  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-lg bg-brand-600/10 flex items-center justify-center shrink-0">
          <Sym name="record_voice_over" size={18} className="text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-brand-950">{interview.stage || 'Interview'}</span>
            <StatusPill status={interview.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {interview.scheduled_at ? formatDateTime(interview.scheduled_at) : 'Time TBD'} · {interviewerName}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canInterview && interview.status === 'scheduled' && (
            <>
              <button onClick={() => setGiving(v => !v)} className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-[#F8FAFC]">
                <Sym name="rate_review" size={13} /> Feedback
              </button>
              <button onClick={onCancel} disabled={cancelPending} className="px-2.5 py-1 text-xs border border-border rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50">Cancel</button>
            </>
          )}
        </div>
      </div>

      {/* Feedback list */}
      {feedback.length > 0 && (
        <div className="mt-3 pl-13 space-y-2 border-t border-border pt-3">
          {feedback.map(f => (
            <div key={f.id} className="flex items-start gap-3">
              <RecommendationPill value={f.recommendation} />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Score: {f.score ?? '—'} · {formatDate(f.created_at)}</p>
                {f.notes && <p className="text-sm text-brand-900 mt-0.5">{f.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {giving && canInterview && (
        <div className="mt-3 border-t border-border pt-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Score (0-10)</label>
            <input type="number" min={0} max={10} step={0.5} value={form.score} onChange={e => setForm({ ...form, score: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Recommendation</label>
            <select value={form.recommendation} onChange={e => setForm({ ...form, recommendation: e.target.value as Recommendation })} className={inputCls}>
              <option value="hire">Hire</option>
              <option value="hold">Hold</option>
              <option value="reject">Reject</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-brand-950 mb-1">Notes</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={submit.isPending} className="px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">Submit</button>
            <button onClick={() => setGiving(false)} className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Offers ──────────────────────────────────────────────────────────────────────
function OffersSection({ application, candidate }: {
  application: CandidateApplication
  candidate: { id: string; name: string; email: string | null; phone: string | null }
}) {
  const { user } = useAuth()
  const canManage = useCan('hrms.recruitment.manage')
  const canApprove = useCan('hrms.recruitment.approve')
  const { data: offers = [] } = useOffers(application.id)
  const createOffer = useCreateOffer()
  const sendOffer = useSendOffer(application.id, user?.id)
  const setStatus = useSetOfferStatus(application.id)

  const [drafting, setDrafting] = useState(false)
  const [form, setForm] = useState({ ctc: '', joining_date: istToday() })
  const [accepting, setAccepting] = useState<Offer | null>(null)

  const draft = () => {
    createOffer.mutate(
      {
        application_id: application.id,
        ctc: rupeesToPaise(form.ctc),
        joining_date: form.joining_date || null,
      },
      { onSuccess: () => { setDrafting(false); setForm({ ctc: '', joining_date: istToday() }) } },
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-brand-950">Offers</h3>
        {canManage && !drafting && (
          <button onClick={() => setDrafting(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">
            <Sym name="description" size={14} /> Draft offer
          </button>
        )}
      </div>

      {drafting && canManage && (
        <div className="bg-white rounded-xl border border-border p-4 mb-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">CTC (₹/yr)</label>
            <input type="number" min={0} value={form.ctc} onChange={e => setForm({ ...form, ctc: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Joining date</label>
            <input type="date" value={form.joining_date} onChange={e => setForm({ ...form, joining_date: e.target.value })} className={inputCls} />
          </div>
          <div className="flex gap-2">
            <button onClick={draft} disabled={createOffer.isPending} className="px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">Save draft</button>
            <button onClick={() => setDrafting(false)} className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          </div>
        </div>
      )}

      {offers.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No offers yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {offers.map(o => (
            <div key={o.id} className="bg-white rounded-xl border border-border p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-brand-950">{o.ctc != null ? fmtPaise(o.ctc) : '—'}</span>
                  <StatusPill status={o.status} />
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">Joining {o.joining_date ? formatDate(o.joining_date) : '—'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canApprove && o.status === 'draft' && user?.id && (
                  <button onClick={() => sendOffer.mutate(o.id)} disabled={sendOffer.isPending} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                    <Sym name="send" size={13} /> Approve & send
                  </button>
                )}
                {canManage && o.status === 'sent' && (
                  <>
                    <button onClick={() => setStatus.mutate({ id: o.id, status: 'declined' })} disabled={setStatus.isPending} className="px-2.5 py-1 text-xs border border-border rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50">Declined</button>
                    <button onClick={() => setAccepting(o)} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">
                      <Sym name="how_to_reg" size={13} /> Accept & hire
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {accepting && (
        <AcceptOfferModal
          offer={accepting}
          application={application}
          candidate={candidate}
          onClose={() => setAccepting(null)}
        />
      )}
    </section>
  )
}

function AcceptOfferModal({ offer, application, candidate, onClose }: {
  offer: Offer
  application: CandidateApplication
  candidate: { id: string; name: string; email: string | null; phone: string | null; status?: string }
  onClose: () => void
}) {
  const accept = useAcceptOffer(application.id)
  const [form, setForm] = useState({ role: 'executive', password: '', employee_code: '' })

  const canSubmit = !!candidate.email && form.password.length >= 6

  const submit = () => {
    if (!canSubmit) return
    accept.mutate(
      {
        offer,
        application,
        candidate: candidate as any,
        role: form.role,
        password: form.password,
        employee_code: form.employee_code.trim() || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">Accept Offer & Provision Employee</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            This creates the employee account for <span className="font-medium text-brand-950">{candidate.name}</span> and starts onboarding from the default template.
          </p>
          {!candidate.email && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">A candidate email is required to provision the employee login.</p>
          )}
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Login email</label>
            <input value={candidate.email ?? ''} disabled className={`${inputCls} bg-[#F8FAFC]`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Role</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={inputCls}>
              <option value="executive">Executive</option>
              <option value="accounts">Accounts</option>
              <option value="manager">Manager</option>
              <option value="hr">HR</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Employee code</label>
            <input value={form.employee_code} onChange={e => setForm({ ...form, employee_code: e.target.value })} placeholder="Optional" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Temporary password<span className="text-red-500">*</span></label>
            <input type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" className={inputCls} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={submit} disabled={!canSubmit || accept.isPending} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">Accept & Hire</button>
        </div>
      </div>
    </div>
  )
}
