// Administration — Audit Log viewer (/admin/audit).
// Paginated, read-only view of `audit_log` with simple action/table filters.
import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { cn, formatDateTime } from '@/lib/utils'
import { AUDIT_PAGE_SIZE } from '../api/audit'
import { useAuditLog } from '../hooks/useAuditLog'

export default function AuditLogPage() {
  const [page, setPage] = useState(0)
  const [action, setAction] = useState('')
  const [tableName, setTableName] = useState('')

  const { auditQuery, names } = useAuditLog(page, { action, table_name: tableName })
  const { data, isLoading, isFetching, error } = auditQuery

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE))

  const resetToFirstPage = () => setPage(0)

  return (
    <div>
      <TopBar title="Audit Log" subtitle="System activity trail" />
      <div className="p-6 space-y-6 animate-fade-up">

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Action</label>
            <input
              value={action}
              onChange={e => { setAction(e.target.value); resetToFirstPage() }}
              placeholder="e.g. update, insert"
              className="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Table</label>
            <input
              value={tableName}
              onChange={e => { setTableName(e.target.value); resetToFirstPage() }}
              placeholder="e.g. profiles"
              className="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </div>
          {(action || tableName) && (
            <button
              onClick={() => { setAction(''); setTableName(''); resetToFirstPage() }}
              className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] flex items-center gap-1.5"
            >
              <Sym name="clear" size={13} /> Clear
            </button>
          )}
          <div className="ml-auto text-xs text-muted-foreground self-center">
            {isFetching ? 'Loading…' : `${total} entries`}
          </div>
        </div>

        {error ? (
          <div className="glass-panel rounded-xl p-4 text-sm text-white">
            <div className="flex items-start gap-2">
              <Sym name="error" size={16} className="mt-0.5 shrink-0 text-red-300" />
              <div>
                <p className="font-medium mb-1">Couldn't load the audit log</p>
                <p className="text-xs text-white/70">{(error as Error).message}</p>
              </div>
            </div>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 glass-panel rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F8FAFC] border-b border-border">
                  <tr>
                    {['When', 'User', 'Action', 'Table', 'Record'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">{formatDateTime(r.created_at)}</td>
                      <td className="px-5 py-3 text-brand-950">{r.user_id ? (names[r.user_id] ?? '—') : 'System'}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                          {r.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{r.table_name ?? '—'}</td>
                      <td className="px-5 py-3 font-mono text-[10px] text-muted-foreground">{r.record_id ?? '—'}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">No audit entries match.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Page {page + 1} of {pageCount}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className={cn('px-3 py-1.5 text-sm border border-border rounded-lg flex items-center gap-1',
                    page === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#F8FAFC]')}
                >
                  <Sym name="chevron_left" size={14} /> Prev
                </button>
                <button
                  onClick={() => setPage(p => (p + 1 < pageCount ? p + 1 : p))}
                  disabled={page + 1 >= pageCount}
                  className={cn('px-3 py-1.5 text-sm border border-border rounded-lg flex items-center gap-1',
                    page + 1 >= pageCount ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#F8FAFC]')}
                >
                  Next <Sym name="chevron_right" size={14} />
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
