// Finance — shared lookups (clients, billable services, projects).
// `sales_services` isn't in the generated Database types yet → cast to any.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export interface ClientOption {
  id: string
  company_name: string
  trade_name: string | null
  gstin: string | null
  address: string | null
  city: string | null
  state: string | null
  contact_person: string | null
  contact_phone: string | null
  contact_email: string | null
}

export interface ServiceOption {
  id: string
  code: string | null
  name: string
  category: string | null
  default_fee: number // paise
  hsn_sac: string | null
  gst_rate: number
}

export interface ProjectOption {
  id: string
  project_code: string
  project_name: string | null
  client_id: string
}

export async function fetchClients(): Promise<ClientOption[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, company_name, trade_name, gstin, address, city, state, contact_person, contact_phone, contact_email')
    .eq('is_active', true)
    .order('company_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as ClientOption[]
}

export async function fetchServices(): Promise<ServiceOption[]> {
  const { data, error } = await db
    .from('sales_services')
    .select('id, code, name, category, default_fee, hsn_sac, gst_rate')
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as ServiceOption[]
}

export async function fetchProjects(): Promise<ProjectOption[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, project_code, project_name, client_id')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ProjectOption[]
}
