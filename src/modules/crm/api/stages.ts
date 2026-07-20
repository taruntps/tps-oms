// CRM — pipeline stages data access.
// Table `crm_pipeline_stages` (migration 082) is not in the generated Database
// types yet, so we cast `from(...)` to `any` (established CRM pattern).
import { supabase } from '@/lib/supabase'

const db = supabase as any

export interface PipelineStage {
  stage_key: string
  label: string
  sort_order: number
  is_won: boolean
  is_lost: boolean
}

export async function fetchStages(): Promise<PipelineStage[]> {
  const { data, error } = await db
    .from('crm_pipeline_stages')
    .select('stage_key, label, sort_order, is_won, is_lost')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as PipelineStage[]
}
