// HRMS — My Attendance (/hrms/attendance/me), gate hrms.attendance.self.
// The signed-in employee's recent attendance: punch-derived days (attendance_days VIEW,
// filtered to their user_id) merged with the HR-evaluated status (hr_attendance_days) for
// the selected month. Buttons raise Regularization / OD-WFH / OT requests (employee_id = self).
// Punching itself (GPS + face) is NOT rebuilt here — a link points at the existing punch page.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import {
  useMyAttendanceDays,
  useMyHrDays,
  useMyRegularizations,
  useMyOutdoorDuty,
  useMyOvertime,
} from '../hooks/useAttendance'
import { RequestModal, type RequestKind } from './RequestModal'
import {
  AttendanceStatusPill,
  RequestStatusPill,
  fmtMinutes,
  fmtTime,
  monthRange,
} from './attendanceShared'
import type { AttendanceDay, HrAttendanceDay } from '../api/attendance'

interface MergedDay {
  work_date: string
  first_in: string | null
  last_out: string | null
  worked_minutes: number | null
  status: HrAttendanceDay['status'] | null
  late_minutes: number
  ot_minutes: number
  is_regularized: boolean
}

function mergeDays(punch: AttendanceDay[], hr: HrAttendanceDay[]): MergedDay[] {
  const hrMap = new Map<string, HrAttendanceDay>()
  for (const h of hr) hrMap.set(h.work_date, h)
  const dates = new Set<string>()
  for (const p of punch) if (p.work_date) dates.add(p.work_date)
  for (const h of hr) dates.add(h.work_date)

  const punchMap = new Map<string, AttendanceDay>()
  for (const p of punch) if (p.work_date) punchMap.set(p.work_date, p)

  return [...dates]
    .sort((a, b) => (a < b ? 1 : -1))
    .map(d => {
      const p = punchMap.get(d)
      const h = hrMap.get(d)
      return {
        work_date: d,
        first_in: h?.first_in ?? p?.first_in ?? null,
        last_out: h?.last_out ?? p?.last_out ?? null,
        worked_minutes: h?.worked_minutes ?? p?.worked_minutes ?? null,
        status: h?.status ?? null,
        late_minutes: h?.late_minutes ?? 0,
        ot_minutes: h?.ot_minutes ?? 0,
        is_regularized: h?.is_regularized ?? false,
      }
    })
}

export default function MyAttendancePage() {
  const { user } = useAuth()
  const uid = user?.id
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const { from, to } = monthRange(ym.y, ym.m)

  const { data: punchDays = [], isLoading: lp } = useMyAttendanceDays(uid)
  const { data: hrDays = [], isLoading: lh } = useMyHrDays(uid, from, to)
  const { data: regs = [] } = useMyRegularizations(uid)
  const { data: ods = [] } = useMyOutdoorDuty(uid)
  const { data: ots = [] } = useMyOvertime(uid)

  const [modal, setModal] = useState<RequestKind | null>(null)

  const merged = useMemo(() => {
    const inMonth = punchDays.filter(d => d.work_date && d.work_date >= from && d.work_date <= to)
    return mergeDays(inMonth, hrDays)
  }, [punchDays, hrDays, from, to])

  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(ym.y, ym.m, 1))
  const shiftMonth = (delta: number) => setYm(s => {
    const d = new Date(s.y, s.m + delta, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const isLoading = lp || lh

  return (
    <div>
      <TopBar title="My Attendance" subtitle="Your punches, status and requests" />

      <div className="p-6 animate-fade-up space-y-6">
        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/attendance" className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
            <Sym name="fingerprint" size={16} /> Punch In / Out
          </Link>
          <div className="ml-auto flex flex-wrap gap-2">
            <button onClick={() => setModal('regularization')} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">
              <Sym name="edit_calendar" size={15} /> Regularize
            </button>
            <button onClick={() => setModal('od')} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">
              <Sym name="travel_explore" size={15} /> OD / WFH
            </button>
            <button onClick={() => setModal('overtime')} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">
              <Sym name="more_time" size={15} /> Overtime
            </button>
          </div>
        </div>

        {/* Month selector */}
        <div className="flex items-center gap-3">
          <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg border border-border hover:bg-[#F8FAFC]"><Sym name="chevron_left" size={16} /></button>
          <span className="text-sm font-medium text-brand-950 min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg border border-border hover:bg-[#F8FAFC]"><Sym name="chevron_right" size={16} /></button>
        </div>

        {/* Days table */}
        {isLoading ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : merged.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="schedule" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No attendance recorded this month.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">In</th>
                  <th className="px-4 py-3 font-medium">Out</th>
                  <th className="px-4 py-3 font-medium">Worked</th>
                  <th className="px-4 py-3 font-medium">Late</th>
                  <th className="px-4 py-3 font-medium">OT</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {merged.map(d => (
                  <tr key={d.work_date} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-brand-950">{formatDate(d.work_date)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtTime(d.first_in)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtTime(d.last_out)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtMinutes(d.worked_minutes)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{d.late_minutes ? `${d.late_minutes}m` : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{d.ot_minutes ? `${d.ot_minutes}m` : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <AttendanceStatusPill status={d.status} />
                        {d.is_regularized && <Sym name="verified" size={14} className="text-brand-600" title="Regularized" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* My requests */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <RequestList title="Regularizations" icon="edit_calendar" rows={regs.map(r => ({ id: r.id, when: formatDate(r.work_date), detail: r.kind.replace('_', ' '), status: r.status }))} />
          <RequestList title="OD / WFH" icon="travel_explore" rows={ods.map(o => ({ id: o.id, when: o.from_date === o.to_date ? formatDate(o.from_date) : `${formatDate(o.from_date)} – ${formatDate(o.to_date)}`, detail: o.mode.toUpperCase(), status: o.status }))} />
          <RequestList title="Overtime" icon="more_time" rows={ots.map(t => ({ id: t.id, when: formatDate(t.work_date), detail: `${t.minutes}m`, status: t.status }))} />
        </div>
      </div>

      {modal && uid && <RequestModal kind={modal} employeeId={uid} onClose={() => setModal(null)} />}
    </div>
  )
}

function RequestList({ title, icon, rows }: {
  title: string; icon: string
  rows: { id: string; when: string; detail: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled' }[]
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sym name={icon} size={16} className="text-brand-600" />
        <h3 className="text-sm font-semibold text-brand-950">{title}</h3>
        <span className="text-[10px] text-muted-foreground bg-[#F8FAFC] border border-border rounded-full px-1.5 py-0.5">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">None yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(r => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-xs border border-border rounded-lg px-2.5 py-1.5">
              <span className="text-brand-950 font-medium truncate">{r.when}</span>
              <span className="text-muted-foreground capitalize truncate">{r.detail}</span>
              <RequestStatusPill status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
