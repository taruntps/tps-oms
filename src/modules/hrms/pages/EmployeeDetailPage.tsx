// HRMS — Employee detail (/hrms/employees/:id).
// Tabbed record: Profile / Employment / child-table CRUD tabs / Lifecycle timeline.
// Bank, Statutory & Medical tabs are gated by hrms.employee.sensitive.view; edits
// by hrms.employee.manage.
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate, formatDateTime } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { useEmployee, useEmployeeDetails, useActiveProfiles } from '../hooks/useEmployees'
import {
  useDepartments,
  useDesignations,
  useGrades,
  useEmploymentTypes,
  useOfficeLocations,
} from '../hooks/useMasters'
import { useStatusEvents } from '../hooks/useChildTables'
import { EmployeeForm } from './EmployeeForm'
import { ChildTableSection, type ChildField } from './ChildTableSection'
import type { ChildTable } from '../api/childTables'

interface ChildTabDef {
  id: string
  label: string
  icon: string
  table: ChildTable
  fields: ChildField[]
  primaryKeys: string[]
  sensitive?: boolean
}

const CHILD_TABS: ChildTabDef[] = [
  {
    id: 'bank', label: 'Bank', icon: 'account_balance', table: 'hr_employee_bank', sensitive: true,
    primaryKeys: ['bank_name', 'account_no'],
    fields: [
      { key: 'account_name', label: 'Account Name', required: true },
      { key: 'account_no', label: 'Account No', required: true },
      { key: 'ifsc', label: 'IFSC' },
      { key: 'bank_name', label: 'Bank Name', required: true },
      { key: 'branch', label: 'Branch' },
      { key: 'is_primary', label: 'Primary account', type: 'checkbox' },
    ],
  },
  {
    id: 'statutory', label: 'Statutory IDs', icon: 'badge', table: 'hr_employee_statutory_ids', sensitive: true,
    primaryKeys: ['uan'],
    fields: [
      { key: 'uan', label: 'UAN' },
      { key: 'pf_no', label: 'PF No' },
      { key: 'esi_no', label: 'ESI No' },
      { key: 'pran', label: 'PRAN' },
    ],
  },
  {
    id: 'nominees', label: 'Nominees', icon: 'diversity_3', table: 'hr_employee_nominees',
    primaryKeys: ['name', 'relation'],
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'relation', label: 'Relation' },
      { key: 'share_percent', label: 'Share %', type: 'number' },
      { key: 'scheme', label: 'Scheme' },
    ],
  },
  {
    id: 'emergency', label: 'Emergency', icon: 'emergency', table: 'hr_emergency_contacts',
    primaryKeys: ['name', 'phone'],
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'relation', label: 'Relation' },
      { key: 'phone', label: 'Phone', required: true },
      { key: 'address', label: 'Address', colSpan: 2 },
      { key: 'is_primary', label: 'Primary contact', type: 'checkbox' },
    ],
  },
  {
    id: 'qualifications', label: 'Qualifications', icon: 'school', table: 'hr_employee_qualifications',
    primaryKeys: ['degree', 'institution'],
    fields: [
      { key: 'degree', label: 'Degree', required: true },
      { key: 'specialization', label: 'Specialization' },
      { key: 'institution', label: 'Institution' },
      { key: 'year_completed', label: 'Year', type: 'number' },
      { key: 'grade', label: 'Grade' },
    ],
  },
  {
    id: 'experience', label: 'Experience', icon: 'work_history', table: 'hr_employee_experience',
    primaryKeys: ['company', 'designation'],
    fields: [
      { key: 'company', label: 'Company', required: true },
      { key: 'designation', label: 'Designation' },
      { key: 'from_date', label: 'From', type: 'date' },
      { key: 'to_date', label: 'To', type: 'date' },
      { key: 'ctc', label: 'CTC (₹/yr)', type: 'number' },
    ],
  },
  {
    id: 'skills', label: 'Skills', icon: 'psychology', table: 'hr_employee_skills',
    primaryKeys: ['skill'],
    fields: [
      { key: 'skill', label: 'Skill', required: true },
      { key: 'proficiency', label: 'Proficiency', type: 'select', options: ['Beginner', 'Intermediate', 'Advanced', 'Expert'] },
    ],
  },
  {
    id: 'family', label: 'Family', icon: 'family_restroom', table: 'hr_employee_family',
    primaryKeys: ['name', 'relation'],
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'relation', label: 'Relation' },
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
      { key: 'is_dependent', label: 'Dependent', type: 'checkbox' },
    ],
  },
  {
    id: 'medical', label: 'Medical', icon: 'medical_information', table: 'hr_employee_medical', sensitive: true,
    primaryKeys: ['condition'],
    fields: [
      { key: 'condition', label: 'Condition', required: true },
      { key: 'blood_group', label: 'Blood Group' },
      { key: 'notes', label: 'Notes', colSpan: 2 },
    ],
  },
]

