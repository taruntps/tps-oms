import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'

// Security (PR3 M3): sign the user out after 15 min of inactivity, with a warning
// dialog at 13 min giving a 2-minute grace window to stay signed in. Idle logout
// always applies while authenticated (independent of "Remember me").
const WARN_AT_MS = 13 * 60 * 1000   // show warning after 13 min idle
const LOGOUT_AT_MS = 15 * 60 * 1000 // hard sign-out at 15 min idle
const GRACE_SECONDS = Math.round((LOGOUT_AT_MS - WARN_AT_MS) / 1000) // 120s

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

export function IdleTimeout() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()

  const [warning, setWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(GRACE_SECONDS)

  const warnTimer = useRef<number | undefined>(undefined)
  const logoutTimer = useRef<number | undefined>(undefined)
  const countdown = useRef<number | undefined>(undefined)

  const clearAll = useCallback(() => {
    window.clearTimeout(warnTimer.current)
    window.clearTimeout(logoutTimer.current)
    window.clearInterval(countdown.current)
  }, [])

  const doLogout = useCallback(async () => {
    clearAll()
    setWarning(false)
    await signOut()
    toast.info('Signed out', 'You were signed out after 15 minutes of inactivity.')
    navigate('/login')
  }, [clearAll, signOut, navigate])

  // Arm the idle timers from "now". Called on activity while NOT warning.
  const arm = useCallback(() => {
    window.clearTimeout(warnTimer.current)
    window.clearTimeout(logoutTimer.current)
    warnTimer.current = window.setTimeout(() => {
      setSecondsLeft(GRACE_SECONDS)
      setWarning(true)
    }, WARN_AT_MS)
    logoutTimer.current = window.setTimeout(doLogout, LOGOUT_AT_MS)
  }, [doLogout])

  // "Stay signed in" — reset everything and re-arm.
  const stay = useCallback(() => {
    setWarning(false)
    window.clearInterval(countdown.current)
    arm()
  }, [arm])

  // Activity tracking (only while authenticated and not currently warning).
  useEffect(() => {
    if (!session) { clearAll(); return }
    if (warning) return // during the warning, ignore background activity — require an explicit choice

    const onActivity = () => arm()
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    arm()
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity))
      window.clearTimeout(warnTimer.current)
      window.clearTimeout(logoutTimer.current)
    }
  }, [session, warning, arm, clearAll])

  // Countdown while the warning is showing.
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
        <h2 id="idle-title" className="font-display font-semibold text-brand-950 text-lg">Still there?</h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          You've been inactive. For security you'll be signed out in
          <span className="font-semibold text-brand-950 tabular-nums"> {mm}:{ss}</span>.
        </p>
        <div className="flex gap-3 mt-5">
          <button onClick={() => void doLogout()} className="flex-1 px-4 py-2.5 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] text-brand-950">
            Sign out now
          </button>
          <button onClick={stay} autoFocus className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg">
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  )
}
