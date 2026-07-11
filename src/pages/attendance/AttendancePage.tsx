import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/shared/Toast'
import {
  useAttendanceSettings, useTodayPunches, useMyAttendanceDays, usePunch, useTeamToday,
} from '@/hooks/useAttendance'
import { PlainCapture } from './PlainCapture'
import { FaceScanRing } from './FaceScanRing'
import { useEnrollFace, useVerifiedPunch, useResetFace } from '@/hooks/useFaceVerify'

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

  const enrollFace = useEnrollFace()
  const verifiedPunch = useVerifiedPunch()
  const resetFace = useResetFace()
  const faceOn = !!(settings as any)?.face_match_required
  const [mode, setMode] = useState<null | 'enroll' | 'punch' | 'selfie'>(null)

  // Clear my stored face and immediately re-scan (new phone / changed appearance).
  const reRegisterMyFace = async () => {
    if (!window.confirm('Re-register your face? Your current face data is cleared and you scan again now.')) return
    try {
      await resetFace.mutateAsync({})
      setMode('enroll')
    } catch (e: any) {
      toast.error('Could not reset', e?.message ?? 'Try again')
    }
  }

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
  const doPunch = async (selfiePath?: string | null, faceMatched?: boolean | null, faceScore?: number | null) => {
    try {
      setBusy(true)
      const pos = await getPosition()
      const res = await punch.mutateAsync({
        lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy,
        selfiePath, device: navigator.userAgent.slice(0, 120),
        faceMatched: faceMatched ?? null, faceScore: faceScore ?? null,
      })
      toast.success(
        res.is_field ? 'Punched (field)' : res.within_fence ? 'Punched at office' : 'Punched',
        `Accuracy-checked · ${res.distance_m} m from office`
      )
    } catch (e: any) {
      const msg = e?.code === 1 ? 'Location is blocked for this site. Allow it (see the help below the button), then retry.'
        : e?.code === 2 ? 'Location unavailable — turn on GPS / location services and retry.'
        : e?.code === 3 ? 'Location timed out — move to an open area and retry.'
        : e?.message ?? 'Could not punch'
      toast.error('Punch failed', msg)
    } finally {
      setBusy(false)
    }
  }

  const onPunchClick = () => {
    if (faceOn) setMode('punch')                    // server-side face verification
    else if (settings?.selfie_required) setMode('selfie')  // photo record, no match
    else doPunch(null)                              // plain GPS/time punch
  }

  // Upload a base64 selfie to the attendance bucket (photo-only mode, no face match).
  const uploadSelfieB64 = async (b64: string): Promise<string | null> => {
    if (!user) return null
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const path = `${user.id}/${new Date().toISOString().slice(0, 10)}/${Date.now()}.jpg`
    const { error } = await supabase.storage.from('attendance').upload(path, bytes, { contentType: 'image/jpeg' })
    if (error) throw error
    return path
  }

  // PlainCapture hands back a base64 JPEG (no on-device face engine — cannot hang).
  const onPhoto = async (b64: string) => {
    if (!user) return
    try {
      setBusy(true)

      if (mode === 'selfie') {                      // photo record only
        const path = await uploadSelfieB64(b64)
        setMode(null)
        await doPunch(path)
        return
      }

      if (mode === 'enroll') {                       // one-time face registration
        await enrollFace.mutateAsync({ photo: b64 })
        toast.success('Face registered', 'Now punching…')
        setMode('punch')                             // reopen capture to actually punch
        setBusy(false)
        return
      }

      // mode === 'punch' with face verification: the edge function matches + records.
      const pos = await getPosition()
      const res = await verifiedPunch.mutateAsync({
        photo: b64,
        gps: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
      })
      if (res.needs_enrollment) {                    // first ever punch → enrol first
        toast.success('One-time face setup', 'Scan your face to register, then punch.')
        setMode('enroll'); setBusy(false)
        return
      }
      if (res.needs_retake) {                        // bad photo → keep modal open, ask again
        toast.error('Please retake', res.reason ?? 'Center your face and try again.')
        setBusy(false)
        return
      }
      setMode(null)
      if (res.status === 'verified') toast.success('Punched ✓', 'Face verified')
      else if (res.status === 'no_match') toast.error('Punched — face not matched', 'Recorded & flagged for HR review')
      else toast.success('Punched', 'Recorded (verification temporarily skipped)')
    } catch (e: any) {
      const msg = e?.code === 1 ? 'Location is blocked for this site — allow it (see help below) and retry.'
        : e?.code === 2 ? 'Location unavailable — turn on GPS and retry.'
        : e?.code === 3 ? 'Location timed out — move to an open area and retry.'
        : e?.message ?? 'Could not punch'
      toast.error('Punch failed', msg)
    } finally {
      if (mode !== 'enroll') setBusy(false)
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
          {faceOn && (
            <>
              <p className="text-[11px] text-white/55 mt-1 flex items-center justify-center gap-1">
                <Sym name="face" size={12} /> Face verification is on. Your first punch registers your face (one-time).
              </p>
              <button onClick={reRegisterMyFace} disabled={resetFace.isPending}
                className="mt-2 text-[11px] text-white/70 hover:text-white underline underline-offset-2 inline-flex items-center gap-1 disabled:opacity-50">
                <Sym name="restart_alt" size={12} /> {resetFace.isPending ? 'Resetting…' : 'Re-register my face'}
              </button>
            </>
          )}
        </div>

        {/* Permissions help */}
        <details className="bg-white/10 border border-white/15 rounded-xl text-white/80 text-xs">
          <summary className="cursor-pointer select-none px-4 py-3 flex items-center gap-2 font-medium">
            <Sym name="help" size={14} /> Camera / Location not asking? Tap here
          </summary>
          <div className="px-4 pb-4 space-y-2 text-white/70 leading-relaxed">
            <p>The first time you punch, your browser asks to allow <strong>Location</strong>{settings?.selfie_required && ' and Camera'}. Tap <strong>Allow</strong>. If you tapped “Don’t Allow” earlier, the browser won’t ask again — you must re-enable it:</p>
            <p><strong>iPhone (Safari):</strong> tap the <strong>“ぁあ / AA”</strong> icon at the left of the address bar → <strong>Website Settings</strong> → set <strong>Camera</strong> &amp; <strong>Location</strong> to <strong>Allow</strong> → reload. Also ensure Settings ▸ Safari ▸ Camera/Location aren’t set to Deny, and Settings ▸ Privacy ▸ Location ▸ Safari is On.</p>
            <p><strong>Android (Chrome):</strong> tap the <strong>🔒 lock</strong> icon → <strong>Permissions</strong> → allow <strong>Camera</strong> &amp; <strong>Location</strong> → reload.</p>
            <p><strong>Desktop:</strong> click the <strong>🔒 lock</strong> / camera icon in the address bar → allow Camera &amp; Location → reload. (Desktop GPS is approximate — punch from a phone.)</p>
          </div>
        </details>

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
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-white text-sm">Team — Today ({teamRows.length} punched in)</h3>
              <Link to="/attendance/photos" className="text-xs text-white/80 hover:text-white flex items-center gap-1">
                <Sym name="photo_camera" size={13} /> Punch photos
              </Link>
            </div>
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

      {mode && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5">
            <h2 className="font-display font-semibold text-brand-950 text-center mb-1">
              {mode === 'enroll' ? 'Register your face' : mode === 'selfie' ? 'Take your selfie' : 'Face verification'}
            </h2>
            <p className="text-xs text-muted-foreground text-center mb-3">
              {mode === 'enroll' ? 'One-time setup — follow the prompts to scan your face.'
                : 'Center your face and tap Capture.'}
            </p>
            {mode === 'enroll' ? (
              <FaceScanRing
                onDone={() => { toast.success('Face registered ✓', 'Now punching…'); setMode('punch') }}
                onCancel={() => { setMode(null); setBusy(false) }}
              />
            ) : (
              <PlainCapture
                busy={busy}
                label={mode === 'selfie' ? 'Capture & Punch' : 'Capture & Punch'}
                onCapture={onPhoto}
                onCancel={() => { setMode(null); setBusy(false) }}
              />
            )}
          </div>
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