export default function EmployeeDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const canManage = useCan('hrms.employee.manage')
  const canSensitive = useCan('hrms.employee.sensitive.view')

  const { data: emp, isLoading, error } = useEmployee(id)
  const { data: details } = useEmployeeDetails(id)
  const { data: departments = [] } = useDepartments()
  const { data: designations = [] } = useDesignations()
  const { data: grades = [] } = useGrades()
  const { data: employmentTypes = [] } = useEmploymentTypes()
  const { data: branches = [] } = useOfficeLocations()
  const { data: profiles = [] } = useActiveProfiles()

  const [tab, setTab] = useState('profile')
  const [showEdit, setShowEdit] = useState(false)

  const lookup = useMemo(() => ({
    dept: new Map(departments.map(d => [d.id, d.name])),
    desig: new Map(designations.map(d => [d.id, d.name])),
    grade: new Map(grades.map(g => [g.id, g.name])),
    empType: new Map(employmentTypes.map(t => [t.id, t.name])),
    branch: new Map(branches.map(b => [b.id, b.name])),
    person: new Map(profiles.map(p => [p.id, p.name ?? p.id])),
  }), [departments, designations, grades, employmentTypes, branches, profiles])

  const visibleChildTabs = CHILD_TABS.filter(t => !t.sensitive || canSensitive)

  if (isLoading) {
    return (
      <div>
        <TopBar title="Employee" />
        <div className="p-6"><div className="h-64 bg-white rounded-xl border border-border animate-pulse" /></div>
      </div>
    )
  }

  if (error || !emp) {
    return (
      <div>
        <TopBar title="Employee" />
        <div className="p-6">
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="error" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Employee not found.</p>
            <button onClick={() => navigate('/hrms/employees')} className="mt-4 text-sm text-brand-600 hover:underline">Back to directory</button>
          </div>
        </div>
      </div>
    )
  }

  const tabs: { id: string; label: string; icon: string }[] = [
    { id: 'profile', label: 'Profile', icon: 'person' },
    { id: 'employment', label: 'Employment', icon: 'work' },
    ...visibleChildTabs.map(t => ({ id: t.id, label: t.label, icon: t.icon })),
    { id: 'lifecycle', label: 'Lifecycle', icon: 'timeline' },
  ]

  return (
    <div>
      <TopBar title={emp.name ?? 'Employee'} subtitle={emp.employee_code ? `Code ${emp.employee_code}` : undefined} />

      <div className="p-6 animate-fade-up">
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => navigate('/hrms/employees')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-950">
            <Sym name="arrow_back" size={16} /> Directory
          </button>
          {canManage && (
            <button onClick={() => setShowEdit(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">
              <Sym name="edit" size={15} /> Edit
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-border mb-5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-brand-950'
              }`}
            >
              <Sym name={t.icon} size={15} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <div className="bg-white rounded-xl border border-border p-5 max-w-2xl">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <Detail label="Full Name" value={emp.name} />
              <Detail label="Work Email" value={emp.email} />
              <Detail label="Phone" value={emp.phone} />
              <Detail label="Date of Birth" value={details?.date_of_birth ? formatDate(details.date_of_birth) : null} />
              <Detail label="Gender" value={details?.gender} />
              <Detail label="Marital Status" value={details?.marital_status} />
              <Detail label="Blood Group" value={details?.blood_group} />
              <Detail label="Nationality" value={details?.nationality} />
              <Detail label="Father's Name" value={details?.father_name} />
              <Detail label="Mother's Name" value={details?.mother_name} />
              <Detail label="Personal Email" value={details?.personal_email} />
              <Detail label="Home Phone" value={details?.home_phone} />
              <Detail label="Emergency Contact" value={details?.emergency_contact} />
              <Detail label="Higher Qualification" value={details?.higher_qualification} />
              <Detail label="Permanent Address" value={details?.permanent_address} span />
              <Detail label="Local Address" value={details?.local_address} span />
            </dl>
          </div>
        )}

        {tab === 'employment' && (
          <div className="bg-white rounded-xl border border-border p-5 max-w-2xl">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <Detail label="Designation" value={(emp.designation_id && lookup.desig.get(emp.designation_id)) || emp.designation} />
              <Detail label="Grade" value={emp.grade_id ? lookup.grade.get(emp.grade_id) : null} />
              <Detail label="Department" value={(emp.department_id && lookup.dept.get(emp.department_id)) || emp.department} />
              <Detail label="Employment Type" value={emp.employment_type_id ? lookup.empType.get(emp.employment_type_id) : null} />
              <Detail label="Branch / Location" value={emp.branch_location_id ? lookup.branch.get(emp.branch_location_id) : null} />
              <Detail label="Reports To" value={emp.reports_to ? lookup.person.get(emp.reports_to) : null} />
              <Detail label="Date of Joining" value={details?.date_of_joining ? formatDate(details.date_of_joining) : null} />
              <Detail label="Probation End" value={details?.probation_end_date ? formatDate(details.probation_end_date) : null} />
              <Detail label="Confirmation Date" value={details?.confirmation_date ? formatDate(details.confirmation_date) : null} />
              <Detail label="Status" value={details?.employee_status} />
            </dl>
          </div>
        )}

        {visibleChildTabs.map(t => tab === t.id && (
          <ChildTableSection
            key={t.id}
            table={t.table}
            employeeId={id}
            title={t.label}
            icon={t.icon}
            fields={t.fields}
            primaryKeys={t.primaryKeys}
            canManage={canManage}
          />
        ))}

        {tab === 'lifecycle' && <LifecycleTimeline employeeId={id} personLookup={lookup.person} />}
      </div>

      {showEdit && <EmployeeForm employee={emp} details={details} onClose={() => setShowEdit(false)} />}
    </div>
  )
}

function LifecycleTimeline({ employeeId, personLookup }: { employeeId: string; personLookup: Map<string, string> }) {
  const { data: events = [], isLoading } = useStatusEvents(employeeId)
  if (isLoading) return <div className="h-40 bg-white rounded-xl border border-border animate-pulse" />
  return (
    <div className="bg-white rounded-xl border border-border p-5 max-w-2xl">
      <p className="text-sm font-semibold text-brand-950 mb-4">Lifecycle history</p>
      {events.length === 0 ? (
        <div className="text-center py-8">
          <Sym name="timeline" size={26} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No status events recorded.</p>
        </div>
      ) : (
        <ol className="space-y-4">
          {events.map(ev => (
            <li key={ev.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-600/10 flex items-center justify-center shrink-0">
                <Sym name="flag" size={15} className="text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-brand-950 capitalize">{ev.event_type ?? 'Event'}</p>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {ev.effective_date ? formatDate(ev.effective_date) : ev.created_at ? formatDateTime(ev.created_at) : ''}
                  </span>
                </div>
                {(ev.from_value || ev.to_value) && (
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {ev.from_value ?? '—'} → {ev.to_value ?? '—'}
                  </p>
                )}
                {ev.notes && <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{ev.notes}</p>}
                {ev.approved_by && <p className="text-[11px] text-muted-foreground/70 mt-0.5">Approved by {personLookup.get(ev.approved_by) ?? ev.approved_by}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function Detail({ label, value, span }: { label: string; value: string | null | undefined; span?: boolean }) {
  return (
    <div className={span ? 'sm:col-span-2' : ''}>
      <dt className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="text-brand-950 mt-0.5 whitespace-pre-wrap">{value || '—'}</dd>
    </div>
  )
}
