// HRMS — Attendance Reports (/hrms/attendance/reports), gate hrms.attendance.view.
// Monthly muster summary per employee: counts of present / absent / half-day / late / OT / OD,
// plus total worked hours — derived from hr_attendance_days over the selected month.
// Export isn't required; the on-screen table suffices.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useEmployees } from '../hooks/useEmployees'
import { useDepartments } from '../hooks/useMasters'
import { useHrDaysRange } from '../hooks/useAttendance'
import { fmtMinutes, monthRange } from './attendanceShared'
import type { HrAttendanceDay } from '../api/attendance'

interface Summary {
  present: number
  absent: number
  half_day: number
  on_leave: number
  od: number
  wfh: number
  late: number
  ot_minutes: number
  worked_minutes: number
}

const EMPTY: Summary = { present: 0, absent: 0, half_day: 0, on_leave: 0, od: 0, wfh: 0, late: 0, ot_minutes: 0, worked_minutes: 0 }

export default function AttendanceReportsPage() {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const { from, to } = monthRange(ym.y, ym.m)

  const { data: employees = [], isLoading: le } = useEmployees()
  const { data: departments = [] } = useDepartments()
  const { data: hrDays = [], isLoading: lh } = useHrDaysRange(from, to)
  const [deptFilter, setDeptFilter] = useState('')

  const deptName = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of departments) m.set(d.id, d.name)
    return m
  }, [departments])

  const byEmp = useMemo(() => {
    const m = new Map<string, Summary>()
    const add = (id: string): Summary => {
      let s = m.get(id)
      if (!s) { s = { ...EMPTY }; m.set(id, s) }
      return s
    }
    for (const d of hrDays as HrAttendanceDay[]) {
      const s = add(d.employee_id)
      switch (d.status) {
        case 'present': s.present++; break
        case 'absent': s.absent++; break
        case 'half_day': s.half_day++; break
        case 'on_leave': s.on_leave++; break
        case 'od': s.od++; break
        case 'wfh': s.wfh++; break
      }
      if (d.late_minutes > 0) s.late++
      s.ot_minutes += d.ot_minutes ?? 0
      s.worked_minutes += d.worked_minutes ?? 0
    }
    return m
  }, [hrDays])

  const rows = useMemo(() => {
    return employees
      .filter(e => !deptFilter || e.department_id === deptFilter)
      .map(e => ({ emp: e, sum: byEmp.get(e.id) ?? EMPTY }))
      .filter(r => r.sum !== EMPTY || byEmp.has(r.emp.id))
  }, [employees, byEmp, deptFilter])

  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(ym.y, ym.m, 1))
  const shiftMonth = (delta: number) => setYm(s => {
    const d = new Date(s.y, s.m + delta, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const isLoading = le || lh

  return (
    <div>
      <TopBar title="Attendance Reports" subtitle="Monthly muster summary per employee" />

      <div className="p-6 animate-fade-up space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg border border-border hover:bg-[#F8FAFC]"><Sym name="chevron_left" size={16} /></button>
            <span className="text-sm font-medium text-brand-950 min-w-[130px] text-center">{monthLabel}</span>
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg border border-border hover:bg-[#F8FAFC]"><Sym name="chevron_right" size={16} /></button>
          </div>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20">
            <option value="">All departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="summarize" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No attendance data for this month.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Dept</th>
                  <th className="px-3 py-3 font-medium text-center">Present</th>
                  <th className="px-3 py-3 font-medium text-center">Absent</th>
                  <th className="px-3 py-3 font-medium text-center">Half</th>
                  <th className="px-3 py-3 font-medium text-center">Leave</th>
                  <th className="px-3 py-3 font-medium text-center">OD</th>
                  <th className="px-3 py-3 font-medium text-center">WFH</th>
                  <th className="px-3 py-3 font-medium text-center">Late</th>
                  <th className="px-3 py-3 font-medium text-center">OT</th>
                  <th className="px-3 py-3 font-medium text-center">Worked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ emp, sum }) => (
                  <tr key={emp.id} className="border-b border-border last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-brand-950">{emp.name || '—'}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{emp.employee_code || ''}</div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{(emp.department_id && deptName.get(emp.department_id)) || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-green-700 font-medium">{sum.present || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-red-700">{sum.absent || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-amber-700">{sum.half_day || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-indigo-700">{sum.on_leave || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-blue-700">{sum.od || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-green-700">{sum.wfh || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{sum.late || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{sum.ot_minutes ? fmtMinutes(sum.ot_minutes) : '—'}</td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{sum.worked_minutes ? fmtMinutes(sum.worked_minutes) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
