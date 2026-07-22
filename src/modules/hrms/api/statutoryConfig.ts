// HRMS — Payroll (M4): effective-dated statutory config editor (PF/ESI/PT/TDS/GRATUITY/
// BONUS/LWF). Amendments are additive, effective-dated inserts — never destructive edits, so
// historical runs reproduce from the config effective at their period. Placeholder rows are
// 0/[]/{} until Administration configures real values (the engine invents no rates).
// Migration 093 tables aren't in the generated Database types yet → `const db = supabase as any`.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type Statute = 'PF' | 'ESI' | 'PT' | 'TDS' | 'GRATUITY' | 'BONUS' | 'LWF'

export interface StatutoryConfigRow {
  id: string
  statute: Statute
  param_key: string
  value: unknown
  effective_from: string
  effective_to: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export interface StatutoryConfigInput {
  statute: Statute
  param_key: string
  value: unknown
  effective_from: string
  note?: string | null
}

export async function fetchStatutoryConfigRows(): Promise<StatutoryConfigRow[]> {
  const { data, error } = await db
    .from('hr_statutory_config')
    .select('*')
    .order('statute')
    .order('param_key')
    .order('effective_from', { ascending: false })
  if (error) throw error
  return (data ?? []) as StatutoryConfigRow[]
}

/**
 * Amend a statutory param effective-dated. Closes the prior open row for the same
 * (statute, param_key) by setting effective_to = new effective_from − 1 day, then inserts the
 * new effective row. History preserved; no destructive update to past values.
 */
export async function amendStatutoryConfig(input: StatutoryConfigInput, actorId?: string | null): Promise<void> {
  const { data: open, error: qErr } = await db
    .from('hr_statutory_config')
    .select('id, effective_from')
    .eq('statute', input.statute)
    .eq('param_key', input.param_key)
    .is('effective_to', null)
  if (qErr) throw qErr

  const priorEnd = isoDayBefore(input.effective_from)
  for (const row of (open ?? []) as any[]) {
    if (row.effective_from >= input.effective_from) continue // keep future rows untouched
    const { error: upErr } = await db.from('hr_statutory_config').update({ effective_to: priorEnd }).eq('id', row.id)
    if (upErr) throw upErr
  }

  const { error } = await db.from('hr_statutory_config').insert({
    statute: input.statute,
    param_key: input.param_key,
    value: input.value,
    effective_from: input.effective_from,
    effective_to: null,
    note: input.note ?? null,
    created_by: actorId ?? null,
  })
  if (error) throw error
}

function isoDayBefore(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
