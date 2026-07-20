// Sales — Service catalogue data access (thin supabase wrappers).
// Table: sales_services (migration 083). Not in the generated Database types yet,
// so the client is cast to `any` (same pattern as the CRM/admin modules).
import { supabase } from '@/lib/supabase'

const db = supabase as any

export interface SalesService {
  id: string
  code: string | null
  name: string
  category: string | null
  default_fee: number // paise
  hsn_sac: string | null
  gst_rate: number
  is_active: boolean
  created_at: string
}

export interface ServiceInput {
  code?: string | null
  name: string
  category?: string | null
  default_fee: number // paise
  hsn_sac?: string | null
  gst_rate: number
  is_active: boolean
}

export async function fetchServices(): Promise<SalesService[]> {
  const { data, error } = await db
    .from('sales_services')
    .select('id, code, name, category, default_fee, hsn_sac, gst_rate, is_active, created_at')
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as SalesService[]
}

export async function createService(input: ServiceInput): Promise<void> {
  const { error } = await db.from('sales_services').insert({
    code: input.code?.trim() || null,
    name: input.name.trim(),
    category: input.category?.trim() || null,
    default_fee: input.default_fee,
    hsn_sac: input.hsn_sac?.trim() || null,
    gst_rate: input.gst_rate,
    is_active: input.is_active,
  })
  if (error) throw error
}

export async function updateService(id: string, input: ServiceInput): Promise<void> {
  const { error } = await db
    .from('sales_services')
    .update({
      code: input.code?.trim() || null,
      name: input.name.trim(),
      category: input.category?.trim() || null,
      default_fee: input.default_fee,
      hsn_sac: input.hsn_sac?.trim() || null,
      gst_rate: input.gst_rate,
      is_active: input.is_active,
    })
    .eq('id', id)
  if (error) throw error
}
