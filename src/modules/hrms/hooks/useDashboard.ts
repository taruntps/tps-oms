// HRMS — Dashboards (M10) React Query hook.
import { useQuery } from '@tanstack/react-query'
import { fetchDashboardStats } from '../api/dashboard'

export function useDashboardStats() {
  return useQuery({ queryKey: ['hrms', 'dashboard', 'stats'], queryFn: fetchDashboardStats })
}
