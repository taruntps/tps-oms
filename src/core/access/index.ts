// Core Platform — Access (roles, guards, granular permissions) public API.
// V1 role guards (unchanged) + the additive grant-based permission hooks (Wave 1).
export { ProtectedRoute, RoleGuard } from '@/components/shared/ProtectedRoute'
export { RoleBasedRedirect } from '@/components/shared/RoleBasedRedirect'
export { useCan, useCanFn, useMyPermissions } from './useCan'
export type { Scope } from './useCan'
