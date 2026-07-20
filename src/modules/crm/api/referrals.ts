// CRM — referrals data access.
// The existing `referrals` table gained `referral_code` and `commission_percent`
// (migration 082) which aren't in the generated Database types yet, so we cast
// `from(...)` to `any` for full column coverage.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export interface Referral {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  referral_code: string | null
  commission_percent: number | null
  created_at: string
}

export interface ReferralInput {
  name: string
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  referral_code?: string | null
  commission_percent?: number | null
}

export async function fetchReferrals(): Promise<Referral[]> {
  const { data, error } = await db
    .from('referrals')
    .select('id, name, contact_person, phone, email, referral_code, commission_percent, created_at')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Referral[]
}

export async function upsertReferral(input: ReferralInput & { id?: string }): Promise<void> {
  if (input.id) {
    const { id, ...patch } = input
    const { error } = await db.from('referrals').update(patch).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await db.from('referrals').insert(input)
    if (error) throw error
  }
}
