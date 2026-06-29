import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/types'

interface Props {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    // Render the same flex layout as AppShell so the sidebar column width (w-60)
    // is reserved from the very first paint. This eliminates the layout shift where
    // the full-screen spinner (100vw) transitions to AppShell (sidebar + main).
    return (
      <div className="flex min-h-screen">
        {/* Sidebar skeleton — matches AppShell's `hidden md:block` sidebar column */}
        <div className="hidden md:block w-60 shrink-0 glass-panel border-r-0">
          <div className="px-4 py-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/10 animate-pulse shrink-0" />
              <div className="h-4 w-28 rounded bg-white/10 animate-pulse" />
            </div>
          </div>
          <div className="px-3 py-4 space-y-1">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="h-9 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        </div>
        {/* Main content skeleton */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-7 h-7 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
          </div>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />

  // If allowedRoles is set, deny when profile is null (load failed) OR role not in list.
  // Previous: `profile &&` short-circuited to pass-through when profile was null —
  // a null profile after loading could bypass role-restricted pages.
  if (allowedRoles && (!profile || !allowedRoles.includes(profile.role as UserRole))) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

// Shorthand guard for rendering content conditionally by role
export function RoleGuard({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { profile } = useAuth()
  if (!profile || !roles.includes(profile.role as UserRole)) return null
  return <>{children}</>
}
