import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

const ROLE_HOME: Record<string, string> = {
  super_admin: '/director',
  director:    '/director',
  manager:     '/operations',
  executive:   '/dashboard',
  accounts:    '/dashboard',
  hr:          '/employees',
  auditor:     '/reports/performance',
}

export function RoleBasedRedirect() {
  const { profile, loading } = useAuth()

  if (loading) return null

  const dest = profile ? (ROLE_HOME[profile.role] ?? '/dashboard') : '/login'
  return <Navigate to={dest} replace />
}
