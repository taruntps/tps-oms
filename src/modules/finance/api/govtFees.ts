// Finance — government (pass-through) fees. These are statutory fees paid to
// authorities (FSSAI / labs) on the client's behalf; NOT TPS revenue.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type GovtFeePaidBy = 'client' | 'tps'
export type GovtFeeStatus = 'pending' | 'paid' | 'recovered'

export interface GovtFeeRow {
  id: string
  project_id: string | null
  license_id: string | null
  authority: string
  amount: number // paise
  paid_by: GovtFeePaidBy
  status: GovtFeeStatus
  reference_no: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  project?: { project_code: string | null; project_name: string | null } | null
}

export async function fetchGovtFees(): Promise<GovtFeeRow[]> {
  const { data, error } = await db
    .from('finance_govt_fees')
    .select('*, project:projects(project_code, project_name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as GovtFeeRow[]
}

export interface GovtFeeInput {
  project_id: string | null
  authority: string
  amount: number // paise
  paid_by: GovtFeePaidBy
  status: GovtFeeStatus
  reference_no: string | null
  notes: string | null
}

export async function createGovtFee(input: GovtFeeInput, createdBy: string | null): Promise<void> {
  const { error } = await db.from('finance_govt_fees').insert({ ...input, created_by: createdBy })
  if (error) throw error
}

export async function updateGovtFee(id: string, input: Partial<GovtFeeInput>): Promise<void> {
  const { error } = await db.from('finance_govt_fees').update(input).eq('id', id)
  if (error) throw error
}
