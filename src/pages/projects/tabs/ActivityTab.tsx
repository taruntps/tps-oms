import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Sym } from '@/components/shared/Sym'

interface AuditRow {
  id: string
  stage_id: string
  stage_name: string | null
  changed_by: string | null
  changed_at: string
  old_values: Record<string, unknown>
  new_values: Record<string, unknown>
  profiles: { name: string } | null
}

// ── Human-readable field labels ─────────────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  status:         'Status',
  assigned_to:    'Assigned To',
  active_clock:   'Clock',
  notes:          'Notes',
  meta:           'Details',
  stage_name:     'Stage Name',
  stage_order:    'Order',
  is_required:    'Required',
  stage_kind:     'Stage Kind',
}
const fieldLabel = (key: string) => FIELD_LABELS[key] ?? key.replace(/_/g, ' ')

const VALUE_LABELS: Record<string, Record<string, string>> = {
  status: {
    not_started:  'Not Started',
    in_progress:  'In Progress',
    completed:    'Completed',
    skipped:      'Skipped',
    not_required: 'Not Required',
    blocked:      'Blocked',
    approved:     'Approved',
    rejected:     'Rejected',
    submitted:    'Submitted',
    pending:      'Pending',
  },
  active_clock: { employee: 'Employee', client: 'Client' },
}

function formatValue(key: string, val: unknown): string {
  if (val === null || val === undefined) return '—'
  const label = VALUE_LABELS[key]?.[String(val)]
  if (label) return label
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

// Skip internal / noise fields from display
const SKIP_FIELDS = new Set(['updated_at', 'created_at', 'id', 'project_id'])

function renderDiff(oldVals: Record<string, unknown>, newVals: Record<string, unknown>) {
  const keys = Object.keys(newVals).filter(k => !SKIP_FIELDS.has(k))
  if (keys.length === 0) return null
  return (
    <div className="mt-1.5 space-y-1">
      {keys.map(k => (
        <div key={k} className="flex flex-wrap items-center gap-1 text-xs">
          <span className="font-medium text-brand-700">{fieldLabel(k)}:</span>
          <span className="line-through text-muted-foreground/70">{formatValue(k, oldVals[k])}</span>
          <Sym name="arrow_forward" size={12} className="text-muted-foreground/50 shrink-0" />
          <span className="font-medium text-brand-900">{formatValue(k, newVals[k])}</span>
        </div>
      ))}
    </div>
  )
}

function useActivityLog(projectId: string) {
  return useQuery({
    queryKey: ['stage_audit_log', projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('stage_audit_log')
        .select('*, profiles:changed_by(name)')
        .eq('project_id', projectId)
        .order('changed_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as AuditRow[]
    },
  })
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)   return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

export function ActivityTab({ projectId }: { projectId: string }) {
  const { data: rows = [], isLoading } = useActivityLog(projectId)

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-border p-5 space-y-3 animate-pulse">
        {[1,2,3,4].map(i => (
          <div key={i} className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-gray-100 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-gray-100 rounded w-40" />
              <div className="h-3 bg-gray-100 rounded w-64" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-10 flex flex-col items-center gap-2 text-center">
        <Sym name="history" size={32} className="text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        <p className="text-xs text-muted-foreground/60">Changes to any stage will appear here.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <h3 className="font-display font-semibold text-brand-950 text-sm mb-4 flex items-center gap-2">
        <Sym name="history" size={16} className="text-brand-500" />
        Activity Log
        <span className="ml-auto text-xs font-normal text-muted-foreground">{rows.length} change{rows.length !== 1 ? 's' : ''}</span>
      </h3>

      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-[13px] top-0 bottom-0 w-px bg-gray-100" aria-hidden />

        <div className="space-y-4">
          {rows.map(row => {
            const actor = row.profiles?.name ?? 'System'
            const initials = actor.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
            const diff = renderDiff(row.old_values, row.new_values)
            if (!diff) return null
            return (
              <div key={row.id} className="flex gap-3 relative">
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0 z-10 text-[10px] font-bold text-brand-700 border border-white ring-1 ring-brand-200">
                  {initials}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-brand-900">{actor}</span>
                    <span className="text-xs text-muted-foreground">updated</span>
                    <span className="text-xs font-medium text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">
                      {row.stage_name ?? 'a stage'}
                    </span>
                    <span
                      className="text-[10px] text-muted-foreground/60 ml-auto shrink-0"
                      title={fullDate(row.changed_at)}
                    >
                      {timeAgo(row.changed_at)}
                    </span>
                  </div>
                  {diff}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
