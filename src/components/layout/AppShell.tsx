import { useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Sym } from '@/components/shared/Sym'
import { IdleTimeout } from '@/components/shared/IdleTimeout'
import { QuickPunchProvider, QuickPunchFab } from '@/components/attendance/QuickPunch'
import { useAuth } from '@/contexts/AuthContext'
import { TwoFactorGate } from '@/components/auth/TwoFactorGate'
import { TWOFA_TTL_MS, twofaKey } from '@/core/auth/session'

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { profile, user } = useAuth()
  const uid = user?.id ?? ''
  // Bumping this re-checks the localStorage 2FA record after a fresh verification.
  const [twofaVer, setTwofaVer] = useState(0)

  // Opt-in login 2FA: require an SMS/email OTP once per day per device. Computed
  // SYNCHRONOUSLY from localStorage (not a delayed effect) so a verified device never
  // flashes the gate — which would fire (and bill) a spurious OTP on hard refresh.
  const twofaOk = useMemo(() => {
    if (!uid) return true // auth still loading — don't gate (and don't send) yet
    const until = Number(localStorage.getItem(twofaKey(uid)))
    return !!until && until > Date.now()
  }, [uid, twofaVer])

  if (profile?.twofa_enabled && !twofaOk) {
    return (
      <TwoFactorGate
        onVerified={() => {
          localStorage.setItem(twofaKey(uid), String(Date.now() + TWOFA_TTL_MS))
          setTwofaVer(v => v + 1)
        }}
      />
    )
  }

  return (
    <QuickPunchProvider>
    <div className="flex h-screen overflow-hidden">
      {/* Session cap: 5-min warning + 6-hour auto sign-out from login */}
      <IdleTimeout />
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-60 h-full">
            <Sidebar />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 text-white/70 hover:text-white z-10"
            >
              <Sym name="close" size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Main content (transparent so the mesh-gradient body shows through) */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Mobile top strip with hamburger */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 glass-panel sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-white"
          >
            <Sym name="menu" size={22} />
          </button>
          <span className="text-white font-display font-semibold text-sm">TPS Portal</span>
        </div>

        <Outlet />
      </main>
      <QuickPunchFab />
    </div>
    </QuickPunchProvider>
  )
}
