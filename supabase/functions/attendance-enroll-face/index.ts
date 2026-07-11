import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { rekognition } from '../_shared/rekognition.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: userData } = await supa.auth.getUser(authHeader.replace('Bearer ', ''))
    const uid = userData?.user?.id
    if (!uid) return json({ error: 'Not signed in' }, 401)

    const { photo, targetUserId } = await req.json() as { photo: string; targetUserId?: string }
    if (!photo) return json({ error: 'No photo' }, 400)

    // Admins may enroll on behalf of another user; others only themselves.
    let subject = uid
    if (targetUserId && targetUserId !== uid) {
      const { data: me } = await supa.from('profiles').select('role').eq('id', uid).single()
      if (!['super_admin', 'director', 'manager'].includes(me?.role ?? '')) return json({ error: 'Not allowed' }, 403)
      subject = targetUserId
    }

    // Validate exactly one clear face before enrolling.
    const det = await rekognition('DetectFaces', { Image: { Bytes: photo }, Attributes: ['DEFAULT'] })
    const faces = det.FaceDetails ?? []
    if (faces.length === 0) return json({ error: 'No face detected — retake in good light.' }, 422)
    if (faces.length > 1) return json({ error: 'Multiple faces — only your face should be in frame.' }, 422)
    if ((faces[0].Confidence ?? 0) < 90) return json({ error: 'Face unclear — retake closer, in good light.' }, 422)

    const bytes = Uint8Array.from(atob(photo), c => c.charCodeAt(0))
    const { error: upErr } = await supa.storage.from('face-refs')
      .upload(`${subject}/reference.jpg`, bytes, { contentType: 'image/jpeg', upsert: true })
    if (upErr) return json({ error: upErr.message }, 500)
    return json({ ok: true })
  } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500) }
})
