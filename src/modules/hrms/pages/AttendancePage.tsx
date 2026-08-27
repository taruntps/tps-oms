// HRMS — Attendance muster (/hrms/attendance), gate hrms.attendance.view.
// Month muster across employees: profiles × attendance_days (VIEW) × hr_attendance_days.
// Filters by department + status. Managers see their team, HR/director see all — RLS
// enforces the actual row scope. HR can open a day to correct it (writes
// hr_attendance_corrections + updates hr_attendance_days) — gated hrms.attendance.manage.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import { useAuth } from '@/contexts/AuthContext'
import { useEmployees } from '../hooks/useEmployees'
import { useDepartments } from '../hooks/useMasters'
import {
  useAttendanceDaysRange, useHrDaysRange, useCorrectAttendanceDay,
  useCorrectedDayKeys, useEmployeeDayPunches, useAdminPunchEdit,
} from '../hooks/useAttendance'
import { useActiveLeaveTypes, useAdminAdjustLeave } from '../hooks/useLeave'
import { AttendanceStatusPill, fmtMinutes, fmtTime, monthRange, istToday } from './attendanceShared'
import { AttendanceCalendar } from './AttendanceCalendar'
import { istTimestamp, fetchAttendanceEvaluationBulk, type AttendanceDay, type AttendanceStatus, type HrAttendanceDay, type RawPunch } from '../api/attendance'

interface Cell {
  employee_id: string
  work_date: string
  first_in: string | null
  last_out: string | null
  worked_minutes: number | null
  status: string | null
  covered: string | null
  hr: HrAttendanceDay | null
}

/** covered → a short human remark, e.g. "CL", "OD", or null for plain days. */
const coveredTag = (c: string | null): string | null =>
  !c || c === 'manual' || c === 'override' ? null : c

