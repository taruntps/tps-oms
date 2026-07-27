# Core Module (V2)

The **Core** module is the shared platform every feature module depends on. It is the
stable foundation of the V2 modular architecture. Feature modules (`src/modules/*`)
may import from Core; Core must **not** import from any feature module.

## Responsibilities & current mapping

During the V2 migration, code physically stays in its current location (so V1 keeps
working with zero breakage); this file defines the **canonical Core surface** and
where each concern currently lives. Files migrate into `src/core/*` incrementally.

| Core concern | Current location (V1) | Target (V2) |
|---|---|---|
| Authentication / session | `src/contexts/AuthContext.tsx`, `src/lib/supabase.ts`, `src/components/shared/IdleTimeout.tsx` | `src/core/auth/` |
| Users / Roles / Permissions | `src/types/index.ts` (role enums + permission constants), `src/components/shared/ProtectedRoute.tsx`, `RoleBasedRedirect.tsx` | `src/core/access/` |
| Notifications | `src/hooks/useNotifications.ts`, `src/components/layout/NotificationPanel.tsx`, `src/pages/notifications/*` | `src/core/notifications/` |
| File management | `src/hooks/useDrive.ts`, `src/components/shared/DriveTab.tsx`, storage helpers | `src/core/files/` |
| Shared components | `src/components/shared/*` (Toast, Sym, ErrorBoundary, ClockBadge, …), `src/components/layout/*` | `src/core/ui/` |
| Shared hooks | `src/hooks/useTheme.ts`, cross-cutting hooks | `src/core/hooks/` |
| Shared utilities | `src/lib/utils.ts`, `src/lib/projectClock.ts`, `src/data/india.ts` | `src/core/utils/` |

## Migration policy
- Move files into `src/core/*` in small, build-verified commits.
- Keep the `@/…` import alias working throughout (re-export shims where needed) so no
  consumer breaks during the transition.
- Backward compatibility with the shared production database is mandatory.
