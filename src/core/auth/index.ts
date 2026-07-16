// Core Platform — Auth public API.
// Re-exports the existing V1 implementations (no code moved yet). Consumers can
// import from `@/core/auth` while the impl still lives at its current path.
export { AuthProvider, useAuth } from '@/contexts/AuthContext'
export { useIdleLogout } from '@/hooks/useIdleLogout'
