import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import {
  useEmployee, useEmployeeDetails, useUpsertEmployeeDetails, useUpdateEmployeeProfile,
} from '@/hooks/useEmployees'

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: emp, isLoading } = useEmployee(id!)
  const { data: details } = useEmployeeDetails(id!)
  const upsertDetails = useUpsertEmployeeDetails()
  const updateProfile = useUpdateEmployeeProfile()

  const canManage = ['super_admin','director','hr'].includes(profile?.role ?? '')  // HR/admin
  const isSelf    = profile?.id === id
  const canEditDetails = canManage || isSelf

  // Operational (profile) fields — admin only
  const [ops, setOps] = useState({ employee_code: '', designation: '', department: '', hod_email: '', is_field_staff: false })
  // Personal (employee_details) fields
  const [det, setDet] = useState<Record<string, string>>({})

  useEffect(() => {
    if (emp) setOps({
      employee_code: emp.employee_code ?? '', designation: emp.designation ?? '',
      department: emp.department ?? '', hod_email: emp.hod_email ?? '', is_field_staff: !!emp.is_field_staff,
    })
  }, [emp])
  useEffect(() => {
    setDet({
      father_name: details?.father_name ?? '', mother_name: details?.mother_name ?? '',
      date_of_birth: details?.date_of_birth ?? '', date_of_joining: details?.date_of_joining ?? '',
      higher_qualification: details?.higher_qualification ?? '', aadhar_no: details?.aadhar_no ?? '',
      pan_no: details?.pan_no ?? '', personal_email: details?.personal_email ?? '',
      home_phone: details?.home_phone ?? '', permanent_address: details?.permanent_address ?? '',
      local_address: details?.local_address ?? '', emergency_contact: details?.emergency_contact ?? '',
    })
  }, [details])

  if (isLoading) return <div><TopBar title="Employee" /><div className="p-6"><div className="h-40 glass-panel rounded-xl animate-pulse" /></div></div>
  if (!emp) return null

  const saveOps = async () => {
    try {
      await updateProfile.mutateAsync({ id: id!, ...ops,
        employee_code: ops.employee_code || null, designation: ops.designation || null,
        department: ops.department || null, hod_email: ops.hod_email || null })
      toast.success('Employee details updated')
    } catch (e: any) { toast.error('Failed', e.message) }
  }
  const saveDetails = async () => {
    try {
      await upsertDetails.mutateAsync({ user_id: id!, ...Object.fromEntries(
        Object.entries(det).map(([k, v]) => [k, v || null])) } as any)
      toast.success('Personal details saved')
    } catch (e: any) { toast.error('Failed', e.message) }
  }

  return (
    <div>
      <TopBar title={emp.name ?? 'Employee'} subtitle={emp.designation ?? emp.role?.replace('_',' ')} />
      <div className="p-6 animate-fade-up space-y-5">
        <button onClick={() => navigate('/employees')} className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
          <Sym name="arrow_back" size={14} /> Back to Employees
        </button>

        {/* Header card */}
        <div className="bg-white rounded-xl border border-border p-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-brand-100 flex items-center justify-center shrink-0">
            {(emp as any).avatar_url
              ? <img src={(emp as any).avatar_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-brand-700 font-display font-bold text-lg">{emp.name?.slice(0,2).toUpperCase()}</span>}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-display font-bold text-brand-950">{emp.name}</h2>
            <p className="text-sm text-muted-foreground">{emp.email} · {emp.phone ?? 'no phone'}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm text-brand-700">{emp.employee_code ?? '—'}</p>
            <p className="text-xs text-muted-foreground capitalize">{emp.role?.replace('_',' ')}</p>
          </div>
        </div>

        {/* Operational details (admin) */}
        <Section title="Employment" icon="work">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <F label="Emp ID"><input className={ic(!canManage)} disabled={!canManage} value={ops.employee_code} onChange={e=>setOps({...ops, employee_code:e.target.value})} /></F>
            <F label="Designation"><input className={ic(!canManage)} disabled={!canManage} value={ops.designation} onChange={e=>setOps({...ops, designation:e.target.value})} /></F>
            <F label="Department"><input className={ic(!canManage)} disabled={!canManage} value={ops.department} onChange={e=>setOps({...ops, department:e.target.value})} /></F>
            <F label="HOD Mail ID"><input className={ic(!canManage)} disabled={!canManage} value={ops.hod_email} onChange={e=>setOps({...ops, hod_email:e.target.value})} /></F>
            <F label="Field Staff (geofence exempt)">
              <button type="button" disabled={!canManage}
                onClick={()=>setOps({...ops, is_field_staff:!ops.is_field_staff})}
                className={`px-3 py-2 rounded-lg text-sm font-medium border ${ops.is_field_staff ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-[#F8FAFC] border-border text-muted-foreground'} ${!canManage && 'opacity-60 cursor-not-allowed'}`}>
                {ops.is_field_staff ? 'Field staff' : 'Office only'}
              </button>
            </F>
          </div>
          {canManage && (
            <div className="mt-4 flex justify-end">
              <button onClick={saveOps} disabled={updateProfile.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Save Employment</button>
            </div>
          )}
        </Section>

        {/* Personal details (self or HR/admin) */}
        <Section title="Personal Details" icon="badge">
          {!canEditDetails ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2"><Sym name="lock" size={14}/> Restricted — visible to the employee and HR/admin only.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <F label="Father's Name"><input className={ic(false)} value={det.father_name} onChange={e=>setDet({...det, father_name:e.target.value})} /></F>
                <F label="Mother's Name"><input className={ic(false)} value={det.mother_name} onChange={e=>setDet({...det, mother_name:e.target.value})} /></F>
                <F label="Date of Birth"><input type="date" className={ic(false)} value={det.date_of_birth} onChange={e=>setDet({...det, date_of_birth:e.target.value})} /></F>
                <F label="Date of Joining"><input type="date" className={ic(false)} value={det.date_of_joining} onChange={e=>setDet({...det, date_of_joining:e.target.value})} /></F>
                <F label="Higher Qualification"><input className={ic(false)} value={det.higher_qualification} onChange={e=>setDet({...det, higher_qualification:e.target.value})} /></F>
                <F label="Personal Email"><input className={ic(false)} value={det.personal_email} onChange={e=>setDet({...det, personal_email:e.target.value})} /></F>
                <F label="Aadhaar No"><input className={ic(false)} value={det.aadhar_no} onChange={e=>setDet({...det, aadhar_no:e.target.value})} placeholder="XXXX XXXX XXXX" /></F>
                <F label="PAN No"><input className={ic(false)} value={det.pan_no} onChange={e=>setDet({...det, pan_no:e.target.value.toUpperCase()})} /></F>
                <F label="Home No"><input className={ic(false)} value={det.home_phone} onChange={e=>setDet({...det, home_phone:e.target.value})} /></F>
                <F label="Emergency Contact"><input className={ic(false)} value={det.emergency_contact} onChange={e=>setDet({...det, emergency_contact:e.target.value})} /></F>
                <F label="Permanent Address" wide><textarea rows={2} className={ic(false)} value={det.permanent_address} onChange={e=>setDet({...det, permanent_address:e.target.value})} /></F>
                <F label="Local Address" wide><textarea rows={2} className={ic(false)} value={det.local_address} onChange={e=>setDet({...det, local_address:e.target.value})} /></F>
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={saveDetails} disabled={upsertDetails.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Save Personal Details</button>
              </div>
            </>
          )}
        </Section>

        {/* Attendance — Phase 2 */}
        <Section title="Attendance" icon="schedule">
          <p className="text-sm text-muted-foreground">Attendance history will appear here once the attendance module is live.</p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <h3 className="font-display font-semibold text-brand-950 mb-4 flex items-center gap-2">
        <Sym name={icon} size={16} className="text-brand-600" /> {title}
      </h3>
      {children}
    </div>
  )
}

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 md:col-span-3' : ''}>
      <label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>
      {children}
    </div>
  )
}

const ic = (disabled: boolean) =>
  `w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 ${disabled ? 'bg-[#F8FAFC] text-muted-foreground' : ''}`
