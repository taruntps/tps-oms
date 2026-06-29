// Derive the *real* current clock(s) for a project from its stages.
//
// The project-level `active_clock` column is only changed by block/unblock, so
// it does NOT reflect normal stage progress (it stays 'employee'). The true
// state lives on each stage's `active_clock`. A project can be in more than one
// clock at once (e.g. Form II parallel stages: one with the client, one with us)
// — so this returns an array, one chip per distinct active clock.

import type { Database } from '@/types/database'

type ClockType = Database['public']['Enums']['clock_type']

interface StageLite {
  active_clock?: ClockType | null
  status?: string | null
  started_at?: string | null
}
interface ProjectLite {
  active_clock?: ClockType | null
  clock_switched_at?: string | null
  stages?: StageLite[] | null
}

export interface ClockChip { clock: ClockType; since: string }

// Stable display order: FSSAI first, then client, then us.
const DISPLAY_ORDER: ClockType[] = ['authority', 'client', 'employee']

/**
 * Distinct current clocks across the project's in-progress stages.
 * Falls back to the project-level clock when nothing is actively in progress.
 */
export function computeStageClocks(p: ProjectLite): ClockChip[] {
  const stages = (p.stages ?? []) as StageLite[]
  const active = stages.filter(s => s.status === 'in_progress')

  // Group by clock; keep the earliest started_at as "since" (longest-running).
  const byClock = new Map<ClockType, string>()
  for (const s of active) {
    const clk = (s.active_clock ?? 'employee') as ClockType
    const since = s.started_at ?? p.clock_switched_at ?? new Date().toISOString()
    const prev = byClock.get(clk)
    if (!prev || since < prev) byClock.set(clk, since)
  }

  if (byClock.size === 0) {
    // Nothing in progress (just created / between stages) → project-level clock.
    return [{
      clock: (p.active_clock ?? 'employee') as ClockType,
      since: p.clock_switched_at ?? new Date().toISOString(),
    }]
  }

  return DISPLAY_ORDER
    .filter(c => byClock.has(c))
    .map(c => ({ clock: c, since: byClock.get(c)! }))
}

/**
 * True when the project is waiting ONLY on FSSAI — every in-progress stage is
 * with the authority, so there's nothing TPS or the client can act on.
 * Used to split the "Pending" (actionable) vs "Authority" (with FSSAI) tabs.
 */
export function isAuthorityOnly(p: ProjectLite): boolean {
  const chips = computeStageClocks(p)
  return chips.length > 0 && chips.every(c => c.clock === 'authority')
}
