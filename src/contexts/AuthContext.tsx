import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, getProfile } from '@/lib/supabase'
import type { UserProfile } from '@/types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  // V2: tracks which user's profile is already loaded so the initial
  // getSession() + onAuthStateChange (and token refreshes) don't each refetch
  // the profile. Eliminates the duplicate `profiles` request seen in doc 18.
  const loadedFor = useRef<string | null>(null)
  // Holds the in-flight profile fetch so concurrent callers (getSession +
  // onAuthStateChange, which race on first load) share ONE load. Without this the
  // second caller early-returned a resolved promise, so `.finally(setLoading(false))`
  // fired while `profile` was still null — bouncing allowedRoles routes to /dashboard
  // on hard refresh/deep-link. Returning the shared promise makes the loading gate
  // wait for the real result.
  const inflight = useRef<Promise<void> | null>(null)

  function loadProfile(userId: string, force = false): Promise<void> {
    if (!force && loadedFor.current === userId) {
      return inflight.current ?? Promise.resolve()
    }
    loadedFor.current = userId
    const p = getProfile(userId)
      .then((pr) => { setProfile(pr as unknown as UserProfile) })
      .catch(() => { setProfile(null); loadedFor.current = null })
    inflight.current = p
    return p
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    try {
      // Reset the 6h session anchor so the next login starts a fresh window.
      Object.keys(localStorage).filter(k => k.startsWith('login_at:')).forEach(k => localStorage.removeItem(k))
      // NOTE: the daily 2FA record (twofa_until:*) is intentionally KEPT so OTP is
      // required only once per day — not on every manual sign-out + re-login.
      // (Legacy per-session flag cleanup.)
      Object.keys(sessionStorage).filter(k => k.startsWith('twofa_ok:')).forEach(k => sessionStorage.removeItem(k))
    } catch { /* ignore */ }
    setSession(null)
    setUser(null)
    setProfile(null)
    loadedFor.current = null
  }

  async function refreshProfile() {
    if (user?.id) await loadProfile(user.id, true)
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
