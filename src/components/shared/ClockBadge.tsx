import { cn, minutesSince, formatTimeElapsed, CLOCK_CONFIG } from '@/lib/utils'
import type { Database } from '@/types/database'

type ClockType = Database['public']['Enums']['clock_type']

interface Props {
  clock: ClockType
  since: string        // ISO timestamp of clock_switched_at
  isBlocked?: boolean
  personName?: string  // when clock = employee, show this person's first name
  className?: string
  pausedMinutes?: number      // accumulated minutes from past blocks (projects.blocked_minutes_total)
  blockStartedAt?: string | null // when currently blocked, freeze the clock at this moment
}

export function ClockBadge({ clock, since, isBlocked, personName, className, pausedMinutes, blockStartedAt }: Props) {
  const key = clock.toUpperCase() as keyof typeof CLOCK_CONFIG
  const cfg = CLOCK_CONFIG[key]
  // Blocked time never counts: subtract past block periods, and if currently
  // blocked also subtract the running block (freezing the display).
  const frozen = isBlocked && blockStartedAt ? minutesSince(blockStartedAt) : 0
  const mins = Math.max(0, minutesSince(since) - (pausedMinutes ?? 0) - frozen)
  const elapsed = formatTimeElapsed(mins)
  // For the employee clock, show the assignee's first name instead of "Employee".
  const firstName = personName?.trim().split(/\s+/)[0]
  const label = clock === 'employee' && firstName ? firstName : cfg.label

  if (isBlocked) {
    return (
      <div className={cn(
        'inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium bg-red-50 border-red-200',
        className
      )}>
        <span className="clock-dot bg-red-500" />
        <span className="text-red-700 font-bold">BLOCKED</span>
        <span className="text-red-400 font-mono" title="Clock stopped — time excludes blocked period">⏸ {elapsed}</span>
      </div>
    )
  }

  return (
    <div className={cn(
      'inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium',
      cfg.bg, cfg.border, className
    )}>
      <span className={cn('clock-dot', cfg.dot)} />
      <span className={cfg.color}>{label}</span>
      <span className="text-muted-foreground font-mono">{elapsed}</span>
    </div>
  )
}
