// Global one-tap attendance punch: a header button (desktop) + a floating button
// (mobile), both driving one shared selfie-capture modal. GPS + selfie only — no AWS.
import { createContext, useContext, useState, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/shared/Toast'
import { Sym } from '@/components/shared/Sym'
import { usePunch, useTodayPunches, useAttendanceSettings } from '@/hooks/useAttendance'
import { PlainCapture } from '@/pages/attendance/PlainCapture'

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation is not supported on this device'))
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
  })
}

interface QuickPunchCtx { open: () => void; label: string; punchedIn: boolean; ready: boolean }
const Ctx = createContext<QuickPunchCtx | null>(null)
export const useQuickPunch = () => useContext(Ctx)

export function QuickPunchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { data: settings } = useAttendanceSettings()
  const { data: today = [] } = useTodayPunches(user?.id)
  const punch = usePunch()
  const [modal, setModal] = useState(false)
  const [busy, setBusy] = useState(false)

  const punchedIn = today.length % 2 === 1        // odd count → currently punched in
  const label = punchedIn ? 'Punch Out' : 'Punch In'

  const doPunch = async (selfiePath: string | null) => {
    try {
      setBusy(true)
      const pos = await getPosition()
      const res = await punch.mutateAsync({
        lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy,
        selfiePath, device: navigator.userAgent.slice(0, 120), faceMatched: null, faceScore: null,
      })
      toast.success(
        res.is_field ? 'Punched (field)' : res.within_fence ? 'Punched at office' : 'Punched',
        `${res.distance_m} m from office`,
      )
    } catch (e: any) {
      const msg = e?.code === 1 ? 'Location is blocked — allow it and retry.'
        : e?.code === 2 ? 'Location unavailable — turn on GPS and retry.'
        : e?.code === 3 ? 'Location timed out — move to an open area and retry.'
        : e?.message ?? 'Could not punch'
      toast.error('Punch failed', msg)
    } finally {
      setBusy(false)
    }
  }

  const onPhoto = async (b64: string) => {
    if (!user) return
    try {
      setBusy(true)
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      const path = `${user.id}/${new Date().toISOString().slice(0, 10)}/${Date.now()}.jpg`
      const { error } = await supabase.storage.from('attendance').upload(path, bytes, { contentType: 'image/jpeg' })
      if (error) throw error
      setModal(false)
      await doPunch(path)
    } catch (e: any) {
      toast.error('Punch failed', e?.message ?? 'Could not save the selfie — try again.')
    } finally {
      setBusy(false)
    }
  }

  const start = () => {
    if (!user) return
    if (settings?.selfie_required) setModal(true)
    else doPunch(null)
  }

  return (
    <Ctx.Provider value={{ open: start, label, punchedIn, ready: !!user && (settings as any)?.punch_source !== 'device' }}>
      {children}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5">
            <h2 className="font-display font-semibold text-brand-950 text-center mb-1">Take your selfie</h2>
            <p className="text-xs text-muted-foreground text-center mb-3">Center your face and tap Capture.</p>
            <PlainCapture busy={busy} label="Capture & Punch" onCapture={onPhoto} onCancel={() => { setModal(false); setBusy(false) }} />
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

/** A — compact Punch button in the top header (desktop). */
export function QuickPunchHeaderButton() {
  const qp = useQuickPunch()
  if (!qp?.ready) return null
  return (
    <button onClick={qp.open} title="Punch attendance"
      className="hidden md:inline-flex items-center gap-1.5 bg-white/90 hover:bg-white text-brand-700 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors">
      <Sym name="fingerprint" size={15} /> {qp.label}
    </button>
  )
}

/** B — floating Punch button on phones (thumb-reachable, bottom-right). */
export function QuickPunchFab() {
  const qp = useQuickPunch()
  if (!qp?.ready) return null
  return (
    <button onClick={qp.open} aria-label={`Punch attendance — ${qp.label}`}
      className="md:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-lg flex flex-col items-center justify-center active:scale-95 transition-transform">
      <Sym name="fingerprint" size={24} />
      <span className="text-[9px] font-semibold leading-none mt-0.5">{qp.punchedIn ? 'Out' : 'In'}</span>
    </button>
  )
}
