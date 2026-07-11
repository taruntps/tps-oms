import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { rekognition } from '../_shared/rekognition.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const mapVerification = (sim: number | null, thr: number) => sim == null ? 'unverified' : sim >= thr ? 'verified' : 'no_match'

/**
 * Quality gate: returns a retake reason string if the punch photo isn't a single,
 * clear, centred, front-facing face; null if it's good. AWS/network errors return
 * null (never block a punch on our infra failing).
 */
async function retakeReason(photo: string): Promise<string | null> {
  try {
    const det = await Promise.race([
      rekognition('DetectFaces', { Image: { Bytes: photo }, Attributes: ['DEFAULT'] }),
      new Promise<null>(r => setTimeout(() => r(null), 6000)),
    ]) as any
    if (det == null) return null                                   // timeout → don't block
    const faces = det.FaceDetails ?? []
    if (faces.length === 0) return 'No face detected — face the camera in good light.'
    if (faces.length > 1) return 'More than one face in frame — only you should be visible.'
    const f = faces[0]
    if ((f.Confidence ?? 0) < 90) return 'Face unclear — move closer, in good light.'
    const bb = f.BoundingBox ?? {}
    const L = bb.Left ?? 0, T = bb.Top ?? 0, W = bb.Width ?? 0, H = bb.Height ?? 0
    const cx = L + W / 2, cy = T + H / 2                            // face centre
    if (W < 0.20 || H < 0.24) return 'Move closer — your face should fill more of the frame.'
    if (cx < 0.30 || cx > 0.70 || cy < 0.24 || cy > 0.74) return 'Center your face in the middle of the frame.'
    if (L < 0.02 || T < 0.02 || L + W > 0.98 || T + H > 0.98) return 'Keep your whole face inside the frame.'
    const p = f.Pose ?? {}
    if (Math.abs(p.Yaw ?? 0) > 22 || Math.abs(p.Pitch ?? 0) > 22) return 'Look straight at the camera.'
    return null
  } catch { return null }                                          // AWS error → don't block
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: userData } = await admin.auth.getUser(token)
    const uid = userData?.user?.id
    if (!uid) return json({ error: 'Not signed in' }, 401)

    const { photo, gps } = await req.json() as { photo: string; gps: { lat: number; lng: number; accuracy: number } }
    if (!photo || !gps) return json({ error: 'Missing photo or location' }, 400)

    const { data: settings } = await admin.from('attendance_settings').select('face_match_threshold').maybeSingle()
    const thresholdPct = Math.round((Number(settings?.face_match_threshold ?? 0.90)) * 100)

    const { data: ref } = await admin.storage.from('face-refs').download(`${uid}/reference.jpg`)
    if (!ref) return json({ ok: false, needs_enrollment: true })

    // Quality gate — reject partial/off-centre/tiny/turned faces (ask for a retake, do NOT record).
    const reason = await retakeReason(photo)
    if (reason) return json({ ok: false, needs_retake: true, reason })

    // Compare against the enrolled reference. Failures never block.
    let similarity: number | null = null
    try {
      const refBytes = new Uint8Array(await ref.arrayBuffer())
      let s = ''; for (let i = 0; i < refBytes.length; i++) s += String.fromCharCode(refBytes[i])
      const refB64 = btoa(s)
      const cmp = await Promise.race([
        rekognition('CompareFaces', { SourceImage: { Bytes: refB64 }, TargetImage: { Bytes: photo }, SimilarityThreshold: 1 }),
        new Promise<null>(r => setTimeout(() => r(null), 8000)),
      ]) as any
      similarity = cmp == null ? null : (cmp.FaceMatches?.[0]?.Similarity ?? 0)
    } catch { similarity = null }   // AWS error → unverified, still allow
    const status = mapVerification(similarity, thresholdPct)

    // Upload the punch photo (service role).
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    const path = `${uid}/${today}/${Date.now()}.jpg`
    await admin.storage.from('attendance').upload(path, Uint8Array.from(atob(photo), c => c.charCodeAt(0)), { contentType: 'image/jpeg', upsert: false })

    // Record the punch AS THE USER (forward their JWT so punch_attendance's auth.uid() is correct).
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: punch, error: punchErr } = await (asUser.rpc as any)('punch_attendance', {
      p_lat: gps.lat, p_lng: gps.lng, p_accuracy: gps.accuracy,
      p_selfie_path: path, p_face_matched: status === 'verified', p_face_score: similarity,
    })
    if (punchErr) return json({ error: punchErr.message }, 500)

    // Persist the richer status onto the row we just created.
    if (punch?.id) await admin.from('attendance_punches').update({ verification_status: status }).eq('id', punch.id)

    return json({ ok: true, status, similarity, punch })
  } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500) }
})
