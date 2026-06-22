import { useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, Clock, PlayCircle, XCircle } from 'lucide-react'
import { useUpdateStage } from '@/hooks/useProjects'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { toast } from '@/components/shared/Toast'
import { cn, formatDateTime } from '@/lib/utils'
import type { Tables } from '@/types/database'

type Stage = Tables<'stages'>

interface Props {
  stage: Stage
  projectId: string
  isBlocked: boolean
}

const STATUS_CONFIG = {
  pending:     { icon: Clock,         cls: 'text-muted-foreground', bg: 'bg-gray-50 border-gray-200' },
  in_progress: { icon: PlayCircle,    cls: 'text-brand-600',        bg: 'bg-brand-50 border-brand-200' },
  completed:   { icon: CheckCircle2,  cls: 'text-green-600',        bg: 'bg-green-50 border-green-200' },
  blocked:     { icon: XCircle,       cls: 'text-red-600',          bg: 'bg-red-50 border-red-200' },
  skipped:     { icon: XCircle,       cls: 'text-gray-400',         bg: 'bg-gray-50 border-gray-200' },
}

const NEXT_ACTIONS: Record<string, { label: string; next: Stage['status'] }[]> = {
  pending:     [{ label: 'Start', next: 'in_progress' }],
  in_progress: [{ label: 'Complete', next: 'completed' }, { label: 'Skip', next: 'skipped' }],
  completed:   [],
  blocked:     [{ label: 'Resume', next: 'in_progress' }],
  skipped:     [{ label: 'Restart', next: 'in_progress' }],
}

export function StageCard({ stage, projectId, isBlocked }: Props) {
  const [open, setOpen] = useState(false)
  const updateStage = useUpdateStage()

  const cfg = STATUS_CONFIG[stage.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending
  const Icon = cfg.icon
  const actions = NEXT_ACTIONS[stage.status] ?? []

  const changeStatus = async (next: Stage['status']) => {
    try {
      await updateStage.mutateAsync({ id: stage.id, projectId, status: next })
      toast.success('Stage updated', `${stage.stage_name} → ${next.replace('_', ' ')}`)
    } catch (err: any) {
      toast.error('Update failed', err.message)
    }
  }

  return (
    <div className={cn('rounded-xl border p-4 transition-all', cfg.bg)}>
      <div className="flex items-center gap-3">
        {/* Order badge */}
        <span className="w-6 h-6 rounded-full bg-white border border-border flex items-center justify-center text-[11px] font-mono text-muted-foreground shrink-0">
          {stage.stage_order}
        </span>

        {/* Status icon */}
        <Icon size={15} className={cn(cfg.cls, 'shrink-0')} />

        {/* Name */}
        <span className="flex-1 text-sm font-medium text-brand-950 truncate">{stage.stage_name}</span>

        {/* Status badge */}
        <span className={cn(
          'text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize',
          stage.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
          stage.status === 'in_progress' ? 'bg-brand-100 text-brand-700 border-brand-200' :
          stage.status === 'blocked' ? 'bg-red-100 text-red-700 border-red-200' :
          'bg-gray-100 text-gray-600 border-gray-200'
        )}>
          {stage.status.replace('_', ' ')}
        </span>

        {/* Expand toggle */}
        <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-brand-950">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="mt-3 pt-3 border-t border-white/60 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <TimeRow label="Started" value={stage.started_at} />
            <TimeRow label="Completed" value={stage.completed_at} />
            <TimeRow label="Due" value={stage.due_date} />
            {stage.stage_code && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Stage Code</p>
                <p className="font-mono text-brand-950">{stage.stage_code}</p>
              </div>
            )}
          </div>

          {stage.notes && (
            <p className="text-xs text-muted-foreground italic">{stage.notes}</p>
          )}

          {/* Action buttons — manager/executive only, blocked = disabled */}
          <RoleGuard roles={['super_admin','director','manager','executive']}>
            {actions.length > 0 && (
              <div className="flex gap-2 pt-1">
                {actions.map(a => (
                  <button
                    key={a.next}
                    disabled={isBlocked || updateStage.isPending}
                    onClick={() => changeStatus(a.next)}
                    className={cn(
                      'px-3 py-1 text-xs font-medium rounded-lg border transition-colors',
                      a.next === 'completed' ? 'bg-green-600 text-white border-green-700 hover:bg-green-700' :
                      a.next === 'skipped'  ? 'bg-gray-500 text-white border-gray-600 hover:bg-gray-600' :
                      'bg-brand-600 text-white border-brand-700 hover:bg-brand-700',
                      (isBlocked || updateStage.isPending) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </RoleGuard>
        </div>
      )}
    </div>
  )
}

function TimeRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-brand-950">{formatDateTime(value)}</p>
    </div>
  )
}
