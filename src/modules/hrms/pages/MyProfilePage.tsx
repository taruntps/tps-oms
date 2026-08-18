// HRMS — Employee self-service "My Profile" (/hrms/profile), gate hrms.ess.view.
// Employee fills personal / emergency / bank / statutory details and submits for
// admin approval. Locks once submitted; admin-only after approval (migration 104).
import { useEffect, useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileCurrent, useMyLatestRequest, useSubmitProfileChange } from '../hooks/useProfileSelf'
import { emptyPayload, type ProfilePayload } from '../api/profileSelf'

const GENDERS = ['Male', 'Female', 'Other']
const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed']
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']

export default function MyProfilePage() {
  const { user } = useAuth()
  const uid = user?.id
  const { data: current, isLoading: lc } = useProfileCurrent(uid)
  const { data: latest, isLoading: lr } = useMyLatestRequest(uid)
  const submit = useSubmitProfileChange(uid)

  const [form, setForm] = useState<ProfilePayload>(emptyPayload())

  // Prefill from the pending submission if any, else the current on-file values.
  useEffect(() => {
    if (latest?.status === 'pending') setForm(latest.payload)
    else if (current) setForm(current)
  }, [current, latest])

  const locked = latest?.status === 'pending' || latest?.status === 'approved'
  const isLoading = lc || lr

  const set = (section: keyof ProfilePayload, key: string, val: string) =>
    setForm(f => ({ ...f, [section]: { ...(f[section] as any), [key]: val } }))

  const onSubmit = () => {
    if (locked) return
    if (!confirm('Submit these details for admin approval? You will not be able to edit them after submitting.')) return
    submit.mutate(form)
  }

  const banner = useMemo(() => {
    if (latest?.status === 'pending') return { tone: 'amber', icon: 'hourglass_top',
      title: 'Awaiting approval', msg: 'You have submitted your details. They are locked until an admin reviews them.' }
    if (latest?.status === 'approved') return { tone: 'green', icon: 'verified',
      title: 'Approved & locked', msg: 'Your details are approved. To change anything, please contact admin / HR.' }
    if (latest?.status === 'rejected') return { tone: 'red', icon: 'error',
      title: 'Returned for correction', msg: latest.note || 'An admin asked you to revise your details. Please update and resubmit.' }
    return null
  }, [latest])

  return (
    <div>
      <TopBar title="My Profile" subtitle="Your personal details" />
      <div className="p-6 animate-fade-up space-y-5 max-w-3xl">
        {banner && (
          <div className={`rounded-xl border p-4 flex items-start gap-3 ${
            banner.tone === 'green' ? 'bg-green-50 border-green-200 text-green-800'
            : banner.tone === 'red' ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <Sym name={banner.icon} size={18} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-sm">{banner.title}</div>
              <div className="text-[13px] opacity-90">{banner.msg}</div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-white rounded-xl border border-border animate-pulse" />)}</div>
        ) : (
          <fieldset disabled={locked} className={locked ? 'opacity-90' : ''}>
            <Section title="Personal & contact" icon="badge">
              <Field label="Date of birth" type="date" value={form.personal.date_of_birth} onChange={v => set('personal', 'date_of_birth', v)} />
              <Select label="Gender" options={GENDERS} value={form.personal.gender} onChange={v => set('personal', 'gender', v)} />
              <Select label="Marital status" options={MARITAL} value={form.personal.marital_status} onChange={v => set('personal', 'marital_status', v)} />
              <Select label="Blood group" options={BLOOD} value={form.personal.blood_group} onChange={v => set('personal', 'blood_group', v)} />
              <Field label="Nationality" value={form.personal.nationality} onChange={v => set('personal', 'nationality', v)} />
              <Field label="Personal email" type="email" value={form.personal.personal_email} onChange={v => set('personal', 'personal_email', v)} />
              <Field label="Home / mobile phone" value={form.personal.home_phone} onChange={v => set('personal', 'home_phone', v)} />
              <Field label="Father's name" value={form.personal.father_name} onChange={v => set('personal', 'father_name', v)} />
              <Field label="Mother's name" value={form.personal.mother_name} onChange={v => set('personal', 'mother_name', v)} />
              <Field label="Current address" full value={form.personal.local_address} onChange={v => set('personal', 'local_address', v)} />
              <Field label="Permanent address" full value={form.personal.permanent_address} onChange={v => set('personal', 'permanent_address', v)} />
            </Section>

            <Section title="Emergency contact" icon="emergency">
              <Field label="Contact name" value={form.emergency.name} onChange={v => set('emergency', 'name', v)} />
              <Field label="Relationship" value={form.emergency.relation} onChange={v => set('emergency', 'relation', v)} />
              <Field label="Contact phone" value={form.emergency.phone} onChange={v => set('emergency', 'phone', v)} />
            </Section>

            <Section title="Bank details (for salary)" icon="account_balance">
              <Field label="Account holder name" value={form.bank.account_name} onChange={v => set('bank', 'account_name', v)} />
              <Field label="Account number" value={form.bank.account_no} onChange={v => set('bank', 'account_no', v)} />
              <Field label="IFSC code" value={form.bank.ifsc} onChange={v => set('bank', 'ifsc', v)} />
              <Field label="Bank name" value={form.bank.bank_name} onChange={v => set('bank', 'bank_name', v)} />
              <Field label="Branch" value={form.bank.branch} onChange={v => set('bank', 'branch', v)} />
            </Section>

            <Section title="Statutory IDs" icon="fingerprint">
              <Field label="PAN" value={form.statutory.pan_no} onChange={v => set('statutory', 'pan_no', v)} />
              <Field label="Aadhaar number" value={form.statutory.aadhar_no} onChange={v => set('statutory', 'aadhar_no', v)} />
              <Field label="UAN (PF)" value={form.statutory.uan} onChange={v => set('statutory', 'uan', v)} />
              <Field label="PF number" value={form.statutory.pf_no} onChange={v => set('statutory', 'pf_no', v)} />
              <Field label="ESIC number" value={form.statutory.esi_no} onChange={v => set('statutory', 'esi_no', v)} />
              <Field label="PRAN (NPS)" value={form.statutory.pran} onChange={v => set('statutory', 'pran', v)} />
            </Section>
          </fieldset>
        )}

        {!isLoading && !locked && (
          <div className="flex items-center justify-end gap-3">
            <p className="text-xs text-muted-foreground mr-auto">Once submitted, these details lock until an admin approves.</p>
            <button onClick={onSubmit} disabled={submit.isPending}
              className="px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {submit.isPending ? 'Submitting…' : 'Submit for approval'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-border p-5 mb-5">
      <h3 className="flex items-center gap-2 font-display font-semibold text-brand-950 mb-4">
        <Sym name={icon} size={17} className="text-brand-600" /> {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-[#F8FAFC] disabled:text-muted-foreground'

function Field({ label, value, onChange, type = 'text', full }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; full?: boolean
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className={inputCls} />
    </div>
  )
}

function Select({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
