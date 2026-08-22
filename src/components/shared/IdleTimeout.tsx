import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { SESSION_MS, loginAtKey } from '@/core/auth/session'

// Absolute session cap: sign the user out 6 hours after login, regardless of activity
// (replaces the old 30-min inactivity timeout). A 5-minute heads-up lets them save work.
// The 6h window is anchored at login and stored in localStorage, so it survives refresh
// and tab-close and cannot be extended by staying active. Manual sign-out ends it early.
const WARN_BEFORE_MS = 5 * 60 * 1000

export function IdleTimeout() {
  const { session, user, signOut } = useAuth()
  const navigate = useNavigate()
  const uid = user?.id ?? ''

  const [warning, setWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  const warnTimer = useRef<number | undefined>(undefined)
  const logoutTimer = useRef<number | undefined>(undefined)
  const countdown = useRef<number | undefined>(undefined)

  // Latest values held in refs → stable doLogout below.
  const signOutRef = useRef(signOut); signOutRef.current = signOut
  const navRef = useRef(navigate); navRef.current = navigate

  const doLogout = useCallback(async () => {
    window.clearTimeout(warnTimer.current)
    window.clearTimeout(logoutTimer.current)
    window.clearInterval(countdown.current)
    setWarning(false)
    // Automatic cap → keep the daily 2FA record so a same-day re-login skips OTP.
    await signOutRef.current({ keepTwofa: true })
    toast.info('Signed out', 'Your 6-hour session has ended. Please sign in again.')
    navRef.current('/login')
  }, [])

  // Arm the warning + logout timers from the login anchor. Re-runs when the session
  // or user changes; does NOT depend on activity, so the deadline is absolute.
  useEffect(() => {
    if (!session || !uid) return
    let loginAt = Number(localStorage.getItem(loginAtKey(uid)))
    if (!loginAt || Number.isNaN(loginAt)) {
      loginAt = Date.now()
      localStorage.setItem(loginAtKey(uid), String(loginAt))
    }
    const deadline = loginAt + SESSION_MS
    const now = Date.now()
    if (now >= deadline) { void doLogout(); return }

    warnTimer.current = window.setTimeout(() => {
      setSecondsLeft(Math.max(1, Math.round((deadline - Date.now()) / 1000)))
      setWarning(true)
    }, Math.max(0, deadline - WARN_BEFORE_MS - now))
    logoutTimer.current = window.setTimeout(() => void doLogout(), deadline - now)

    return () => {
      window.clearTimeout(warnTimer.current)
      window.clearTimeout(logoutTimer.current)
      window.clearInterval(countdown.current)
    }
  }, [session, uid, doLogout])

  // Live countdown while the warning is showing.
  useEffect(() => {
    if (!warning) return
    countdown.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { window.clearInterval(countdown.current); void doLogout(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(countdown.current)
  }, [warning, doLogout])

  if (!warning || !session) return null

  const mm = Math.floor(secondsLeft / 60)
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="idle-title">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-fade-up">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-3">
          <Sym name="schedule" size={26} />
        </div>
        <h2 id="idle-title" className="font-display font-semibold text-brand-950 text-lg">Session ending soon</h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          Your 6-hour session ends in
          <span className="font-semibold text-brand-950 tabular-nums"> {mm}:{ss}</span>. Please save your work — you'll need to sign in again.
        </p>
        <div className="flex gap-3 mt-5">
          <button onClick={() => setWarning(false)} className="flex-1 px-4 py-2.5 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] text-brand-950">
            Dismiss
          </button>
          <button onClick={() => void doLogout()} autoFocus className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg">
            Sign out now
          </button>
        </div>
      </div>
    </div>
  )
}
