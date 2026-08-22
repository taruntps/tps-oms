// Core Platform — session/2FA policy constants + storage keys.
// Pure module (no React, no imports) so AuthContext, AppShell and IdleTimeout can all
// share these without an import cycle.

/** Absolute session cap: sign out 6 hours after login, regardless of activity. */
export const SESSION_MS = 6 * 60 * 60 * 1000

/** localStorage key holding the IST calendar date on which this device was 2FA-verified. */
export const twofaDayKey = (uid: string) => 'twofa_day:' + uid

/** localStorage key holding the login epoch-ms that anchors the 6h session window. */
export const loginAtKey = (uid: string) => 'login_at:' + uid

/** Today's date as 'YYYY-MM-DD' in IST (en-CA formats ISO-style). 2FA is required
 *  once per calendar day: a record from an earlier day is stale on the next day. */
export function istDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}
