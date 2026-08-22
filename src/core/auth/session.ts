// Core Platform — session/2FA policy constants + storage keys.
// Pure module (no React, no imports) so AuthContext, AppShell and IdleTimeout can all
// share these without an import cycle.

/** Login 2FA is required once per day per device (rolling 24h from last verify). */
export const TWOFA_TTL_MS = 24 * 60 * 60 * 1000

/** Absolute session cap: sign out 6 hours after login, regardless of activity. */
export const SESSION_MS = 6 * 60 * 60 * 1000

/** localStorage key holding the epoch-ms until which this device is 2FA-verified. */
export const twofaKey = (uid: string) => 'twofa_until:' + uid

/** localStorage key holding the login epoch-ms that anchors the 6h session window. */
export const loginAtKey = (uid: string) => 'login_at:' + uid
