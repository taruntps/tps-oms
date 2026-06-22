import { cn, minutesSince, formatTimeElapsed, CLOCK_CONFIG } from '@/lib/utils'
import type { Database } from '@/types/database'

type ClockType = Database['public']['Enums']['clock_type']

interface Props {
  clock: ClockType
  since: string        // ISO timestamp of clock_switched_at
  isBlocked?: boolean
  className?: string
}

export function ClockBadge({ clock, since, isBlocked, className }: Props) {
  const key = clock.toUpperCase() as keyof typeof CLOCK_CONFIG
  const cfg = CLOCK_CONFIG[key]
  const elapsed = formatTimeElapsed(minutesSince(since))

  return (
    <div className={cn(
      'inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium',
      cfg.bg, cfg.border, className
    )}>
      <span className={cn('clock-dot', cfg.dot)} />
      <span className={cfg.color}>{cfg.label}</span>
      <span className="text-muted-foreground font-mono">{elapsed}</span>
      {isBlocked && (
        <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded font-bold">BLOCKED</span>
      )}
    </div>
  )
}
