// HRMS — Leave (/hrms/leave), gate hrms.leave.view.
// Team/all leave requests (RLS scopes managers→team, HR/director→all) with a status filter,
// plus a per-employee balance overview for the active leave types.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useEmployees } from '../hooks/useEmployees'
import { useActiveLeaveTypes, useLeaveRequests, useLeaveBalanceMatrix } from '../hooks/useLeave'
import { LeaveStatusPill, fmtDays, istYear } from './leaveShared'
import type { RequestStatus } from '../api/leave'

const STATUS_TABS: (RequestStatus | 'all')[] = ['all', 'pending', 'approved', 'rejected', 'cancelled']

export default function LeavePage() {
  const year = istYear()
  const [tab, setTab] = useState<'requests' | 'balances'>('requests')
  const [status, setStatus] = useState<RequestStatus | 'all'>('all')

  const { data: employees = [] } = useEmployees()
  const { data: leaveTypes = [] } = useActiveLeaveTypes()
  const { data: requests = [], isLoading } = useLeaveRequests(status === 'all' ? undefined : status)

  const empName = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of employees) m.set(e.id, e.name ?? e.employee_code ?? e.id.slice(0, 8))
    return m
  }, [employees])
  const typeCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of leaveTypes) m.set(t.id, t.code)
    return m
  }, [leaveTypes])

  // Balance matrix: every employee × every active type.
  const pairs = useMemo(
    () => employees.flatMap(e => leaveTypes.map(t => ({ employeeId: e.id, leaveTypeId: t.id }))),
    [employees, leaveTypes],
  )
  const balanceQueries = useLeaveBalanceMatrix(tab === 'balances' ? pairs : [], year)
  const balanceOf = useMemo(() => {
    const m = new Map<string, number>()
    if (tab !== 'balances') return m
    pairs.forEach((p, i) => m.set(`${p.employeeId}|${p.leaveTypeId}`, Number(balanceQueries[i]?.data ?? 0)))
    return m
  }, [pairs, balanceQueries, tab])

  return (
    <div>
      <TopBar title="Leave" subtitle="Team leave requests & balances" />

      <div className="p-6 animate-fade-up space-y-5">
        <div className="flex gap-1 border-b border-border">
          {(['requests', 'balances'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-brand-950'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'requests' && (
          <>
            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 text-sm rounded-lg border capitalize ${status === s ? 'bg-brand-600 text-white border-brand-600' : 'border-border text-muted-foreground hover:bg-[#F8FAFC]'}`}
                >
                  {s}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-white rounded-lg border border-border animate-pulse" />)}</div>
            ) : requests.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
                <Sym name="event_available" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No leave requests.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Employee</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Dates</th>
                      <th className="px-4 py-3 font-medium">Days</th>
                      <th className="px-4 py-3 font-medium">Reason</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(r => (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3 font-medium text-brand-950">{empName.get(r.employee_id) ?? r.employee_id.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{typeCode.get(r.leave_type_id) ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.from_date === r.to_date ? formatDate(r.from_date) : `${formatDate(r.from_date)} – ${formatDate(r.to_date)}`}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDays(r.days)}</td>
                        <td className="px-4 py-3 text-muted-foreground/80 italic max-w-[220px] truncate" title={r.reason ?? ''}>{r.reason || '—'}</td>
                        <td className="px-4 py-3"><LeaveStatusPill status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'balances' && (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  {leaveTypes.map(t => <th key={t.id} className="px-3 py-3 font-medium text-center">{t.code}</th>)}
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
                      <td key={t.id} className="px-3 py-2.5 text-center text-muted-foreground">
                        {fmtDays(balanceOf.get(`${e.id}|${t.id}`) ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {employees.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">No employees.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
