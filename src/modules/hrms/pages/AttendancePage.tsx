// HRMS — Attendance muster (/hrms/attendance), gate hrms.attendance.view.
// Month muster across employees: profiles × attendance_days (VIEW) × hr_attendance_days.
// Filters by department + status. Managers see their team, HR/director see all — RLS
// enforces the actual row scope. HR can open a day to correct it (writes
// hr_attendance_corrections + updates hr_attendance_days) — gated hrms.attendance.manage.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import { useAuth } from '@/contexts/AuthContext'
import { useEmployees } from '../hooks/useEmployees'
import { useDepartments } from '../hooks/useMasters'
import { useAttendanceDaysRange, useHrDaysRange, useCorrectAttendanceDay } from '../hooks/useAttendance'
import { AttendanceStatusPill, fmtMinutes, fmtTime, monthRange } from './attendanceShared'
import type { AttendanceDay, AttendanceStatus, HrAttendanceDay } from '../api/attendance'

interface Cell {
  employee_id: string
  work_date: string
  first_in: string | null
  last_out: string | null
  worked_minutes: number | null
  status: AttendanceStatus | null
  hr: HrAttendanceDay | null
}

const STATUS_OPTIONS: AttendanceStatus[] = ['present', 'absent', 'half_day', 'on_leave', 'holiday', 'weekly_off', 'od', 'wfh', 'pending']

export default function AttendancePage() {
  const { user } = useAuth()
  const canManage = useCan('hrms.attendance.manage')
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const { from, to } = monthRange(ym.y, ym.m)

  const { data: employees = [], isLoading: le } = useEmployees()
  const { data: departments = [] } = useDepartments()
  const { data: punchDays = [], isLoading: lp } = useAttendanceDaysRange(from, to)
  const { data: hrDays = [], isLoading: lh } = useHrDaysRange(from, to)

  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [editCell, setEditCell] = useState<{ employeeId: string; workDate: string; hr: HrAttendanceDay | null } | null>(null)

  const deptName = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of departments) m.set(d.id, d.name)
    return m
  }, [departments])

  const punchMap = useMemo(() => {
    const m = new Map<string, AttendanceDay>()
    for (const p of punchDays) if (p.user_id && p.work_date) m.set(`${p.user_id}|${p.work_date}`, p)
    return m
  }, [punchDays])
  const hrMap = useMemo(() => {
    const m = new Map<string, HrAttendanceDay>()
    for (const h of hrDays) m.set(`${h.employee_id}|${h.work_date}`, h)
    return m
  }, [hrDays])

  // Dates present in either source, most recent first.
  const dates = useMemo(() => {
    const set = new Set<string>()
    for (const p of punchDays) if (p.work_date) set.add(p.work_date)
    for (const h of hrDays) set.add(h.work_date)
    return [...set].sort((a, b) => (a < b ? 1 : -1))
  }, [punchDays, hrDays])

  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase()
    return employees.filter(e => {
      if (deptFilter && e.department_id !== deptFilter) return false
      if (!q) return true
      return (e.name ?? '').toLowerCase().includes(q) || (e.employee_code ?? '').toLowerCase().includes(q)
    })
  }, [employees, deptFilter, search])

  // Flatten into muster rows (employee × date), applying status filter.
  const rows = useMemo<{ emp: (typeof employees)[number]; cell: Cell }[]>(() => {
    const out: { emp: (typeof employees)[number]; cell: Cell }[] = []
    for (const emp of filteredEmployees) {
      for (const d of dates) {
        const p = punchMap.get(`${emp.id}|${d}`) ?? null
        const h = hrMap.get(`${emp.id}|${d}`) ?? null
        if (!p && !h) continue
        const status = h?.status ?? null
        if (statusFilter && status !== statusFilter) continue
        out.push({
          emp,
          cell: {
            employee_id: emp.id, work_date: d,
            first_in: h?.first_in ?? p?.first_in ?? null,
            last_out: h?.last_out ?? p?.last_out ?? null,
            worked_minutes: h?.worked_minutes ?? p?.worked_minutes ?? null,
            status, hr: h,
          },
        })
      }
    }
    return out
  }, [filteredEmployees, dates, punchMap, hrMap, statusFilter])

  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(ym.y, ym.m, 1))
  const shiftMonth = (delta: number) => setYm(s => {
    const d = new Date(s.y, s.m + delta, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const isLoading = le || lp || lh

  return (
    <div>
      <TopBar title="Attendance" subtitle="Team & organisation muster" />

      <div className="p-6 animate-fade-up space-y-5">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg border border-border hover:bg-[#F8FAFC]"><Sym name="chevron_left" size={16} /></button>
            <span className="text-sm font-medium text-brand-950 min-w-[130px] text-center">{monthLabel}</span>
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg border border-border hover:bg-[#F8FAFC]"><Sym name="chevron_right" size={16} /></button>
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Sym name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, code…" className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
          </div>

          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20">
            <option value="">All departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20">
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-12 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="fact_check" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No attendance records for this filter.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">In</th>
                  <th className="px-4 py-3 font-medium">Out</th>
                  <th className="px-4 py-3 font-medium">Worked</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ emp, cell }) => (
                  <tr key={`${emp.id}|${cell.work_date}`} className="border-b border-border last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{cell.work_date}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-brand-950">{emp.name || '—'}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{emp.employee_code || ''}</div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{(emp.department_id && deptName.get(emp.department_id)) || '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtTime(cell.first_in)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtTime(cell.last_out)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtMinutes(cell.worked_minutes)}</td>
                    <td className="px-4 py-2.5"><AttendanceStatusPill status={cell.status} /></td>
                    {canManage && (
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => setEditCell({ employeeId: emp.id, workDate: cell.work_date, hr: cell.hr })} title="Correct" className="p-1.5 rounded-lg text-muted-foreground hover:bg-white hover:text-brand-950">
                          <Sym name="edit" size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editCell && canManage && user?.id && (
        <CorrectionModal
          employeeId={editCell.employeeId}
          workDate={editCell.workDate}
          hr={editCell.hr}
          correctedBy={user.id}
          onClose={() => setEditCell(null)}
        />
      )}
    </div>
  )
}

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

function CorrectionModal({ employeeId, workDate, hr, correctedBy, onClose }: {
  employeeId: string; workDate: string; hr: HrAttendanceDay | null; correctedBy: string; onClose: () => void
}) {
  const correct = useCorrectAttendanceDay()
  const [status, setStatus] = useState<AttendanceStatus>((hr?.status as AttendanceStatus) ?? 'present')
  const [remarks, setRemarks] = useState(hr?.remarks ?? '')
  const [reason, setReason] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await correct.mutateAsync({
        employeeId, workDate,
        field: 'status',
        oldValue: hr?.status ?? null,
        newValue: status,
        reason: reason.trim() || null,
        patch: { status, remarks: remarks.trim() || null, evaluated_at: new Date().toISOString() },
        correctedBy,
      })
      onClose()
    } catch { /* toast surfaced by the hook */ }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-display font-semibold text-brand-950">Correct Attendance</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{workDate}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Status</label>
            <select className={ic} value={status} onChange={e => setStatus(e.target.value as AttendanceStatus)}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Remarks</label>
            <input className={ic} value={remarks} onChange={e => setRemarks(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Reason for correction</label>
            <textarea className={ic} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Audit trail note" />
          </div>
        </form>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={submit} disabled={correct.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {correct.isPending ? 'Saving…' : 'Save Correction'}
          </button>
        </div>
      </div>
    </div>
  )
}