const STATUS_OPTIONS: string[] = ['present', 'missing_punch', 'absent', 'half_day', 'on_leave', 'holiday', 'weekly_off', 'od', 'wfh', 'pending']

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
  const { data: correctedKeys = [] } = useCorrectedDayKeys(from, to)
  const editedSet = useMemo(() => new Set(correctedKeys), [correctedKeys])

  // Evaluated status per employee/day (present / half_day / missing_punch / on_leave …)
  // so the muster STATUS column matches the Calendar, not just manual overrides.
  const { data: evalRows = [] } = useQuery({
    queryKey: ['hrms', 'muster-eval', from, to],
    queryFn: () => fetchAttendanceEvaluationBulk(from, to),
  })
  const evalMap = useMemo(() => {
    const m = new Map<string, { status: string; covered: string | null }>()
    for (const e of evalRows) m.set(`${e.employee_id}|${e.work_date}`, { status: e.status, covered: e.covered })
    return m
  }, [evalRows])

  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  // Day-wise view: a single date (defaults to today). Empty = whole-month muster.
  const [dateFilter, setDateFilter] = useState<string>(istToday())
  const [editCell, setEditCell] = useState<{ employeeId: string; workDate: string; hr: HrAttendanceDay | null } | null>(null)
  const [view, setView] = useState<'muster' | 'calendar'>('muster')
  const [calEmp, setCalEmp] = useState('')

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
    // Day-wise: when a date is picked, restrict to it; otherwise the whole month.
    const iterDates = dateFilter ? [dateFilter] : dates
    for (const emp of filteredEmployees) {
      for (const d of iterDates) {
        const p = punchMap.get(`${emp.id}|${d}`) ?? null
        const h = hrMap.get(`${emp.id}|${d}`) ?? null
        // Single-date view: list EVERY employee (even with no punch/record) so any
        // day can be marked/corrected via the row's ✏️. Whole-month view keeps only
        // recorded days (otherwise it's a huge employee × every-day matrix).
        if (!p && !h && !dateFilter) continue
        // Manual override wins; otherwise show the evaluated status (matches the Calendar).
        const ev = evalMap.get(`${emp.id}|${d}`)
        const status = (h?.status as string | null) ?? ev?.status ?? null
        if (statusFilter && status !== statusFilter) continue
        out.push({
          emp,
          cell: {
            employee_id: emp.id, work_date: d,
            first_in: h?.first_in ?? p?.first_in ?? null,
            last_out: h?.last_out ?? p?.last_out ?? null,
            worked_minutes: h?.worked_minutes ?? p?.worked_minutes ?? null,
            status, covered: h?.status ? null : ev?.covered ?? null, hr: h,
          },
        })
      }
    }
    // Date-first (newest day on top), then employee name — reads as a daily muster.
    out.sort((a, b) =>
      a.cell.work_date === b.cell.work_date
        ? (a.emp.name ?? '').localeCompare(b.emp.name ?? '')
        : (a.cell.work_date < b.cell.work_date ? 1 : -1))
    return out
  }, [filteredEmployees, dates, punchMap, hrMap, evalMap, statusFilter, dateFilter])

  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(ym.y, ym.m, 1))
  const shiftMonth = (delta: number) => {
    setYm(s => {
      const d = new Date(s.y, s.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
    setDateFilter('')  // leaving the current month → show the whole month
  }

  // Jump to today's month + pin the date to today.
  const goToday = () => {
    const t = new Date()
    setYm({ y: t.getFullYear(), m: t.getMonth() })
    setDateFilter(istToday())
  }

  const isLoading = le || lp || lh
  const calEmpId = calEmp || employees[0]?.id || ''

  return (
    <div>
      <TopBar title="Attendance" subtitle="Team & organisation muster" />

      <div className="p-6 animate-fade-up space-y-5">
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-[#F1F5F9] rounded-lg p-1 w-fit">
          {(['muster', 'calendar'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3.5 py-1.5 text-sm rounded-md font-medium capitalize ${view === v ? 'bg-white text-brand-950 shadow-sm' : 'text-muted-foreground'}`}>{v}</button>
          ))}
        </div>

        {view === 'calendar' ? (
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Employee</span>
              <select value={calEmpId} onChange={e => setCalEmp(e.target.value)}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 min-w-[220px]">
                {employees.map(e => <option key={e.id} value={e.id}>{e.name || e.employee_code || 'Employee'}</option>)}
              </select>
            </div>
            {calEmpId && <AttendanceCalendar employeeId={calEmpId} />}
          </div>
        ) : (<>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg border border-border hover:bg-[#F8FAFC]"><Sym name="chevron_left" size={16} /></button>
            <span className="text-sm font-medium text-brand-950 min-w-[130px] text-center">{monthLabel}</span>
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg border border-border hover:bg-[#F8FAFC]"><Sym name="chevron_right" size={16} /></button>
          </div>

          {/* Day-wise: pick a date (within the shown month), or clear for the whole month. */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFilter}
              min={from}
              max={to}
              onChange={e => setDateFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
            <button onClick={goToday} className="px-3 py-2 text-sm border border-border rounded-lg bg-white hover:bg-[#F8FAFC] font-medium">Today</button>
            {dateFilter && (
              <button onClick={() => setDateFilter('')} className="px-3 py-2 text-sm border border-border rounded-lg bg-white hover:bg-[#F8FAFC] text-muted-foreground flex items-center gap-1">
                <Sym name="close" size={14} /> Month
              </button>
            )}
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

        {dateFilter && canManage && (
          <p className="text-xs text-muted-foreground -mt-1">
            Showing every employee for {dateFilter}. Use the ✏️ on any row to add a punch or force a status
            (e.g. mark <span className="font-medium text-brand-950">Present</span>) — even on days with no punch.
          </p>
        )}

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
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <AttendanceStatusPill status={cell.status} />
                        {coveredTag(cell.covered) && (
                          <span title="Leave / duty applied to this day" className="text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1 py-0.5">
                            {(() => { const c = coveredTag(cell.covered)!; const duty = c === 'OD' || c === 'WFH'
                              return !duty && cell.status === 'present' ? `½ ${c}` : c })()}
                          </span>
                        )}
                        {editedSet.has(`${emp.id}|${cell.work_date}`) && (
                          <span title="Timing corrected by admin" className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">
                            <Sym name="edit" size={10} /> edited
                          </span>
                        )}
                      </div>
                    </td>
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
        </>)}
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

// Format an ISO timestamp as IST "HH:MM" for a <input type="time">.
function toHHMM(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(iso))
}

function CorrectionModal({ employeeId, workDate, hr, correctedBy, onClose }: {
  employeeId: string; workDate: string; hr: HrAttendanceDay | null; correctedBy: string; onClose: () => void
}) {
  const correct = useCorrectAttendanceDay()
  const { data: punches = [], isLoading: lpunch } = useEmployeeDayPunches(employeeId, workDate)
  const punchEdit = useAdminPunchEdit()
  const { data: leaveTypes = [] } = useActiveLeaveTypes()
  const adjustLeave = useAdminAdjustLeave()
  const [lvType, setLvType] = useState('')
  const [lvHalf, setLvHalf] = useState(true)
  const [lvSession, setLvSession] = useState<'first' | 'second'>('first')
  const applyLeave = () => {
    if (!lvType) return
    adjustLeave.mutate(
      { input: { employeeId, date: workDate, leaveTypeId: lvType, halfDay: lvHalf, halfSession: lvHalf ? lvSession : null, reason: reason.trim() || null }, approverId: correctedBy },
      { onSuccess: onClose },
    )
  }
  // '' = keep the computed status (no manual override). Any real status = force it.
  const initialStatus = (hr?.status as AttendanceStatus | undefined) ?? ''
  const [status, setStatus] = useState<AttendanceStatus | ''>(initialStatus)
  const [remarks, setRemarks] = useState(hr?.remarks ?? '')
  const [reason, setReason] = useState('')
  const [addTime, setAddTime] = useState('')
  const [times, setTimes] = useState<Record<string, string>>({}) // punchId → edited HH:MM
  const [saving, setSaving] = useState(false)

  const reasonOrNull = () => reason.trim() || null
  const curTime = (p: RawPunch) => times[p.id] ?? toHHMM(p.punch_at)
  const dirtyPunches = punches.filter(p => curTime(p) !== toHHMM(p.punch_at))
  const statusChanged = status !== initialStatus
  const hasChanges = dirtyPunches.length > 0 || !!addTime || statusChanged

  // Delete stays immediate (explicit, destructive).
  const deletePunch = (id: string) => punchEdit.remove.mutate({ punchId: id, reason: reasonOrNull() })

  // ONE Save persists everything: edited punch times + a new punch + the status
  // override (only when a concrete status is chosen). Punch-only edits let
  // evaluate_attendance recompute the status.
  const saveAll = async () => {
    if (!hasChanges || saving) return
    setSaving(true)
    try {
      for (const p of dirtyPunches) {
        await punchEdit.edit.mutateAsync({ punchId: p.id, newTimeISO: istTimestamp(workDate, curTime(p)), reason: reasonOrNull() })
      }
      if (addTime) {
        await punchEdit.add.mutateAsync({ employeeId, atISO: istTimestamp(workDate, addTime), reason: reasonOrNull() })
      }
      if (statusChanged) {
        await correct.mutateAsync({
          employeeId, workDate, field: 'status',
          oldValue: hr?.status ?? null,
          newValue: status || null,
          reason: reasonOrNull(),
          patch: { status: status || null, remarks: remarks.trim() || null, evaluated_at: new Date().toISOString() },
          correctedBy,
        })
      }
      onClose()
    } catch { /* per-hook toasts surface errors; keep the modal open */ }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-display font-semibold text-brand-950">Correct Attendance</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{workDate}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ── Punch times: correcting these recomputes status/late/half + payroll ── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-brand-950">Punch times (IST)</label>
              <span className="text-[10px] text-muted-foreground">In = earliest · Out = latest</span>
            </div>

            {lpunch ? (
              <div className="h-9 bg-[#F8FAFC] rounded animate-pulse" />
            ) : punches.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No punches recorded for this day.</p>
            ) : (
              <div className="space-y-2">
                {punches.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <input type="time" className={ic} value={curTime(p)}
                      onChange={e => setTimes(t => ({ ...t, [p.id]: e.target.value }))} />
                    <button type="button" title="Delete punch" disabled={saving || punchEdit.remove.isPending}
                      onClick={() => deletePunch(p.id)}
                      className="shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                      <Sym name="delete" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add a missing punch — saved by "Save changes" below (not a separate action). */}
            <div className="flex items-center gap-2 mt-2">
              <input type="time" className={ic} value={addTime} onChange={e => setAddTime(e.target.value)} />
              {addTime && (
                <button type="button" title="Clear" onClick={() => setAddTime('')}
                  className="shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-[#F8FAFC]">
                  <Sym name="close" size={15} />
                </button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Edit a time, delete, or add one — all applied by “Save changes”.</p>
          </div>

          {/* ── Force status (optional override) ── */}
          <div className="space-y-4 border-t border-border pt-4">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Force status <span className="font-normal text-muted-foreground">(overrides the computed value)</span></label>
              <select className={ic} value={status} onChange={e => setStatus(e.target.value as AttendanceStatus | '')}>
                <option value="">Keep computed (no override)</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Remarks</label>
              <input className={ic} value={remarks} onChange={e => setRemarks(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Reason for correction</label>
              <textarea className={ic} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Audit trail note (applies to punch edits too)" />
            </div>
          </div>

          {/* ── Adjust leave (books an approved leave + debits balance) ── */}
          <div className="space-y-3 border-t border-border pt-4">
            <div>
              <label className="block text-xs font-medium text-brand-950">Adjust leave <span className="font-normal text-muted-foreground">(books an approved leave for this day and debits the balance)</span></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select className={ic} value={lvType} onChange={e => setLvType(e.target.value)}>
                <option value="">Select leave type…</option>
                {leaveTypes.map((lt: any) => <option key={lt.id} value={lt.id}>{lt.code} — {lt.name}</option>)}
              </select>
              <select className={ic} value={lvHalf ? 'half' : 'full'} onChange={e => setLvHalf(e.target.value === 'half')}>
                <option value="full">Full day</option>
                <option value="half">Half day</option>
              </select>
            </div>
            {lvHalf && (
              <select className={ic} value={lvSession} onChange={e => setLvSession(e.target.value as 'first' | 'second')}>
                <option value="first">First half (morning)</option>
                <option value="second">Second half (afternoon)</option>
              </select>
            )}
            <p className="text-[10px] text-muted-foreground">A half-day leave plus a worked half counts as a full paid day.</p>
            <button onClick={applyLeave} disabled={!lvType || adjustLeave.isPending}
              className="w-full px-4 py-2 text-sm font-medium border border-brand-300 text-brand-700 rounded-lg hover:bg-brand-50 disabled:opacity-50">
              {adjustLeave.isPending ? 'Applying…' : 'Apply leave'}
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-between gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Close</button>
          <button onClick={saveAll} disabled={!hasChanges || saving}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
