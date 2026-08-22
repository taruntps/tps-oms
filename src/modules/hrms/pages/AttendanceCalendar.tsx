// HRMS — reusable monthly attendance calendar for one employee.
// Colours and units come from the rule-based evaluator (migration 106,
// evaluate_attendance): In 09:00 / Out 18:00, <4.5h = half, late/early grace
// (1/month) then half, >09:30 half, approved short leave excuses the penalty,
// approved paid leave adjusts (no LOP). Click a day for punch in/out + reason.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sym } from '@/components/shared/Sym'
import { fmtTime, fmtMinutes, istToday } from './attendanceShared'
import { fetchAttendanceEvaluation, fetchEmployeePunches, type EvaluatedDay } from '../api/attendance'

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
const STATUS_CAT: Record<string, Cat> = {
  present: 'present', half_day: 'half', absent: 'absent', on_leave: 'leave',
  holiday: 'holiday', weekly_off: 'off', wfh: 'wfh', od: 'wfh', none: 'none', pending: 'none',
}
const LEGEND: Cat[] = ['present', 'half', 'absent', 'leave', 'holiday', 'off']
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad = (n: number) => String(n).padStart(2, '0')
const monShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function AttendanceCalendar({ employeeId }: { employeeId: string }) {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [openDay, setOpenDay] = useState<string | null>(null)

  const from = `${ym.y}-${pad(ym.m + 1)}-01`
  const to = `${ym.y}-${pad(ym.m + 1)}-${pad(new Date(ym.y, ym.m + 1, 0).getDate())}`
  const today = istToday()

  const { data: evalDays = [], isLoading } = useQuery({
    queryKey: ['hrms', 'cal', 'eval', employeeId, from],
    queryFn: () => fetchAttendanceEvaluation(employeeId, from, to), enabled: !!employeeId,
  })
  const { data: punches = [] } = useQuery({
    queryKey: ['hrms', 'cal', 'punches', employeeId, from],
    queryFn: () => fetchEmployeePunches(employeeId, from, to), enabled: !!employeeId,
  })

  // Punches grouped by their IST day, collapsed to one entry per minute (seconds ignored).
  // `punches` is time-ordered, so same-minute repeats are adjacent — skip the repeat.
  const punchesByDate = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const p of punches) {
      const ds = new Date(p.punch_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      const t = fmtTime(p.punch_at)
      const arr = m.get(ds) ?? m.set(ds, []).get(ds)!
      if (arr[arr.length - 1] !== t) arr.push(t)
    }
    return m
  }, [punches])

  const byDate = useMemo(() => {
    const m = new Map<string, EvaluatedDay>()
    for (const e of evalDays as EvaluatedDay[]) m.set(e.work_date, e)
    return m
  }, [evalDays])

  const catOf = (e?: EvaluatedDay): Cat => (e ? STATUS_CAT[e.status] ?? 'none' : 'none')

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    let lop = 0
    for (const e of evalDays as EvaluatedDay[]) { c[catOf(e)] = (c[catOf(e)] ?? 0) + 1; lop += Number(e.lop_units) }
    return { c, lop }
  }, [evalDays])

  const shift = (delta: number) => { setOpenDay(null); setYm(s => { const d = new Date(s.y, s.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() } }) }
  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(ym.y, ym.m, 1))
  const firstDow = new Date(ym.y, ym.m, 1).getDay()
  const total = new Date(ym.y, ym.m + 1, 0).getDate()

  const sel = openDay ? byDate.get(openDay) : null
  const selCat = catOf(sel ?? undefined)

  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg border border-border hover:bg-[#F8FAFC]"><Sym name="chevron_left" size={16} /></button>
          <span className="text-sm font-medium text-brand-950 min-w-[130px] text-center">{monthLabel}</span>
          <button onClick={() => shift(1)} className="p-1.5 rounded-lg border border-border hover:bg-[#F8FAFC]"><Sym name="chevron_right" size={16} /></button>
        </div>
        {counts.lop > 0 && (
          <span className="text-[11px] font-medium px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200">
            LOP {counts.lop} day{counts.lop === 1 ? '' : 's'}
          </span>
        )}
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
              const e = byDate.get(ds)
              const cat = catOf(e)
              const c = CAT[cat]
              const isToday = ds === today
              return (
                <button key={ds} onClick={() => setOpenDay(openDay === ds ? null : ds)}
                  className={`rounded-lg border min-h-[52px] p-1.5 text-left flex flex-col justify-between transition hover:ring-2 hover:ring-brand-600/20 ${c.cls} ${isToday ? 'ring-2 ring-brand-600' : ''}`}>
                  <span className="text-xs font-semibold">{dd}</span>
                  {cat !== 'none' && <span className="text-[9px] leading-tight truncate">{c.label}</span>}
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded border ${CAT[selCat].cls}`}>{CAT[selCat].label}</span>
                  {sel.penalty && <span className="text-[11px] text-amber-700">· {sel.penalty}</span>}
                  {sel.late_minutes > 0 && <span className="text-[11px] text-muted-foreground">· {sel.late_minutes}m late</span>}
                  {sel.covered === 'leave' && <span className="text-[11px] text-indigo-600">· leave-adjusted</span>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5">
                  <span>In: <span className="text-brand-950 font-medium">{fmtTime(sel.first_in)}</span></span>
                  <span>Out: <span className="text-brand-950 font-medium">{sel.last_out && sel.last_out !== sel.first_in ? fmtTime(sel.last_out) : '—'}</span></span>
                  <span>Worked: <span className="text-brand-950 font-medium">{fmtMinutes(sel.worked_minutes)}</span></span>
                </div>
                {(punchesByDate.get(openDay)?.length ?? 0) > 0 && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    All punches: <span className="text-brand-950">{punchesByDate.get(openDay)!.join(' · ')}</span>
                    <span className="text-muted-foreground/70"> (first &amp; last used for attendance)</span>
                  </div>
                )}
              </div>
              <button onClick={() => setOpenDay(null)} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={15} /></button>
            </div>
          )}

          {/* Legend + counts */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-border">
            {LEGEND.map(k => (
              <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={`w-3 h-3 rounded ${CAT[k].sw}`} />{CAT[k].label}
                <span className="text-brand-950 font-medium">{counts.c[k] ?? 0}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
