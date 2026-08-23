import { useMemo, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Sym } from '@/components/shared/Sym'
import { IdleTimeout } from '@/components/shared/IdleTimeout'
import { GreetingModal } from '@/components/shared/GreetingModal'
import { QuickPunchProvider, QuickPunchFab } from '@/components/attendance/QuickPunch'
import { useAuth } from '@/contexts/AuthContext'
import { useDesktopNotifications } from '@/hooks/useDesktopNotifications'
import { useTheme } from '@/hooks/useTheme'
import { TwoFactorGate } from '@/components/auth/TwoFactorGate'
import { twofaDayKey, istDateStr } from '@/core/auth/session'

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const uid = user?.id ?? ''
  // Apply the saved/default shell theme app-wide (moved here from the dashboard,
  // which now paints its own light canvas). Keeps everyone's chosen theme intact.
  useTheme()
  // Bumping this re-checks the localStorage 2FA record after a fresh verification.
  const [twofaVer, setTwofaVer] = useState(0)

  // Single listening instance: turns new in-app notifications into desktop pop-ups
  // (default on) and requests permission once. Clicking a pop-up opens Notifications.
  useDesktopNotifications({ listen: true, onOpen: () => navigate('/notifications') })

  // Opt-in login 2FA: require an SMS/email OTP once per IST calendar day per device.
  // Computed SYNCHRONOUSLY from localStorage (not a delayed effect) so a verified device
  // never flashes the gate — which would fire (and bill) a spurious OTP on hard refresh.
  const twofaOk = useMemo(() => {
    if (!uid) return true // auth still loading — don't gate (and don't send) yet
    return localStorage.getItem(twofaDayKey(uid)) === istDateStr()
  }, [uid, twofaVer])

  if (profile?.twofa_enabled && !twofaOk) {
    return (
      <TwoFactorGate
        onVerified={() => {
          localStorage.setItem(twofaDayKey(uid), istDateStr())
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
      {/* Once-per-login welcome + daily thought */}
      <GreetingModal />
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
