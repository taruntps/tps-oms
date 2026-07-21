// HRMS — create / edit employee modal.
// Writes to `profiles` (core + FK refs) and `employee_details` (PII / employment).
import { useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { useCreateEmployee, useUpdateEmployee } from '../hooks/useEmployees'
import {
  useDepartments,
  useDesignations,
  useGrades,
  useEmploymentTypes,
  useOfficeLocations,
} from '../hooks/useMasters'
import { useActiveProfiles } from '../hooks/useEmployees'
import type { EmployeeProfile, EmployeeDetails } from '../api/employees'

interface Props {
  employee?: EmployeeProfile
  details?: EmployeeDetails | null
  onClose: () => void
}

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

const GENDERS = ['Male', 'Female', 'Other']
const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed']
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']

export function EmployeeForm({ employee, details, onClose }: Props) {
  const isEdit = !!employee
  const create = useCreateEmployee()
  const update = useUpdateEmployee()

  const { data: departments = [] } = useDepartments()
  const { data: designations = [] } = useDesignations()
  const { data: grades = [] } = useGrades()
  const { data: employmentTypes = [] } = useEmploymentTypes()
  const { data: branches = [] } = useOfficeLocations()
  const { data: profiles = [] } = useActiveProfiles()

  const [form, setForm] = useState({
    // profile
    name: employee?.name ?? '',
    email: employee?.email ?? '',
    phone: employee?.phone ?? '',
    // create-only: auth provisioning via admin_create_user
    password: '',
    role: employee?.role ?? 'executive',
    employee_code: employee?.employee_code ?? '',
    department_id: employee?.department_id ?? '',
    designation_id: employee?.designation_id ?? '',
    grade_id: employee?.grade_id ?? '',
    employment_type_id: employee?.employment_type_id ?? '',
    branch_location_id: employee?.branch_location_id ?? '',
    reports_to: employee?.reports_to ?? '',
    // details / PII
    date_of_birth: details?.date_of_birth ?? '',
    gender: details?.gender ?? '',
    marital_status: details?.marital_status ?? '',
    blood_group: details?.blood_group ?? '',
    nationality: details?.nationality ?? '',
    father_name: details?.father_name ?? '',
    mother_name: details?.mother_name ?? '',
    personal_email: details?.personal_email ?? '',
    home_phone: details?.home_phone ?? '',
    aadhar_no: details?.aadhar_no ?? '',
    pan_no: details?.pan_no ?? '',
    permanent_address: details?.permanent_address ?? '',
    local_address: details?.local_address ?? '',
    emergency_contact: details?.emergency_contact ?? '',
    higher_qualification: details?.higher_qualification ?? '',
    date_of_joining: details?.date_of_joining ?? '',
    probation_end_date: details?.probation_end_date ?? '',
    confirmation_date: details?.confirmation_date ?? '',
    employee_status: details?.employee_status ?? '',
  })

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const submitting = create.isPending || update.isPending

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 2) return
    if (!isEdit && (!form.email.trim() || form.password.length < 6)) return // create needs email + temp password

    const profile = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      employee_code: form.employee_code.trim() || null,
      department_id: form.department_id || null,
      designation_id: form.designation_id || null,
      grade_id: form.grade_id || null,
      employment_type_id: form.employment_type_id || null,
      branch_location_id: form.branch_location_id || null,
      reports_to: form.reports_to || null,
    }

    const detailsPayload = {
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      marital_status: form.marital_status || null,
      blood_group: form.blood_group || null,
      nationality: form.nationality.trim() || null,
      father_name: form.father_name.trim() || null,
      mother_name: form.mother_name.trim() || null,
      personal_email: form.personal_email.trim() || null,
      home_phone: form.home_phone.trim() || null,
      aadhar_no: form.aadhar_no.trim() || null,
      pan_no: form.pan_no.trim() || null,
      permanent_address: form.permanent_address.trim() || null,
      local_address: form.local_address.trim() || null,
      emergency_contact: form.emergency_contact.trim() || null,
      higher_qualification: form.higher_qualification.trim() || null,
      date_of_joining: form.date_of_joining || null,
      probation_end_date: form.probation_end_date || null,
      confirmation_date: form.confirmation_date || null,
      employee_status: form.employee_status || null,
    }

    try {
      if (isEdit) {
        await update.mutateAsync({ id: employee!.id, profile, details: detailsPayload })
      } else {
        await create.mutateAsync({
          create: {
            ...profile,
            email: form.email.trim(),
            password: form.password,
            role: form.role,
          },
          details: detailsPayload,
        })
      }
      onClose()
    } catch { /* toast surfaced by the hook */ }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{isEdit ? 'Edit Employee' : 'New Employee'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>

        <form onSubmit={onSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          <Section title="Identity">
            <Field label="Full Name *" className="col-span-2"><input className={ic} value={form.name} onChange={e => set('name', e.target.value)} autoFocus /></Field>
            <Field label="Employee Code"><input className={ic} value={form.employee_code} onChange={e => set('employee_code', e.target.value)} placeholder="Auto if blank" /></Field>
            <Field label={isEdit ? 'Work Email' : 'Work Email *'}><input className={ic} value={form.email} onChange={e => set('email', e.target.value)} disabled={isEdit} /></Field>
            <Field label="Phone"><input className={ic} value={form.phone} onChange={e => set('phone', e.target.value)} /></Field>
            {!isEdit && (
              <>
                <Field label="Login Role *">
                  <select className={ic} value={form.role} onChange={e => set('role', e.target.value)}>
                    {['executive', 'manager', 'hr', 'accounts', 'auditor', 'director', 'super_admin'].map(r => (
                      <option key={r} value={r} className="capitalize">{r.replace('_', ' ')}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Temp Password *">
                  <input className={ic} type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 6 chars — user resets later" />
                </Field>
              </>
            )}
            <Field label="Status">
              <select className={ic} value={form.employee_status} onChange={e => set('employee_status', e.target.value)}>
                <option value="">—</option>
                {['active', 'probation', 'notice', 'resigned', 'terminated', 'inactive'].map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </Field>
          </Section>

          <Section title="Employment">
            <Field label="Department">
              <select className={ic} value={form.department_id} onChange={e => set('department_id', e.target.value)}>
                <option value="">—</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Designation">
              <select className={ic} value={form.designation_id} onChange={e => set('designation_id', e.target.value)}>
                <option value="">—</option>
                {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Grade">
              <select className={ic} value={form.grade_id} onChange={e => set('grade_id', e.target.value)}>
                <option value="">—</option>
                {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
            <Field label="Employment Type">
              <select className={ic} value={form.employment_type_id} onChange={e => set('employment_type_id', e.target.value)}>
                <option value="">—</option>
                {employmentTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Branch / Location">
              <select className={ic} value={form.branch_location_id} onChange={e => set('branch_location_id', e.target.value)}>
                <option value="">—</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Reports To">
              <select className={ic} value={form.reports_to} onChange={e => set('reports_to', e.target.value)}>
                <option value="">—</option>
                {profiles.filter(p => p.id !== employee?.id).map(p => <option key={p.id} value={p.id}>{p.name ?? p.id}</option>)}
              </select>
            </Field>
            <Field label="Date of Joining"><input type="date" className={ic} value={form.date_of_joining} onChange={e => set('date_of_joining', e.target.value)} /></Field>
            <Field label="Probation End"><input type="date" className={ic} value={form.probation_end_date} onChange={e => set('probation_end_date', e.target.value)} /></Field>
            <Field label="Confirmation Date"><input type="date" className={ic} value={form.confirmation_date} onChange={e => set('confirmation_date', e.target.value)} /></Field>
          </Section>

          <Section title="Personal">
            <Field label="Date of Birth"><input type="date" className={ic} value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} /></Field>
            <Field label="Gender">
              <select className={ic} value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="">—</option>{GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="Marital Status">
              <select className={ic} value={form.marital_status} onChange={e => set('marital_status', e.target.value)}>
                <option value="">—</option>{MARITAL.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Blood Group">
              <select className={ic} value={form.blood_group} onChange={e => set('blood_group', e.target.value)}>
                <option value="">—</option>{BLOOD.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Nationality"><input className={ic} value={form.nationality} onChange={e => set('nationality', e.target.value)} /></Field>
            <Field label="Higher Qualification"><input className={ic} value={form.higher_qualification} onChange={e => set('higher_qualification', e.target.value)} /></Field>
            <Field label="Father's Name"><input className={ic} value={form.father_name} onChange={e => set('father_name', e.target.value)} /></Field>
            <Field label="Mother's Name"><input className={ic} value={form.mother_name} onChange={e => set('mother_name', e.target.value)} /></Field>
            <Field label="Personal Email"><input className={ic} value={form.personal_email} onChange={e => set('personal_email', e.target.value)} /></Field>
            <Field label="Home Phone"><input className={ic} value={form.home_phone} onChange={e => set('home_phone', e.target.value)} /></Field>
            <Field label="Aadhaar No"><input className={ic} value={form.aadhar_no} onChange={e => set('aadhar_no', e.target.value)} /></Field>
            <Field label="PAN No"><input className={ic} value={form.pan_no} onChange={e => set('pan_no', e.target.value)} /></Field>
            <Field label="Emergency Contact" className="col-span-2"><input className={ic} value={form.emergency_contact} onChange={e => set('emergency_contact', e.target.value)} /></Field>
            <Field label="Permanent Address" className="col-span-2"><textarea rows={2} className={ic} value={form.permanent_address} onChange={e => set('permanent_address', e.target.value)} /></Field>
            <Field label="Local Address" className="col-span-2"><textarea rows={2} className={ic} value={form.local_address} onChange={e => set('local_address', e.target.value)} /></Field>
          </Section>
        </form>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={onSubmit} disabled={submitting || form.name.trim().length < 2 || (!isEdit && (!form.email.trim() || form.password.length < 6))} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {submitting ? 'Saving…' : isEdit ? 'Update Employee' : 'Create Employee'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">{title}</p>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>
      {children}
    </div>
  )
}
