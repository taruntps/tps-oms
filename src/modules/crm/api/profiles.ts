// CRM — lightweight profiles lookup for owner assignment / display.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export interface CrmProfile {
  id: string
  name: string | null
  role: string | null
}

export async function fetchProfiles(): Promise<CrmProfile[]> {
  const { data, error } = await db
    .from('profiles')
    .select('id, name, role')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as CrmProfile[]
}
