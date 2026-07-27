// Core Platform — Auth public API.
// Re-exports the existing V1 implementations (no code moved yet). Consumers can
// import from `@/core/auth` while the impl still lives at its current path.
export { AuthProvider, useAuth } from '@/contexts/AuthContext'
// PR3 M3: idle session handling is now a component (13-min warning + 15-min logout).
export { IdleTimeout } from '@/components/shared/IdleTimeout'
