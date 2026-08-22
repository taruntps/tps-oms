// Core Platform — Auth public API.
// Re-exports the existing V1 implementations (no code moved yet). Consumers can
// import from `@/core/auth` while the impl still lives at its current path.
export { AuthProvider, useAuth } from '@/contexts/AuthContext'
// Session handling: absolute 6h cap from login (see IdleTimeout) + once-per-day 2FA.
export { IdleTimeout } from '@/components/shared/IdleTimeout'
export { TWOFA_TTL_MS, SESSION_MS, twofaKey, loginAtKey } from '@/core/auth/session'
