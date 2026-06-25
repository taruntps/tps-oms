import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useEmployees } from '@/hooks/useEmployees'

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700',
  director:    'bg-amber-100 text-amber-700',
  manager:     'bg-purple-100 text-purple-700',
  executive:   'bg-blue-100 text-blue-700',
  accounts:    'bg-green-100 text-green-700',
  hr:          'bg-pink-100 text-pink-700',
  auditor:     'bg-gray-100 text-gray-600',
}

export default function EmployeesPage() {
  const navigate = useNavigate()
  const { data: employees = [], isLoading } = useEmployees()
  const [search, setSearch] = useState('')

  const filtered = employees.filter(e => {
    const q = search.toLowerCase()
    return !q ||
      e.name?.toLowerCase().includes(q) ||
      (e.employee_code ?? '').toLowerCase().includes(q) ||
      (e.department ?? '').toLowerCase().includes(q) ||
      (e.designation ?? '').toLowerCase().includes(q) ||
      (e.email ?? '').toLowerCase().includes(q)
  })

  return (
    <div>
      <TopBar title="Employees" subtitle={`${employees.length} staff`} />

      <div className="p-6 animate-fade-up space-y-5">
        <div className="relative max-w-sm">
          <Sym name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, Emp ID, department…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1,2,3].map(i => <div key={i} className="h-16 glass-panel rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="badge" size={32} className="mx-auto text-white/40 mb-3" />
            <p className="text-sm text-white/60">No employees found.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-border">
                <tr>
                  {['Emp ID','Name','Designation','Department','Role','Field'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(e => (
                  <tr key={e.id} onClick={() => navigate(`/employees/${e.id}`)}
                    className="hover:bg-[#F8FAFC] cursor-pointer">
                    <td className="px-5 py-3 font-mono text-xs text-brand-700">{e.employee_code ?? '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-100 flex items-center justify-center shrink-0">
                          {(e as any).avatar_url
                            ? <img src={(e as any).avatar_url} alt="" className="w-full h-full object-cover" />
                            : <span className="text-brand-700 font-semibold text-xs">{e.name?.slice(0,2).toUpperCase()}</span>}
                        </div>
                        <div>
                          <p className="font-medium text-brand-950">{e.name}</p>
                          <p className="text-[11px] text-muted-foreground">{e.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{e.designation ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{e.department ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${ROLE_BADGE[e.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {e.role?.replace('_',' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {e.is_field_staff
                        ? <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Field</span>
                        : <span className="text-[10px] text-muted-foreground">Office</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
