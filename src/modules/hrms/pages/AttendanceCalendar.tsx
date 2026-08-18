// HRMS — reusable monthly attendance calendar for one employee.
// The DB doesn't auto-evaluate daily status, so each day's category is DERIVED here:
//   punch → present · approved leave → leave/half · holiday (hr_holidays) → holiday
//   Sunday → weekly off · past working day with no punch → absent (only in months
//   that have some activity, so pre-joining months stay blank).
// Click a day to see its punch in/out and hours. Used on My Attendance + the muster.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sym } from '@/components/shared/Sym'
import { fmtTime, fmtMinutes, istToday } from './attendanceShared'
import { fetchEmployeeAttendanceDays, fetchHrAttendanceDays } from '../api/attendance'
import { fetchMyLeaveRequests } from '../api/leave'
import { useHolidays } from '../hooks/useLeaveConfig'

type Cat = 'present' | 'half' | 'absent' | 'leave' | 'holiday' | 'off' | 'wfh' | 'none'

const CAT: Record<Cat, { label: string; cls: string; sw: string }> = {
  present: { label: 'Present',    cls: 'bg-green-50 text-green-700 border-green-200',    sw: 'bg-green-200' },
  half:    { label: 'Half day',   cls: 'bg-amber-50 text-amber-700 border-amber-200',    sw: 'bg-amber-200' },
  absent:  { label: 'Absent',     cls: 'bg-red-50 text-red-700 border-red-200',          sw: 'bg-red-200' },
  leave:   { label: 'On leave',   cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', sw: 'bg-indigo-200' },
  holiday: { label: 'Holiday',    cls: 'bg-blue-50 text-blue-700 border-blue-200',       sw: 'bg-blue-200' },
  off:     { label: 'Weekly off', cls: 'bg-slate-100 text-slate-500 border-slate-200',   sw: 'bg-slate-300' },
  wfh:     { label: 'WFH / OD',   cls: 'bg-teal-50 text-teal-700 border-teal-200',       sw: 'bg-teal-200' },
  none:    { label: 'No record',  cls: 'bg-white text-muted-foreground border-border',   sw: 'bg-white border border-border' },
}
const LEGEND: Cat[] = ['present', 'half', 'absent', 'leave', 'holiday', 'off']
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad = (n: number) => String(n).padStart(2, '0')
const monShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface DayInfo { cat: Cat; first_in: string | null; last_out: string | null; worked: number | null }

export function AttendanceCalendar({ employeeId }: { employeeId: string }) {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [openDay, setOpenDay] = useState<string | null>(null)

  const from = `${ym.y}-${pad(ym.m + 1)}-01`
  const to = `${ym.y}-${pad(ym.m + 1)}-${pad(new Date(ym.y, ym.m + 1, 0).getDate())}`
  const today = istToday()

  const { data: punch = [], isLoading: lp } = useQuery({
    queryKey: ['hrms', 'cal', 'punch', employeeId, from],
    queryFn: () => fetchEmployeeAttendanceDays(employeeId, from, to), enabled: !!employeeId,
  })
  const { data: hr = [], isLoading: lh } = useQuery({
    queryKey: ['hrms', 'cal', 'hr', employeeId, from],
    queryFn: () => fetchHrAttendanceDays(employeeId, from, to), enabled: !!employeeId,
  })
  const { data: leaves = [], isLoading: ll } = useQuery({
    queryKey: ['hrms', 'cal', 'leave', employeeId],
    queryFn: () => fetchMyLeaveRequests(employeeId), enabled: !!employeeId,
  })
  const { data: holidays = [] } = useHolidays(null)

  const days = useMemo(() => {
    const punchMap = new Map<string, any>()
    for (const p of punch as any[]) if (p.work_date) punchMap.set(p.work_date, p)
    const hrMap = new Map<string, any>()
    for (const h of hr as any[]) hrMap.set(h.work_date, h)
    const holSet = new Set((holidays as any[]).filter(h => h.is_active).map(h => h.holiday_date))

    // Dates covered by an approved leave, with half-day flag.
    const leaveMap = new Map<string, { half: boolean }>()
    for (const lv of (leaves as any[]).filter(l => l.status === 'approved')) {
      const s = new Date(lv.from_date + 'T00:00:00'); const e = new Date(lv.to_date + 'T00:00:00')
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        leaveMap.set(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
          { half: !!lv.is_half_day && lv.from_date === lv.to_date })
      }
    }

    const hasActivity = punchMap.size > 0 || hrMap.size > 0 ||
      [...leaveMap.keys()].some(k => k >= from && k <= to)

    const total = new Date(ym.y, ym.m + 1, 0).getDate()
    const out = new Map<string, DayInfo>()
    for (let dd = 1; dd <= total; dd++) {
      const ds = `${ym.y}-${pad(ym.m + 1)}-${pad(dd)}`
      const dow = new Date(ym.y, ym.m, dd).getDay()
      const p = punchMap.get(ds); const h = hrMap.get(ds)
      const first_in = p?.first_in ?? h?.first_in ?? null
      const last_out = p?.last_out ?? h?.last_out ?? null
      const worked = p?.worked_minutes ?? h?.worked_minutes ?? null

      let cat: Cat = 'none'
      const hs = h?.status as string | undefined
      if (first_in) cat = 'present'
      else if (holSet.has(ds)) cat = 'holiday'
      else if (leaveMap.has(ds)) cat = leaveMap.get(ds)!.half ? 'half' : 'leave'
      else if (hs === 'on_leave') cat = 'leave'
      else if (hs === 'wfh' || hs === 'od') cat = 'wfh'
      else if (hs === 'holiday') cat = 'holiday'
      else if (hs === 'half_day') cat = 'half'
      else if (hs === 'weekly_off' || dow === 0) cat = 'off'
      else if (ds <= today && hasActivity) cat = 'absent'
      out.set(ds, { cat, first_in, last_out, worked })
    }
    return out
  }, [punch, hr, leaves, holidays, ym, from, to, today])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const info of days.values()) c[info.cat] = (c[info.cat] ?? 0) + 1
    return c
  }, [days])

  const shift = (delta: number) => { setOpenDay(null); setYm(s => { const d = new Date(s.y, s.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() } }) }
  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(ym.y, ym.m, 1))
  const firstDow = new Date(ym.y, ym.m, 1).getDay()
  const total = new Date(ym.y, ym.m + 1, 0).getDate()
  const isLoading = lp || lh || ll

  const sel = openDay ? days.get(openDay) : null

  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg border border-border hover:bg-[#F8FAFC]"><Sym name="chevron_left" size={16} /></button>
          <span className="text-sm font-medium text-brand-950 min-w-[130px] text-center">{monthLabel}</span>
          <button onClick={() => shift(1)} className="p-1.5 rounded-lg border border-border hover:bg-[#F8FAFC]"><Sym name="chevron_right" size={16} /></button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 bg-[#F8FAFC] rounded-lg animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WD.map(d => <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: total }).map((_, i) => {
              const dd = i + 1
              const ds = `${ym.y}-${pad(ym.m + 1)}-${pad(dd)}`
              const info = days.get(ds)!
              const c = CAT[info.cat]
              const isToday = ds === today
              return (
                <button key={ds} onClick={() => setOpenDay(openDay === ds ? null : ds)}
                  className={`rounded-lg border min-h-[52px] p-1.5 text-left flex flex-col justify-between transition hover:ring-2 hover:ring-brand-600/20 ${c.cls} ${isToday ? 'ring-2 ring-brand-600' : ''}`}>
                  <span className="text-xs font-semibold">{dd}</span>
                  {info.cat !== 'none' && <span className="text-[9px] leading-tight truncate">{c.label}</span>}
                </button>
              )
            })}
          </div>

          {/* Day detail */}
          {sel && openDay && (
            <div className="mt-3 rounded-lg border border-border bg-[#F8FAFC] p-3 flex items-center gap-4 text-sm">
              <div className="text-center shrink-0">
                <div className="text-lg font-bold text-brand-950 leading-none">{Number(openDay.slice(8))}</div>
                <div className="text-[10px] uppercase text-muted-foreground">{monShort[ym.m]}</div>
              </div>
              <div className="flex-1 min-w-0">
                <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded border ${CAT[sel.cat].cls}`}>{CAT[sel.cat].label}</span>
                <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5">
                  <span>In: <span className="text-brand-950 font-medium">{fmtTime(sel.first_in)}</span></span>
                  <span>Out: <span className="text-brand-950 font-medium">{fmtTime(sel.last_out)}</span></span>
                  <span>Worked: <span className="text-brand-950 font-medium">{fmtMinutes(sel.worked)}</span></span>
                </div>
              </div>
              <button onClick={() => setOpenDay(null)} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={15} /></button>
            </div>
          )}

          {/* Legend + counts */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-border">
            {LEGEND.map(k => (
              <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={`w-3 h-3 rounded ${CAT[k].sw}`} />{CAT[k].label}
                <span className="text-brand-950 font-medium">{counts[k] ?? 0}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
