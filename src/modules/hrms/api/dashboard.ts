// HRMS — Dashboards (M10): non-PII aggregate stats via the hr_dashboard_stats() RPC.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type DashboardStats = {
  headcount: number
  on_leave_today: number
  pending_leave: number
  pending_attendance: number
  open_requisitions: number
  pending_reviews: number
  expiring_certs: number
  assets_issued: number
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await db.rpc('hr_dashboard_stats')
  if (error) throw error
  return data as DashboardStats
}
