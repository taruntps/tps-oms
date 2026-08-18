// HRMS — Holiday calendar (/hrms/holidays), gate hrms.ess.view.
// Read-only list of company holidays for every employee. Grouped by month,
// upcoming years selectable. Data = hr_holidays (RLS: all roles can read).
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useHolidays } from '../hooks/useLeaveConfig'
import { istToday } from './attendanceShared'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const parse = (d: string) => new Date(d + 'T00:00:00')
const weekday = (d: string) => parse(d).toLocaleDateString('en-IN', { weekday: 'long' })
const dayNum = (d: string) => parse(d).getDate()
const monShort = (d: string) => MONTHS[parse(d).getMonth()]

export default function HolidaysPage() {
  const { data: all = [], isLoading } = useHolidays(null)
  const today = istToday()

  const holidays = useMemo(
    () => (all as any[]).filter(h => h.is_active).sort((a, b) => (a.holiday_date < b.holiday_date ? -1 : 1)),
    [all],
  )

  // Distinct years present, ascending. Default to the current/next year in the data.
  const years = useMemo(() => [...new Set(holidays.map(h => h.calendar_year as number))].sort(), [holidays])
  const defaultYear = years.find(y => y >= Number(today.slice(0, 4))) ?? years[years.length - 1]
  const [year, setYear] = useState<number | null>(null)  // null until data loads
  const activeYear = year ?? defaultYear

  const rows = useMemo(() => holidays.filter(h => h.calendar_year === activeYear), [holidays, activeYear])

  // Group the chosen year's holidays by month for a clean, scannable layout.
  const byMonth = useMemo(() => {
    const m = new Map<number, any[]>()
    for (const h of rows) {
      const mo = parse(h.holiday_date).getMonth()
      ;(m.get(mo) ?? m.set(mo, []).get(mo)!).push(h)
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [rows])

  return (
    <div>
      <TopBar title="Holidays" subtitle="Company holiday calendar" />
      <div className="p-6 animate-fade-up space-y-5 max-w-3xl">
        {/* Year switcher */}
        {years.length > 1 && (
          <div className="flex items-center gap-2">
            {years.map(y => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`px-3.5 py-1.5 text-sm rounded-lg border font-medium transition ${
                  y === activeYear
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-brand-950 border-border hover:bg-[#F8FAFC]'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-white rounded-xl border border-border animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="event_busy" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No holidays published yet.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {byMonth.map(([mo, items]) => (
              <div key={mo}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/70 mb-2">{MONTHS[mo]} {activeYear}</h3>
                <div className="bg-white rounded-xl border border-border overflow-hidden divide-y divide-border">
                  {items.map(h => {
                    const isPast = h.holiday_date < today
                    const isToday = h.holiday_date === today
                    return (
                      <div key={h.id} className={`flex items-center gap-4 px-4 py-3 ${isPast ? 'opacity-55' : ''}`}>
                        {/* Date chip */}
                        <div className={`shrink-0 w-14 text-center rounded-lg py-1.5 ${isToday ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'}`}>
                          <div className="text-lg font-bold leading-none">{dayNum(h.holiday_date)}</div>
                          <div className="text-[10px] uppercase tracking-wide mt-0.5">{monShort(h.holiday_date)}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-brand-950">{h.name}</div>
                          <div className="text-[12px] text-muted-foreground">{weekday(h.holiday_date)}{isToday && <span className="text-brand-600 font-medium"> · Today</span>}</div>
                        </div>
                        {h.holiday_type !== 'gazetted' && (
                          <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700 capitalize">{h.holiday_type}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
