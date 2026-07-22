// HRMS — Payroll (M4): Payslips (/hrms/payroll/payslips), gate hrms.payslip.self.
// ESS: an employee sees their OWN payslips; HR/director (hrms.payroll.view) sees all.
// RLS is authoritative — this only shapes the query + UI affordance.
import { useMemo } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import { useEmployees } from '../hooks/useEmployees'
import { usePayslips } from '../hooks/usePayroll'
import { fmtPaise } from './payrollShared'

export default function PayslipsPage() {
  const { user } = useAuth()
  const canViewAll = useCan('hrms.payroll.view')
  const { data: employees = [] } = useEmployees()
  // HR sees all payslips; a regular employee is scoped to their own id (+ RLS).
  const { data: payslips = [], isLoading } = usePayslips({ employeeId: canViewAll ? null : user?.id })

  const empName = useMemo(() => new Map(employees.map(e => [e.id, e.name ?? e.employee_code ?? e.id.slice(0, 8)])), [employees])

  return (
    <div>
      <TopBar title="Payslips" subtitle={canViewAll ? 'All published payslips' : 'Your published payslips'} />
      <div className="p-6 animate-fade-up space-y-5">
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : payslips.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="description" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No payslips published yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  {canViewAll && <th className="px-4 py-3 font-medium">Employee</th>}
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium text-right">Gross</th>
                  <th className="px-4 py-3 font-medium text-right">Net</th>
                  <th className="px-4 py-3 font-medium">Published</th>
                  <th className="px-4 py-3 font-medium">Document</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map(p => {
                  const ytd = (p.ytd ?? {}) as Record<string, unknown>
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-[#F8FAFC]">
                      {canViewAll && <td className="px-4 py-3 font-medium text-brand-950">{empName.get(p.employee_id) ?? p.employee_id.slice(0, 8)}</td>}
                      <td className="px-4 py-3 text-muted-foreground">{String(ytd.period ?? '—')}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{ytd.gross != null ? fmtPaise(Number(ytd.gross)) : '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-brand-950">{ytd.net != null ? fmtPaise(Number(ytd.net)) : '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(p.published_at)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.document_id ? <span className="text-brand-600">Available</span> : <span className="text-muted-foreground/60 italic">PDF pending</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
