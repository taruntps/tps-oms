import { useState, useRef, useEffect } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/shared/Toast'
import {
  useAttendanceSettings, useTodayPunches, useMyAttendanceDays, usePunch, useTeamToday,
} from '@/hooks/useAttendance'
import { FaceCapture } from './FaceCapture'
import { useFaceEnrollment, useSaveFaceEnrollment } from '@/hooks/useFaceEnrollment'
import { averageDescriptors, similarity, preloadFaceEngine } from '@/lib/faceEngine'

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

  const { data: enrollment } = useFaceEnrollment(user?.id)
  const saveEnroll = useSaveFaceEnrollment()
  const faceOn = !!(settings as any)?.face_match_required
  const threshold = Number((settings as any)?.face_match_threshold ?? 0.5)
  const [mode, setMode] = useState<null | 'enroll' | 'punch'>(null)
  const enrollFrames = useRef<number[][]>([])

  // Warm the face engine in the background as soon as we know face-match is on,
  // so the first capture doesn't pay the model-load + shader-compile cost (~5-8s).
  useEffect(() => { if (faceOn) preloadFaceEngine() }, [faceOn])

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
    if (faceOn) {
      if (!enrollment?.enrolled) { enrollFrames.current = []; setMode('enroll') }
      else setMode('punch')
    } else if (settings?.selfie_required) {
      setMode('punch')          // legacy selfie path: capture, no match
    } else {
      doPunch(null)
    }
  }

  const uploadSelfie = async (canvas: HTMLCanvasElement): Promise<string | null> => {
    if (!user) return null
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob(b => b ? res(b) : rej(new Error('Capture failed')), 'image/jpeg', 0.6))
    const path = `${user.id}/${new Date().toISOString().slice(0, 10)}/${Date.now()}.jpg`
    const { error } = await supabase.storage.from('attendance').upload(path, blob, { contentType: 'image/jpeg' })
    if (error) throw error
    return path
  }

  const onCapture = async ({ canvas, descriptor }: { canvas: HTMLCanvasElement; descriptor: number[] }) => {
    if (!user) return
    try {
      setBusy(true)
      if (mode === 'enroll') {
        enrollFrames.current.push(descriptor)
        if (enrollFrames.current.length < 3) {
          setBusy(false)
          toast.success(`Captured ${enrollFrames.current.length}/3`, 'Hold still for the next shot')
          return // keep the modal open for the next frame
        }
        await saveEnroll.mutateAsync({ userId: user.id, descriptor: averageDescriptors(enrollFrames.current) })
        setMode(null); setBusy(false)
        toast.success('Face enrolled', 'You can now punch with face verification')
        return
      }
      // mode === 'punch'
      let faceMatched: boolean | null = null, faceScore: number | null = null
      if (faceOn && enrollment?.descriptor) {
        faceScore = Number(similarity(descriptor, enrollment.descriptor).toFixed(4))
        faceMatched = faceScore >= threshold
        if (!faceMatched) {
          setBusy(false)
          toast.error('Face did not match', 'Try again in better light, facing the camera.')
          return // keep modal open to retry
        }
      }
      const path = await uploadSelfie(canvas)
      setMode(null)
      await doPunch(path, faceMatched, faceScore)
    } catch (e: any) {
      toast.error('Punch failed', e.message); setBusy(false)
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
            <p className="text-[11px] text-white/55 mt-1 flex items-center justify-center gap-1">
              <Sym name="face" size={12} />
              {enrollment?.enrolled ? 'Face verification is on at each punch.' : 'First punch will enrol your face.'}
            </p>
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

      {mode && (
        <FaceCapture
          title={mode === 'enroll' ? `Enrol your face (${enrollFrames.current.length}/3) — center one face` : 'Center your face, then Punch'}
          actionLabel={mode === 'enroll' ? 'Capture' : 'Capture & Punch'}
          busy={busy}
          onCapture={onCapture}
          onCancel={() => { setMode(null); setBusy(false) }}
        />
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
