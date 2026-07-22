// HRMS — My Leave (/hrms/leave/me), gate hrms.leave.apply.
// The signed-in employee's leave self-service: per-type balance cards (get_leave_balance
// per active type), Apply Leave, request history with cancel (pending only), restricted-
// holiday picker (cap via holiday.restricted_quota policy) and available comp-off.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useCan } from '@/core/access/useCan'
import {
  useActiveLeaveTypes,
  useLeaveBalances,
  useMyLeaveRequests,
  useCancelLeaveRequest,
  useMyRestrictedPicks,
  usePickRestrictedHoliday,
  useUnpickRestrictedHoliday,
  useMyCompOff,
  useLeavePolicy,
} from '../hooks/useLeave'
import { useRestrictedHolidays } from '../hooks/useLeaveConfig'
import { LeaveRequestModal } from './LeaveRequestModal'
import { LeaveStatusPill, fmtDays, istYear } from './leaveShared'

/** Coerce a policy value (jsonb) to boolean. */
function asBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 1
}
/** Coerce a policy value to number with a fallback. */
function asNum(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export default function MyLeavePage() {
  const { user } = useAuth()
  const uid = user?.id
  const canApply = useCan('hrms.leave.apply')
  const year = istYear()

  const { data: leaveTypes = [] } = useActiveLeaveTypes()
  const { data: balances = [], isLoading: lb } = useLeaveBalances(uid, year)
  const { data: requests = [], isLoading: lr } = useMyLeaveRequests(uid)
  const { data: restrictedPool = [] } = useRestrictedHolidays(year)
  const { data: myPicks = [] } = useMyRestrictedPicks(uid, year)
  const { data: compOff = [] } = useMyCompOff(uid, 'available')
  const { data: policy = {} } = useLeavePolicy(uid)

  const cancel = useCancelLeaveRequest()
  const pick = usePickRestrictedHoliday(uid ?? '', year)
  const unpick = useUnpickRestrictedHoliday(uid ?? '', year)

  const [showApply, setShowApply] = useState(false)

  const allowNegative = asBool(policy['leave.allow_negative'])
  const minUnit = asNum(policy['leave.min_unit'], 0.5)
  const restrictedQuota = asNum(policy['holiday.restricted_quota'], 2)

  const pickedHolidayIds = useMemo(() => new Set(myPicks.map(p => p.holiday_id)), [myPicks])
  const quotaReached = myPicks.length >= restrictedQuota

  return (
    <div>
      <TopBar title="My Leave" subtitle="Your balances, applications and holidays" />

      <div className="p-6 animate-fade-up space-y-6">
        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {canApply && (
            <button onClick={() => setShowApply(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
              <Sym name="add" size={16} /> Apply for Leave
            </button>
          )}
        </div>

        {/* Balance cards */}
        <section>
          <h3 className="text-sm font-semibold text-brand-950 mb-3">Leave Balances · {year}</h3>
          {lb ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-xl border border-border animate-pulse" />)}
            </div>
          ) : balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leave types configured.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {balances.map(({ type, balance }) => (
                <div key={type.id} className="bg-white rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-brand-600 bg-brand-600/10 rounded px-1.5 py-0.5">{type.code}</span>
                    {type.is_encashable && <Sym name="payments" size={14} className="text-muted-foreground" title="Encashable" />}
                  </div>
                  <p className="mt-2 text-2xl font-display font-semibold text-brand-950">{fmtDays(balance)}</p>
                  <p className="text-xs text-muted-foreground truncate" title={type.name}>{type.name}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">Quota {fmtDays(type.annual_quota)} · {type.is_paid ? 'Paid' : 'Unpaid'}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* My requests */}
        <section>
          <h3 className="text-sm font-semibold text-brand-950 mb-3">My Applications</h3>
          {lr ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-white rounded-lg border border-border animate-pulse" />)}</div>
          ) : requests.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-border p-10 text-center">
              <Sym name="beach_access" size={28} className="mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No leave applications yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Dates</th>
                    <th className="px-4 py-3 font-medium">Days</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => {
                    const t = leaveTypes.find(x => x.id === r.leave_type_id)
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium text-brand-950">{t?.code ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.from_date === r.to_date ? formatDate(r.from_date) : `${formatDate(r.from_date)} – ${formatDate(r.to_date)}`}
                          {r.is_half_day && <span className="ml-1 text-[10px] text-amber-600">(½)</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDays(r.days)}</td>
                        <td className="px-4 py-3"><LeaveStatusPill status={r.status} /></td>
                        <td className="px-4 py-3 text-right">
                          {r.status === 'pending' && (
                            <button onClick={() => cancel.mutate(r.id)} disabled={cancel.isPending} className="text-xs px-2.5 py-1 border border-border rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50">
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Restricted holidays + comp-off */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sym name="event" size={16} className="text-brand-600" />
              <h3 className="text-sm font-semibold text-brand-950">Restricted Holidays</h3>
              <span className="text-[10px] text-muted-foreground bg-[#F8FAFC] border border-border rounded-full px-1.5 py-0.5">
                {myPicks.length}/{restrictedQuota}
              </span>
            </div>
            {restrictedPool.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No restricted holidays for {year}.</p>
            ) : (
              <ul className="space-y-1.5">
                {restrictedPool.map(h => {
                  const picked = pickedHolidayIds.has(h.id)
                  const myPick = myPicks.find(p => p.holiday_id === h.id)
                  return (
                    <li key={h.id} className="flex items-center justify-between gap-2 text-xs border border-border rounded-lg px-2.5 py-1.5">
                      <span className="text-brand-950 font-medium truncate">{formatDate(h.holiday_date)}</span>
                      <span className="text-muted-foreground truncate flex-1">{h.name}</span>
                      {picked ? (
                        <button onClick={() => myPick && unpick.mutate(myPick.id)} disabled={unpick.isPending} className="px-2 py-0.5 text-[11px] border border-border rounded text-red-600 hover:bg-red-50 disabled:opacity-50">Remove</button>
                      ) : (
                        <button onClick={() => pick.mutate(h.id)} disabled={quotaReached || pick.isPending} title={quotaReached ? 'Quota reached' : ''} className="px-2 py-0.5 text-[11px] border border-border rounded text-brand-700 hover:bg-brand-50 disabled:opacity-40">Select</button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sym name="more_time" size={16} className="text-brand-600" />
              <h3 className="text-sm font-semibold text-brand-950">Comp-off Available</h3>
              <span className="text-[10px] text-muted-foreground bg-[#F8FAFC] border border-border rounded-full px-1.5 py-0.5">{compOff.length}</span>
            </div>
            {compOff.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No comp-off available.</p>
            ) : (
              <ul className="space-y-1.5">
                {compOff.map(c => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-xs border border-border rounded-lg px-2.5 py-1.5">
                    <span className="text-brand-950 font-medium">{formatDate(c.earned_date)}</span>
                    <span className="text-muted-foreground capitalize">{c.source?.replace('_', ' ') ?? '—'}</span>
                    <span className="text-muted-foreground">{c.expires_on ? `exp ${formatDate(c.expires_on)}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {showApply && uid && (
        <LeaveRequestModal
          employeeId={uid}
          leaveTypes={leaveTypes}
          balances={balances}
          allowNegative={allowNegative}
          minUnit={minUnit}
          onClose={() => setShowApply(false)}
        />
      )}
    </div>
  )
}
