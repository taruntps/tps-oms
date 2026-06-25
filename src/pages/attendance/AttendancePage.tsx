import { useState, useRef, useEffect } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/shared/Toast'
import {
  useAttendanceSettings, useTodayPunches, useMyAttendanceDays, usePunch, useTeamToday,
} from '@/hooks/useAttendance'

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' })
const fmtMins = (m?: number | null) => m == null ? '—' : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`

// Browser geolocation as a promise (triggers the location permission prompt).
function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation is not supported on this device'))
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 20000, maximumAge: 0,
    })
  })
}

export default function AttendancePage() {
  const { user, profile } = useAuth()
  const canSeeTeam = ['super_admin','director','manager','hr'].includes(profile?.role ?? '')
  const { data: team = [] } = useTeamToday()
  const { data: settings } = useAttendanceSettings()
  const { data: today = [] } = useTodayPunches(user?.id)
  const { data: days = [] } = useMyAttendanceDays(user?.id)
  const punch = usePunch()
  const [busy, setBusy] = useState(false)

  // Camera modal state
  const [camOpen, setCamOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const firstIn = today[0]
  const lastPunch = today[today.length - 1]
  const expectedStart = settings?.expected_start_time?.slice(0, 5)
  const isLate = firstIn && expectedStart ? fmtTime(firstIn.punch_at) > expectedStart : false

  const teamRows = canSeeTeam ? Object.values(
    (team as any[]).reduce((acc: any, p: any) => {
      (acc[p.user_id] ??= { name: p.profiles?.name, code: p.profiles?.employee_code, punches: [] }).punches.push(p)
      return acc
    }, {})
  ) as { name: string; code: string; punches: any[] }[] : []

  // ── Core punch (geolocation + RPC) ──────────────────────────────────────────
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
      const msg = e?.code === 1 ? 'Location permission denied — allow location for this site and retry.'
        : e?.code === 2 ? 'Location unavailable — turn on GPS/location services.'
        : e?.code === 3 ? 'Location timed out — move to an open area and retry.'
        : e?.message ?? 'Could not punch'
      toast.error('Punch failed', msg)
    } finally {
      setBusy(false)
    }
  }

  const onPunchClick = () => {
    if (settings?.selfie_required) openCamera()
    else doPunch(null)
  }

  // ── Camera (getUserMedia) ───────────────────────────────────────────────────
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      streamRef.current = stream
      setCamOpen(true)
    } catch (e: any) {
      const msg = e?.name === 'NotAllowedError' ? 'Camera permission denied — allow camera access and retry.'
        : e?.name === 'NotFoundError' ? 'No camera found on this device.'
        : e?.message ?? 'Could not open the camera'
      toast.error('Camera error', msg)
    }
  }

  // Attach the stream to the <video> once the modal is mounted.
  useEffect(() => {
    if (camOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [camOpen])

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCamOpen(false)
  }
  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  const captureAndPunch = async () => {
    const video = videoRef.current
    if (!video || !user) return
    try {
      setBusy(true)
      // snapshot the current frame, downscaled to ~480px
      const max = 480
      const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight))
      const c = document.createElement('canvas')
      c.width = Math.round(video.videoWidth * scale); c.height = Math.round(video.videoHeight * scale)
      c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height)
      const blob: Blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Capture failed')), 'image/jpeg', 0.6))
      stopCamera()

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
            <button onClick={onPunchClick} disabled={busy}
              className="w-36 h-36 rounded-full bg-white/15 border-2 border-white/40 hover:bg-white/25 transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-60">
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
              <Sym name="photo_camera" size={12} /> A selfie (camera) is required at each punch.
            </p>
          )}
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

        {/* Team — Today (managers/HR/admin) */}
        {canSeeTeam && (
          <div>
            <h3 className="font-display font-semibold text-white text-sm mb-3">Team — Today ({teamRows.length} punched in)</h3>
            {teamRows.length === 0 ? (
              <div className="glass-panel rounded-xl border-dashed !border-white/20 p-6 text-center">
                <p className="text-sm text-white/60">No one has punched in yet today.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#F8FAFC] border-b border-border">
                    <tr>{['Emp ID','Name','First In','Last Punch','Punches','Status'].map(h =>
                      <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {teamRows.map(r => {
                      const first = r.punches[0], last = r.punches[r.punches.length - 1]
                      const ok = last.within_fence || last.is_field
                      return (
                        <tr key={r.code ?? r.name} className="hover:bg-[#F8FAFC]">
                          <td className="px-4 py-2 font-mono text-xs text-brand-700">{r.code ?? '—'}</td>
                          <td className="px-4 py-2 text-brand-950 font-medium">{r.name}</td>
                          <td className="px-4 py-2 font-mono text-xs">{fmtTime(first.punch_at)}</td>
                          <td className="px-4 py-2 font-mono text-xs">{fmtTime(last.punch_at)}</td>
                          <td className="px-4 py-2 text-muted-foreground">{r.punches.length}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {last.is_field ? 'Field' : ok ? 'At office' : 'Off-site'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
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

      {/* Camera capture modal */}
      {camOpen && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm bg-black rounded-2xl overflow-hidden shadow-2xl">
            <video ref={videoRef} playsInline muted className="w-full aspect-[3/4] object-cover bg-black" />
            <div className="flex items-center justify-between gap-3 p-4 bg-[#111]">
              <button onClick={stopCamera} className="px-4 py-2 text-sm border border-white/20 text-white rounded-lg hover:bg-white/10">Cancel</button>
              <button onClick={captureAndPunch} disabled={busy}
                className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {busy ? <Sym name="progress_activity" size={16} className="animate-spin" /> : <Sym name="photo_camera" size={16} />}
                Capture &amp; Punch
              </button>
            </div>
          </div>
          <p className="text-white/60 text-xs mt-3">Center your face, then Capture &amp; Punch.</p>
        </div>
      )}
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
