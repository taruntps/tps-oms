// HRMS — Employees directory (/hrms/employees).
// Lists profiles joined to department/designation master names + status/DOJ from
// employee_details. Search + department/status filters. New Employee gated by
// hrms.employee.manage.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { useEmployees } from '../hooks/useEmployees'
import { useDepartments, useDesignations } from '../hooks/useMasters'
import { EmployeeForm } from './EmployeeForm'

export default function EmployeesPage() {
  const navigate = useNavigate()
  const canManage = useCan('hrms.employee.manage')
  const { data: employees = [], isLoading } = useEmployees()
  const { data: departments = [] } = useDepartments()
  const { data: designations = [] } = useDesignations()

  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)

  const deptName = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of departments) m.set(d.id, d.name)
    return m
  }, [departments])

  const desigName = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of designations) m.set(d.id, d.name)
    return m
  }, [designations])

  const statuses = useMemo(() => {
    const set = new Set<string>()
    for (const e of employees) if (e.employee_status) set.add(e.employee_status)
    return [...set].sort()
  }, [employees])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return employees.filter(e => {
      if (deptFilter && e.department_id !== deptFilter) return false
      if (statusFilter && e.employee_status !== statusFilter) return false
      if (!q) return true
      return (
        (e.name ?? '').toLowerCase().includes(q) ||
        (e.employee_code ?? '').toLowerCase().includes(q) ||
        (e.email ?? '').toLowerCase().includes(q)
      )
    })
  }, [employees, search, deptFilter, statusFilter])

  return (
    <div>
      <TopBar title="Employees" subtitle={`${employees.length} employee${employees.length === 1 ? '' : 's'}`} />

      <div className="p-6 animate-fade-up">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Sym name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, code, email…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>

          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20">
            <option value="">All departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20">
            <option value="">All statuses</option>
            {statuses.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>

          {canManage && (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors ml-auto">
              <Sym name="add" size={16} /> New Employee
            </button>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-white rounded-lg border border-border animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="badge" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No employees found.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Designation</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr
                    key={e.id}
                    onClick={() => navigate(`/hrms/employees/${e.id}`)}
                    className="border-b border-border last:border-0 hover:bg-[#F8FAFC] cursor-pointer"
                  >
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{e.employee_code || '—'}</td>
                    <td className="px-4 py-3 font-medium text-brand-950">{e.name || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(e.designation_id && desigName.get(e.designation_id)) || e.designation || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(e.department_id && deptName.get(e.department_id)) || e.department || '—'}</td>
                    <td className="px-4 py-3"><StatusPill status={e.employee_status} active={e.is_active} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{e.date_of_joining ? formatDate(e.date_of_joining) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <EmployeeForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

function StatusPill({ status, active }: { status: string | null; active: boolean | null }) {
  const label = status || (active === false ? 'inactive' : 'active')
  const tone = /inactive|resigned|terminated|exit/i.test(label)
    ? 'bg-red-50 border-red-200 text-red-700'
    : /probation/i.test(label)
      ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-green-50 border-green-200 text-green-700'
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${tone}`}>{label}</span>
}
