import { useState, useRef } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/shared/Toast'
import {
  useAttendanceSettings, useTodayPunches, useMyAttendanceDays, usePunch,
} from '@/hooks/useAttendance'

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' })
const fmtMins = (m?: number | null) => m == null ? '—' : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`

// Browser geolocation as a promise.
function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported on this device'))
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 15000, maximumAge: 0,
    })
  })
}

// Downscale an image file to ~480px JPEG (~80 KB) for the selfie.
function downscale(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const max = 480
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      c.toBlob(b => b ? resolve(b) : reject(new Error('Image processing failed')), 'image/jpeg', 0.6)
    }
    img.onerror = () => reject(new Error('Could not read image'))
    img.src = URL.createObjectURL(file)
  })
}

export default function AttendancePage() {
  const { user } = useAuth()
  const { data: settings } = useAttendanceSettings()
  const { data: today = [] } = useTodayPunches(user?.id)
  const { data: days = [] } = useMyAttendanceDays(user?.id)
  const punch = usePunch()
  const selfieRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const firstIn = today[0]
  const lastPunch = today[today.length - 1]
  const expectedStart = settings?.expected_start_time?.slice(0, 5)
  const isLate = firstIn && expectedStart
    ? fmtTime(firstIn.punch_at) > expectedStart   // HH:MM string compare (IST)
    : false

  const doPunch = async (selfiePath?: string | null) => {
    try {
      setBusy(true)
      const pos = await getPosition()
      const res = await punch.mutateAsync({
        lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy,
        selfiePath, device: navigator.userAgent.slice(0, 120),
      })
      toast.success(
        res.is_field ? 'Punched (field)' : res.within_fence ? 'Punched at office' : 'Punched',
        `Accuracy-checked · ${res.distance_m} m from office`
      )
    } catch (e: any) {
      const msg = e?.code === 1 ? 'Location permission denied — please allow location access.'
        : e?.message ?? 'Could not punch'
      toast.error('Punch failed', msg)
    } finally {
      setBusy(false)
    }
  }

  const onPunchClick = () => {
    if (settings?.selfie_required) selfieRef.current?.click()
    else doPunch(null)
  }

  const onSelfie = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file || !user) return
    try {
      setBusy(true)
      const blob = await downscale(file)
      const path = `${user.id}/${new Date().toISOString().slice(0, 10)}/${Date.now()}.jpg`
      const { error } = await supabase.storage.from('attendance').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) throw error
      await doPunch(path)
    } catch (e: any) {
      toast.error('Selfie/punch failed', e.message)
      setBusy(false)
    }
  }

  return (
    <div>
      <TopBar title="Attendance" subtitle="Punch in / out from your phone" />
      <div className="p-6 animate-fade-up space-y-5 max-w-3xl">

        {/* Punch card */}
        <div className="glass-panel-heavy rounded-2xl p-6 text-center">
          <p className="text-white/70 text-sm">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
          <div className="my-5 flex items-center justify-center">
            <button
              onClick={onPunchClick}
              disabled={busy}
              className="w-36 h-36 rounded-full bg-white/15 border-2 border-white/40 hover:bg-white/25 transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-60"
            >
              <Sym name={busy ? 'progress_activity' : 'fingerprint'} size={44} className={`text-white ${busy ? 'animate-spin' : ''}`} />
              <span className="text-white font-semibold text-sm">{busy ? 'Working…' : today.length === 0 ? 'Punch In' : 'Punch'}</span>
            </button>
          </div>
          <div className="flex items-center justify-center gap-6 text-white">
            <Stat label="First In" value={firstIn ? fmtTime(firstIn.punch_at) : '—'} sub={isLate ? 'late' : undefined} />
            <Stat label="Last Punch" value={lastPunch ? fmtTime(lastPunch.punch_at) : '—'} />
            <Stat label="Punches" value={String(today.length)} />
          </div>
          {settings?.selfie_required && (
            <p className="text-[11px] text-white/55 mt-4 flex items-center justify-center gap-1">
              <Sym name="photo_camera" size={12} /> A selfie is required at each punch.
            </p>
          )}
          <input ref={selfieRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onSelfie} />
        </div>

        {/* Today's punches */}
        {today.length > 0 && (
          <div className="bg-white rounded-xl border border-border p-4">
            <h3 className="text-sm font-display font-semibold text-brand-950 mb-2">Today's punches</h3>
            <div className="flex flex-wrap gap-2">
              {today.map((p, i) => (
                <span key={p.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-border bg-[#F8FAFC] font-mono">
                  <Sym name={p.within_fence || p.is_field ? 'check_circle' : 'error'} size={12}
                    className={p.within_fence || p.is_field ? 'text-green-600' : 'text-amber-600'} />
                  {i === 0 ? 'IN ' : i === today.length - 1 ? 'OUT ' : ''}{fmtTime(p.punch_at)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        <div>
          <h3 className="font-display font-semibold text-white text-sm mb-3">Recent attendance</h3>
          {days.length === 0 ? (
            <div className="glass-panel rounded-xl border-dashed !border-white/20 p-8 text-center">
              <p className="text-sm text-white/60">No attendance recorded yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#F8FAFC] border-b border-border">
                  <tr>{['Date','First In','Last Out','Hours','Punches'].map(h =>
                    <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {days.map(d => (
                    <tr key={d.work_date} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2 text-brand-950">{fmtDate(d.work_date)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{fmtTime(d.first_in)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{fmtTime(d.last_out)}</td>
                      <td className="px-4 py-2">{fmtMins(d.worked_minutes)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{d.punch_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-lg font-display font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-white/55">{label}{sub && <span className="text-amber-300 ml-1">· {sub}</span>}</p>
    </div>
  )
}
