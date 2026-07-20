// CRM — Lead detail (/crm/leads/:id).
// Lead fields + activities timeline (log call/email/meeting/whatsapp/note) +
// Convert-to-client action (gated by crm.lead.convert).
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatRupees, formatDateTime } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { useLead, useStages, useCrmProfiles, useConvertLead } from '../hooks/useLeads'
import { useActivities, useLogActivity } from '../hooks/useActivities'
import type { ActivityType } from '../api/activities'
import { LeadForm } from './LeadForm'

const ACTIVITY_TYPES: { value: ActivityType; label: string; icon: string }[] = [
  { value: 'call', label: 'Call', icon: 'call' },
  { value: 'email', label: 'Email', icon: 'mail' },
  { value: 'meeting', label: 'Meeting', icon: 'groups' },
  { value: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
  { value: 'note', label: 'Note', icon: 'sticky_note_2' },
  { value: 'task', label: 'Task', icon: 'task_alt' },
]

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

export default function LeadDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const canManage = useCan('crm.lead.manage')
  const canConvert = useCan('crm.lead.convert')
  const canLog = useCan('crm.activity.log')

  const { data: lead, isLoading, error } = useLead(id)
  const { data: stages = [] } = useStages()
  const { data: profiles = [] } = useCrmProfiles()
  const { data: activities = [] } = useActivities('lead', id)
  const logActivity = useLogActivity()
  const convert = useConvertLead()

  const [showEdit, setShowEdit] = useState(false)
  const [confirmConvert, setConfirmConvert] = useState(false)
  const [actType, setActType] = useState<ActivityType>('call')
  const [actSubject, setActSubject] = useState('')
  const [actBody, setActBody] = useState('')

  if (isLoading) {
    return (
      <div>
        <TopBar title="Lead" />
        <div className="p-6"><div className="h-64 bg-white rounded-xl border border-border animate-pulse" /></div>
      </div>
    )
  }

  if (error || !lead) {
    return (
      <div>
        <TopBar title="Lead" />
        <div className="p-6">
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="error" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Lead not found.</p>
            <button onClick={() => navigate('/crm/leads')} className="mt-4 text-sm text-brand-600 hover:underline">Back to pipeline</button>
          </div>
        </div>
      </div>
    )
  }

  const stage = stages.find(s => s.stage_key === lead.stage_key)
  const owner = profiles.find(p => p.id === lead.owner_id)
  const alreadyConverted = !!lead.client_id

  const submitActivity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!actSubject.trim() && !actBody.trim()) return
    try {
      await logActivity.mutateAsync({
        entity_type: 'lead',
        entity_id: lead.id,
        type: actType,
        subject: actSubject.trim() || null,
        body: actBody.trim() || null,
      })
      setActSubject('')
      setActBody('')
    } catch {
      // toast surfaced by the hook
    }
  }

  const doConvert = async () => {
    setConfirmConvert(false)
    try {
      const res = await convert.mutateAsync(lead)
      navigate(`/clients/${res.clientId}`)
    } catch {
      // toast surfaced by the hook
    }
  }

  return (
    <div>
      <TopBar title={lead.company_name} subtitle={stage?.label ?? lead.stage_key} />

      <div className="p-6 animate-fade-up">
        {/* Back + actions */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => navigate('/crm/leads')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-950">
            <Sym name="arrow_back" size={16} /> Pipeline
          </button>
          <div className="flex items-center gap-2">
            {canManage && (
              <button onClick={() => setShowEdit(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">
                <Sym name="edit" size={15} /> Edit
              </button>
            )}
            {canConvert && !alreadyConverted && lead.status !== 'lost' && (
              <button onClick={() => setConfirmConvert(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
                <Sym name="person_add" size={15} /> Convert to Client
              </button>
            )}
            {alreadyConverted && (
              <button onClick={() => navigate(`/clients/${lead.client_id}`)} className="flex items-center gap-1.5 px-3 py-1.5 border border-green-200 bg-green-50 text-green-700 text-sm font-medium rounded-lg hover:bg-green-100">
                <Sym name="check_circle" size={15} /> View Client
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Details */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-xl border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <StatusBadge status={lead.status} />
                <span className="text-xs text-muted-foreground">{stage?.label ?? lead.stage_key}</span>
              </div>
              <dl className="space-y-3 text-sm">
                <Detail label="Contact" value={lead.contact_person} />
                <Detail label="Phone" value={lead.phone} />
                <Detail label="Email" value={lead.email} />
                <Detail label="Estimated Value" value={lead.estimated_value != null ? formatRupees(lead.estimated_value) : null} />
                <Detail label="Service Interest" value={lead.service_interest} />
                <Detail label="Source" value={lead.source} />
                <Detail label="Owner" value={owner?.name ?? null} />
                {lead.status === 'lost' && <Detail label="Lost Reason" value={lead.lost_reason} />}
              </dl>
              {lead.notes && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm text-brand-950 whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Activities timeline */}
          <div className="lg:col-span-2 space-y-4">
            {canLog && (
              <form onSubmit={submitActivity} className="bg-white rounded-xl border border-border p-4">
                <p className="text-sm font-semibold text-brand-950 mb-3">Log activity</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {ACTIVITY_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setActType(t.value)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        actType === t.value ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-muted-foreground border-border hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <Sym name={t.icon} size={14} /> {t.label}
                    </button>
                  ))}
                </div>
                <input className={`${ic} mb-2`} value={actSubject} onChange={e => setActSubject(e.target.value)} placeholder="Subject (e.g. Intro call)" />
                <textarea className={ic} rows={2} value={actBody} onChange={e => setActBody(e.target.value)} placeholder="Details…" />
                <div className="flex justify-end mt-3">
                  <button type="submit" disabled={logActivity.isPending || (!actSubject.trim() && !actBody.trim())} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
                    {logActivity.isPending ? 'Saving…' : 'Log Activity'}
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white rounded-xl border border-border p-5">
              <p className="text-sm font-semibold text-brand-950 mb-4">Timeline</p>
              {activities.length === 0 ? (
                <div className="text-center py-8">
                  <Sym name="history" size={26} className="mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                </div>
              ) : (
                <ol className="space-y-4">
                  {activities.map(a => {
                    const meta = ACTIVITY_TYPES.find(t => t.value === a.type)
                    return (
                      <li key={a.id} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-600/10 flex items-center justify-center shrink-0">
                          <Sym name={meta?.icon ?? 'circle'} size={15} className="text-brand-600" />
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-brand-950">{a.subject || meta?.label || a.type}</p>
                            <span className="text-[11px] text-muted-foreground shrink-0">{formatDateTime(a.activity_at)}</span>
                          </div>
                          {a.body && <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{a.body}</p>}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>

      {showEdit && <LeadForm lead={lead} onClose={() => setShowEdit(false)} />}

      {confirmConvert && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <Sym name="person_add" size={18} className="text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-brand-950 mb-1">Convert to Client</h3>
                <p className="text-sm text-muted-foreground">
                  This creates a client record from <strong>{lead.company_name}</strong> and marks the lead as won. Continue?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmConvert(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={doConvert} disabled={convert.isPending} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                {convert.isPending ? 'Converting…' : 'Convert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-brand-950 text-right truncate">{value || '—'}</dd>
    </div>
  )
}

function StatusBadge({ status }: { status: 'open' | 'won' | 'lost' }) {
  const map = {
    open: 'bg-blue-50 border-blue-200 text-blue-700',
    won: 'bg-green-50 border-green-200 text-green-700',
    lost: 'bg-red-50 border-red-200 text-red-700',
  }
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${map[status]}`}>{status}</span>
}
