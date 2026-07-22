// HRMS — Leave Reports (/hrms/leave/reports), gate hrms.leave.view.
// Per-employee balances (via get_leave_balance) + availed (sum of approved requests) +
// a simple leave-liability view (balance × types marked encashable).
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useEmployees } from '../hooks/useEmployees'
import { useActiveLeaveTypes, useLeaveRequests, useLeaveBalanceMatrix } from '../hooks/useLeave'
import { fmtDays, istYear } from './leaveShared'

export default function LeaveReportsPage() {
  const year = istYear()
  const [tab, setTab] = useState<'balances' | 'liability'>('balances')

  const { data: employees = [], isLoading: le } = useEmployees()
  const { data: leaveTypes = [] } = useActiveLeaveTypes()
  const { data: approved = [] } = useLeaveRequests('approved')

  const encashableTypes = useMemo(() => leaveTypes.filter(t => t.is_encashable), [leaveTypes])

  // Availed = sum of approved-request days per employee × leave type (calendar year).
  const availed = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of approved) {
      if (r.from_date.slice(0, 4) !== String(year)) continue
      const k = `${r.employee_id}|${r.leave_type_id}`
      m.set(k, (m.get(k) ?? 0) + Number(r.days))
    }
    return m
  }, [approved, year])

  // Balance matrix — for liability we only need encashable types; for balances, all.
  const matrixTypes = tab === 'liability' ? encashableTypes : leaveTypes
  const pairs = useMemo(
    () => employees.flatMap(e => matrixTypes.map(t => ({ employeeId: e.id, leaveTypeId: t.id }))),
    [employees, matrixTypes],
  )
  const balanceQueries = useLeaveBalanceMatrix(pairs, year)
  const balanceOf = useMemo(() => {
    const m = new Map<string, number>()
    pairs.forEach((p, i) => m.set(`${p.employeeId}|${p.leaveTypeId}`, Number(balanceQueries[i]?.data ?? 0)))
    return m
  }, [pairs, balanceQueries])

  return (
    <div>
      <TopBar title="Leave Reports" subtitle={`Balances, utilisation & liability · ${year}`} />

      <div className="p-6 animate-fade-up space-y-5">
        <div className="flex gap-1 border-b border-border">
          {(['balances', 'liability'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-brand-950'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {le ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : employees.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="summarize" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No employees.</p>
          </div>
        ) : tab === 'balances' ? (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  {leaveTypes.map(t => (
                    <th key={t.id} className="px-3 py-3 font-medium text-center" title={t.name}>
                      {t.code}<span className="block text-[9px] normal-case text-muted-foreground/60 font-normal">bal / availed</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-brand-950">{e.name || '—'}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{e.employee_code || ''}</div>
                    </td>
                    {leaveTypes.map(t => (
                      <td key={t.id} className="px-3 py-2.5 text-center">
                        <span className="text-brand-950 font-medium">{fmtDays(balanceOf.get(`${e.id}|${t.id}`) ?? 0)}</span>
                        <span className="text-muted-foreground/60"> / {fmtDays(availed.get(`${e.id}|${t.id}`) ?? 0)}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // Liability: balance of encashable types per employee (days). Amount is Payroll's job.
          <>
            {encashableTypes.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-border p-10 text-center">
                <p className="text-sm text-muted-foreground">No leave types are marked encashable.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Employee</th>
                      {encashableTypes.map(t => <th key={t.id} className="px-3 py-3 font-medium text-center">{t.code}</th>)}
                      <th className="px-3 py-3 font-medium text-center">Total (days)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(e => {
                      const total = encashableTypes.reduce((s, t) => s + (balanceOf.get(`${e.id}|${t.id}`) ?? 0), 0)
                      return (
                        <tr key={e.id} className="border-b border-border last:border-0 hover:bg-[#F8FAFC]">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-brand-950">{e.name || '—'}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">{e.employee_code || ''}</div>
                          </td>
                          {encashableTypes.map(t => (
                            <td key={t.id} className="px-3 py-2.5 text-center text-muted-foreground">{fmtDays(balanceOf.get(`${e.id}|${t.id}`) ?? 0)}</td>
                          ))}
                          <td className="px-3 py-2.5 text-center font-semibold text-brand-950">{fmtDays(total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Liability is shown in leave-days for encashable types. Monetary valuation is computed by Payroll.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
