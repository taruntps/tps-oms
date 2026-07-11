import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { rekognition } from '../_shared/rekognition.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Direction labels for detected head pose. AWS's yaw/pitch sign convention is
// undocumented; these are calibrated on-device. Flip a pair if it reads mirrored.
const YAW_NEG = 'left', YAW_POS = 'right', PITCH_POS = 'up', PITCH_NEG = 'down'

function detectDir(yaw: number, pitch: number): 'center' | 'left' | 'right' | 'up' | 'down' {
  if (Math.abs(yaw) < 12 && Math.abs(pitch) < 12) return 'center'
  if (Math.abs(yaw) >= Math.abs(pitch)) return yaw < 0 ? YAW_NEG : YAW_POS
  return pitch > 0 ? PITCH_POS : PITCH_NEG
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: userData } = await supa.auth.getUser(authHeader.replace('Bearer ', ''))
    const uid = userData?.user?.id
    if (!uid) return json({ error: 'Not signed in' }, 401)

    // reset: delete the reference (self, or admin for another user). Otherwise:
    // want:'center' stores the reference on a good frontal; 'scan' reports the detected
    // direction (to fill the ring); omitted → legacy single-photo enroll.
    const { photo, want, targetUserId, reset } = await req.json() as
      { photo?: string; want?: 'center' | 'scan'; targetUserId?: string; reset?: boolean }

    // Resolve the subject (admins may act on another user; everyone may act on self).
    let subject = uid
    if (targetUserId && targetUserId !== uid) {
      const { data: me } = await supa.from('profiles').select('role').eq('id', uid).single()
      if (!['super_admin', 'director', 'manager'].includes(me?.role ?? '')) return json({ error: 'Not allowed' }, 403)
      subject = targetUserId
    }

    // Reset: clear the stored reference via the Storage API (SQL delete is blocked).
    if (reset) {
      const { error } = await supa.storage.from('face-refs').remove([`${subject}/reference.jpg`])
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, reset: true })
    }

    if (!photo) return json({ error: 'No photo' }, 400)

    const det = await rekognition('DetectFaces', { Image: { Bytes: photo }, Attributes: ['DEFAULT'] })
    const faces = det.FaceDetails ?? []
    if (faces.length === 0) return json({ ok: true, matched: false, reason: 'No face detected — good light please.' })
    if (faces.length > 1) return json({ ok: true, matched: false, reason: 'Only your face should be in frame.' })
    const f = faces[0]
    const yaw = f.Pose?.Yaw ?? 0, pitch = f.Pose?.Pitch ?? 0
    const detected = detectDir(yaw, pitch)

    // Ring-fill scan: report the detected direction, store nothing.
    if (want === 'scan') {
      const moved = Math.abs(yaw) >= 15 || Math.abs(pitch) >= 12
      return json({ ok: true, detected, matched: detected !== 'center' && moved })
    }

    // Center capture (or legacy) → validate a clean, centred, front-facing face, then store the reference.
    if ((f.Confidence ?? 0) < 90) return json({ ok: true, matched: false, reason: 'Face unclear — move closer, good light.' })
    if (detected !== 'center') return json({ ok: true, matched: false, reason: 'Look straight at the camera.' })
    const bb = f.BoundingBox ?? {}
    const L = bb.Left ?? 0, T = bb.Top ?? 0, W = bb.Width ?? 0, H = bb.Height ?? 0
    const cx = L + W / 2, cy = T + H / 2
    if (W < 0.20 || cx < 0.30 || cx > 0.70 || cy < 0.24 || cy > 0.74)
      return json({ ok: true, matched: false, reason: 'Center your face in the frame.' })

    const bytes = Uint8Array.from(atob(photo), c => c.charCodeAt(0))
    const { error: upErr } = await supa.storage.from('face-refs')
      .upload(`${subject}/reference.jpg`, bytes, { contentType: 'image/jpeg', upsert: true })
    if (upErr) return json({ error: upErr.message }, 500)
    return json({ ok: true, matched: true, detected: 'center', savedReference: true })
  } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500) }
})
