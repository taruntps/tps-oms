# Attendance Face Verification (AWS Rekognition) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify attendance punches with server-side AWS Rekognition face matching so nobody can punch for someone else — without ever running a face engine on the phone (which caused freezes) and without ever blocking a legitimate punch.

**Architecture:** The browser takes a plain camera snapshot (no on-device detection) and sends it to a Supabase Edge Function. The function compares it against the person's enrolled reference face via AWS Rekognition `CompareFaces`, then records the punch through the existing `punch_attendance` RPC with a verification status. On any match failure or AWS error, the punch is still recorded but flagged for review ("allow + flag"). Admins review punches in a new in-portal photo page.

**Tech Stack:** React/Vite/TS · Supabase (Postgres, Storage, Edge Functions/Deno) · AWS Rekognition (ap-south-1) · Vitest.

**Reference spec:** `docs/superpowers/specs/2026-07-11-attendance-face-verification-design.md`

**Existing facts (verified):**
- `punch_attendance(p_lat,p_lng,p_accuracy,p_selfie_path,p_device,p_face_matched,p_face_score)` RPC already exists, handles geofence, returns `{id, within_fence, distance_m, is_field}`, and stores `selfie_path`, `face_matched`, `face_score`.
- `attendance` bucket exists and is private. `attendance_settings` has `face_match_required`, `face_match_threshold`, geofence fields.
- Current `FaceCapture.tsx` uses the on-device Human engine (to be bypassed for a plain snapshot).

---

## File Structure

- `src/lib/attendanceGeo.ts` — **Create.** Pure helpers: `haversineMeters()`, `mapVerification()` (score+threshold → status). Unit-tested.
- `src/lib/attendanceGeo.test.ts` — **Create.** Tests for the pure helpers.
- `src/pages/attendance/PlainCapture.tsx` — **Create.** Camera preview + Capture/Retake button → returns a base64 JPEG. No face engine.
- `src/hooks/useFaceVerify.ts` — **Create.** Client hooks: `useEnrollFace()`, `useVerifiedPunch()` calling the two edge functions.
- `src/pages/attendance/AttendancePage.tsx` — **Modify.** Route punch through the verify flow when `face_match_required` is on; use `PlainCapture`.
- `src/pages/attendance/AttendancePhotosPage.tsx` — **Create.** Admin/HR review browser.
- `src/App.tsx` — **Modify.** Add the `/attendance/photos` route (admin-gated).
- `supabase/functions/attendance-enroll-face/index.ts` — **Create.** Validates + stores reference face.
- `supabase/functions/attendance-verify-punch/index.ts` — **Create.** CompareFaces + record punch.
- `supabase/migrations/075_attendance_verification.sql` — **Create.** `verification_status` column, `face-refs` bucket + policies, threshold migration.

---

## Task 1: Pure geo + verification helpers (TDD)

**Files:**
- Create: `src/lib/attendanceGeo.ts`
- Test: `src/lib/attendanceGeo.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/attendanceGeo.test.ts
import { describe, it, expect } from 'vitest'
import { haversineMeters, mapVerification } from './attendanceGeo'

describe('haversineMeters', () => {
  it('is ~0 for identical points', () => {
    expect(haversineMeters(30.70, 76.71, 30.70, 76.71)).toBeLessThan(1)
  })
  it('computes a known short distance (~111m per 0.001 lat)', () => {
    const d = haversineMeters(30.700, 76.700, 30.701, 76.700)
    expect(d).toBeGreaterThan(100); expect(d).toBeLessThan(125)
  })
})

describe('mapVerification', () => {
  it('verified when similarity >= threshold', () => {
    expect(mapVerification(92, 90)).toBe('verified')
  })
  it('no_match when below threshold', () => {
    expect(mapVerification(80, 90)).toBe('no_match')
  })
  it('unverified when similarity is null (engine/API failure)', () => {
    expect(mapVerification(null, 90)).toBe('unverified')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/attendanceGeo.test.ts`
Expected: FAIL — "Failed to resolve import './attendanceGeo'".

- [ ] **Step 3: Implement the helpers**

```ts
// src/lib/attendanceGeo.ts
export type VerificationStatus = 'verified' | 'no_match' | 'unverified'

/** Great-circle distance between two lat/lng points, in metres. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Rekognition similarity (0–100, or null on failure) + threshold % → status. */
export function mapVerification(similarity: number | null, thresholdPct: number): VerificationStatus {
  if (similarity == null) return 'unverified'
  return similarity >= thresholdPct ? 'verified' : 'no_match'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/attendanceGeo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendanceGeo.ts src/lib/attendanceGeo.test.ts
git commit -m "feat(attendance): pure geo + verification-status helpers"
```

---

## Task 2: Database — verification column, face-refs bucket, threshold migration

**Files:**
- Create: `supabase/migrations/075_attendance_verification.sql`

Apply via the Supabase MCP `apply_migration` tool (project `muxwwvwmephtwghsrzbp`), then save the file to the repo.

- [ ] **Step 1: Write + apply the migration**

```sql
-- 075: attendance face verification support
-- 1. Verification status on each punch
alter table attendance_punches
  add column if not exists verification_status text
  check (verification_status in ('verified','no_match','unverified','none'));

-- 2. Private bucket for one reference face per user
insert into storage.buckets (id, name, public)
  values ('face-refs','face-refs', false)
  on conflict (id) do nothing;

-- 3. RLS on face-refs: a user manages their own; admins read all.
--    (Edge Functions use the service role and bypass these.)
create policy "face_refs_own_rw" on storage.objects for all to authenticated
  using (bucket_id='face-refs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id='face-refs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "face_refs_admin_read" on storage.objects for select to authenticated
  using (bucket_id='face-refs' and has_role('super_admin','director','manager'));

-- 4. Threshold migration: old slider was cosine (0.3–0.8); Rekognition uses %.
--    Reset any legacy (<1.0) value to 0.90 (=90%).
update attendance_settings set face_match_threshold = 0.90
  where face_match_threshold is null or face_match_threshold < 1.0;
```

- [ ] **Step 2: Verify the column + bucket exist**

Run this SQL via MCP `execute_sql`:
```sql
select
  (select count(*) from information_schema.columns
     where table_name='attendance_punches' and column_name='verification_status') as col,
  (select count(*) from storage.buckets where id='face-refs') as bucket,
  (select face_match_threshold from attendance_settings limit 1) as threshold;
```
Expected: `col=1, bucket=1, threshold=0.90`.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/075_attendance_verification.sql
git commit -m "feat(attendance): migration for verification status + face-refs bucket"
```

---

## Task 3: PlainCapture component (no face engine)

**Files:**
- Create: `src/pages/attendance/PlainCapture.tsx`

A camera preview with a **Capture** button that grabs one downscaled JPEG frame and returns it as base64. No detection loop — this is the freeze fix.

- [ ] **Step 1: Implement the component**

```tsx
// src/pages/attendance/PlainCapture.tsx
import { useEffect, useRef, useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'

interface Props {
  onCapture: (jpegBase64: string) => void   // base64 WITHOUT the data: prefix
  onCancel: () => void
  busy?: boolean
  label?: string
}

/** Downscale a video frame to <=480px and return JPEG base64 (~12KB). */
function grab(video: HTMLVideoElement): string {
  const max = 480
  const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(video.videoWidth * scale)
  c.height = Math.round(video.videoHeight * scale)
  c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.6).split(',')[1]
}

export function PlainCapture({ onCapture, onCancel, busy, label = 'Capture' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(s => { stream = s; if (videoRef.current) { videoRef.current.srcObject = s; setReady(true) } })
      .catch(() => { toast.error('Camera blocked', 'Allow camera access, or use password / ask a manager.'); onCancel() })
    return () => { stream?.getTracks().forEach(t => t.stop()) }
  }, [onCancel])

  const shoot = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) { toast.error('Camera not ready', 'Wait a second and try again.'); return }
    onCapture(grab(v))
  }

  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] max-w-xs mx-auto">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      </div>
      <div className="flex gap-2 justify-center">
        <button onClick={onCancel} disabled={busy}
          className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
        <button onClick={shoot} disabled={!ready || busy}
          className="flex items-center gap-1.5 px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
          <Sym name="photo_camera" size={15} /> {busy ? 'Working…' : label}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: "No errors found".

- [ ] **Step 3: Commit**

```bash
git add src/pages/attendance/PlainCapture.tsx
git commit -m "feat(attendance): plain camera snapshot component (no on-device face engine)"
```

---

## Task 4: Enroll-face Edge Function

**Files:**
- Create: `supabase/functions/attendance-enroll-face/index.ts`

Validates the photo has exactly one clear face (Rekognition `DetectFaces`), then stores it at `face-refs/{user_id}/reference.jpg`. Deploy via MCP `deploy_edge_function`.

- [ ] **Step 1: Implement the function**

```ts
// supabase/functions/attendance-enroll-face/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { rekognition } from '../_shared/rekognition.ts'

const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s=200) => new Response(JSON.stringify(b), { status:s, headers:{...cors,'Content-Type':'application/json'} })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: userData } = await supa.auth.getUser(authHeader.replace('Bearer ',''))
    const uid = userData?.user?.id
    if (!uid) return json({ error: 'Not signed in' }, 401)

    const { photo, targetUserId } = await req.json() as { photo: string; targetUserId?: string }
    if (!photo) return json({ error: 'No photo' }, 400)

    // Admins may enroll on behalf of another user; others only themselves.
    let subject = uid
    if (targetUserId && targetUserId !== uid) {
      const { data: me } = await supa.from('profiles').select('role').eq('id', uid).single()
      if (!['super_admin','director','manager'].includes(me?.role ?? '')) return json({ error: 'Not allowed' }, 403)
      subject = targetUserId
    }

    const bytes = Uint8Array.from(atob(photo), c => c.charCodeAt(0))
    const det = await rekognition('DetectFaces', { Image: { Bytes: photo }, Attributes: ['DEFAULT'] })
    const faces = det.FaceDetails ?? []
    if (faces.length === 0) return json({ error: 'No face detected — retake in good light.' }, 422)
    if (faces.length > 1) return json({ error: 'Multiple faces — only your face should be in frame.' }, 422)
    if ((faces[0].Confidence ?? 0) < 90) return json({ error: 'Face unclear — retake closer, in good light.' }, 422)

    const { error: upErr } = await supa.storage.from('face-refs')
      .upload(`${subject}/reference.jpg`, bytes, { contentType:'image/jpeg', upsert:true })
    if (upErr) return json({ error: upErr.message }, 500)
    return json({ ok: true })
  } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500) }
})
```

- [ ] **Step 2: Create the shared Rekognition signer**

```ts
// supabase/functions/_shared/rekognition.ts
// Minimal AWS SigV4 caller for Rekognition (ap-south-1).
// Secrets: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (set in Edge Function secrets).
const REGION = 'ap-south-1'
const SERVICE = 'rekognition'
const enc = new TextEncoder()

async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name:'HMAC', hash:'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(msg))
}
async function sha256hex(msg: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(msg))
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2,'0')).join('')
}

export async function rekognition(action: string, payload: unknown): Promise<any> {
  const akid = Deno.env.get('AWS_ACCESS_KEY_ID')!
  const secret = Deno.env.get('AWS_SECRET_ACCESS_KEY')!
  const host = `${SERVICE}.${REGION}.amazonaws.com`
  const body = JSON.stringify(payload)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')       // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8)
  const target = `RekognitionService.${action}`
  const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`
  const signedHeaders = 'content-type;host;x-amz-date;x-amz-target'
  const canonicalRequest = ['POST','/','',canonicalHeaders,signedHeaders, await sha256hex(body)].join('\n')
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256hex(canonicalRequest)].join('\n')
  const kDate = await hmac(enc.encode('AWS4'+secret), dateStamp)
  const kRegion = await hmac(kDate, REGION)
  const kService = await hmac(kRegion, SERVICE)
  const kSigning = await hmac(kService, 'aws4_request')
  const sigBuf = await hmac(kSigning, stringToSign)
  const signature = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2,'0')).join('')
  const authorization = `AWS4-HMAC-SHA256 Credential=${akid}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(`https://${host}/`, {
    method:'POST',
    headers:{ 'Content-Type':'application/x-amz-json-1.1','X-Amz-Target':target,'X-Amz-Date':amzDate,'Authorization':authorization,'Host':host },
    body,
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.message ?? out.__type ?? `Rekognition ${action} failed (${res.status})`)
  return out
}
```

- [ ] **Step 3: Deploy the function** (via MCP `deploy_edge_function`, name `attendance-enroll-face`, `verify_jwt:false`, include both `index.ts` and `_shared/rekognition.ts`).

- [ ] **Step 4: Set the AWS secrets** — instruct the user (once) to add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in Supabase → Edge Functions → Secrets. Note in the task output that enrollment will 500 until secrets are set.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/attendance-enroll-face supabase/functions/_shared
git commit -m "feat(attendance): enroll-face edge function + AWS SigV4 Rekognition signer"
```

---

## Task 5: Verify-punch Edge Function

**Files:**
- Create: `supabase/functions/attendance-verify-punch/index.ts`

Compares the punch photo to the reference, uploads the punch photo, and records the punch via `punch_attendance` (forwarding the user's JWT so `auth.uid()` is correct). Always records (allow + flag).

- [ ] **Step 1: Implement the function**

```ts
// supabase/functions/attendance-verify-punch/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { rekognition } from '../_shared/rekognition.ts'

const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s=200) => new Response(JSON.stringify(b), { status:s, headers:{...cors,'Content-Type':'application/json'} })
const mapVerification = (sim: number|null, thr: number) => sim==null ? 'unverified' : sim>=thr ? 'verified' : 'no_match'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ','')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: userData } = await admin.auth.getUser(token)
    const uid = userData?.user?.id
    if (!uid) return json({ error:'Not signed in' }, 401)

    const { photo, gps } = await req.json() as { photo:string; gps:{lat:number,lng:number,accuracy:number} }
    if (!photo || !gps) return json({ error:'Missing photo or location' }, 400)

    const { data: settings } = await admin.from('attendance_settings').select('face_match_threshold').maybeSingle()
    const thresholdPct = Math.round((Number(settings?.face_match_threshold ?? 0.90)) * 100)

    // Compare against the enrolled reference (if any). Failures never block.
    let similarity: number | null = null
    const { data: ref } = await admin.storage.from('face-refs').download(`${uid}/reference.jpg`)
    if (!ref) return json({ ok:false, needs_enrollment:true })
    try {
      const refB64 = btoa(String.fromCharCode(...new Uint8Array(await ref.arrayBuffer())))
      const cmp = await Promise.race([
        rekognition('CompareFaces', { SourceImage:{Bytes:refB64}, TargetImage:{Bytes:photo}, SimilarityThreshold:1 }),
        new Promise<null>(r => setTimeout(() => r(null), 8000)),
      ]) as any
      similarity = cmp?.FaceMatches?.[0]?.Similarity ?? (cmp === null ? null : 0)
    } catch { similarity = null }   // AWS error → unverified, still allow
    const status = mapVerification(similarity, thresholdPct)

    // Upload the punch photo (service role).
    const today = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata' }).format(new Date())
    const path = `${uid}/${today}/${Date.now()}.jpg`
    await admin.storage.from('attendance').upload(path, Uint8Array.from(atob(photo), c=>c.charCodeAt(0)), { contentType:'image/jpeg', upsert:false })

    // Record the punch AS THE USER (forward their JWT so punch_attendance's auth.uid() is correct).
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: punch, error: punchErr } = await (asUser.rpc as any)('punch_attendance', {
      p_lat: gps.lat, p_lng: gps.lng, p_accuracy: gps.accuracy,
      p_selfie_path: path, p_face_matched: status==='verified', p_face_score: similarity,
    })
    if (punchErr) return json({ error: punchErr.message }, 500)

    // Persist the richer status onto the row we just created.
    if (punch?.id) await admin.from('attendance_punches').update({ verification_status: status }).eq('id', punch.id)

    return json({ ok:true, status, similarity, punch })
  } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500) }
})
```

- [ ] **Step 2: Deploy** via MCP `deploy_edge_function`, name `attendance-verify-punch`, `verify_jwt:false`, include `index.ts` (the shared signer is already deployed but include it again to be safe).

- [ ] **Step 3: Smoke-test the signer** — with AWS secrets set, POST a tiny known face image and confirm a 200 with `status` in the response (or `needs_enrollment:true` if not enrolled). Document the result.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/attendance-verify-punch
git commit -m "feat(attendance): verify-punch edge function (CompareFaces + allow-and-flag)"
```

---

## Task 6: Client hooks + wire into Attendance page

**Files:**
- Create: `src/hooks/useFaceVerify.ts`
- Modify: `src/pages/attendance/AttendancePage.tsx`

- [ ] **Step 1: Implement the hooks**

```ts
// src/hooks/useFaceVerify.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useEnrollFace() {
  return useMutation({
    mutationFn: async ({ photo, targetUserId }: { photo: string; targetUserId?: string }) => {
      const { data, error } = await supabase.functions.invoke('attendance-enroll-face', { body: { photo, targetUserId } })
      if (error) throw new Error((await (error as any).context?.json?.())?.error ?? error.message)
      if ((data as any)?.error) throw new Error((data as any).error)
      return data
    },
  })
}

export function useVerifiedPunch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ photo, gps }: { photo: string; gps: { lat:number; lng:number; accuracy:number } }) => {
      const { data, error } = await supabase.functions.invoke('attendance-verify-punch', { body: { photo, gps } })
      if (error) throw new Error((await (error as any).context?.json?.())?.error ?? error.message)
      if ((data as any)?.error) throw new Error((data as any).error)
      return data as { ok: boolean; status?: string; needs_enrollment?: boolean }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance_today'] })
      qc.invalidateQueries({ queryKey: ['attendance_days'] })
    },
  })
}
```

- [ ] **Step 2: Wire into `AttendancePage.tsx`** — when `settings.face_match_required` is on: open `PlainCapture`; on capture, read GPS (existing geolocation code) then call `useVerifiedPunch`. If it returns `needs_enrollment`, switch to the enroll flow (`PlainCapture` → `useEnrollFace`) then retry. Show a toast reflecting `status` (verified ✅ / recorded-but-unverified ⚠️). Keep the existing no-verification path unchanged when face-match is off. (Replace the `FaceCapture`/Human usage on this page.)

- [ ] **Step 3: Type-check + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors; existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFaceVerify.ts src/pages/attendance/AttendancePage.tsx
git commit -m "feat(attendance): route punches through server-side verify + enrollment"
```

---

## Task 7: In-portal "Attendance Photos" review page

**Files:**
- Create: `src/pages/attendance/AttendancePhotosPage.tsx`
- Modify: `src/App.tsx` (add admin-gated route `/attendance/photos`)

- [ ] **Step 1: Implement the page** — query recent `attendance_punches` (join profiles for names), for each row create a short-lived signed URL from the `attendance` bucket for `selfie_path`, render cards: name · date · time · thumbnail · status badge (✅ verified / ⚠️ unverified / ❌ no_match) · distance/geofence · a maps link from lat/lng. Filters: staff dropdown, date range, status. Gate to `super_admin/director/manager` via the existing `RoleGuard`.

- [ ] **Step 2: Add the route** in `src/App.tsx` under the authenticated shell, wrapped in `RoleGuard roles={['super_admin','director','manager']}`. Add a sidebar link if appropriate.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: "No errors found".

- [ ] **Step 4: Commit**

```bash
git add src/pages/attendance/AttendancePhotosPage.tsx src/App.tsx
git commit -m "feat(attendance): in-portal punch photo review page (admin/HR)"
```

---

## Task 8: Settings threshold slider + build/deploy/verify

**Files:**
- Modify: `src/pages/settings/AttendanceSettingsSection.tsx`

- [ ] **Step 1: Rework the threshold slider** — change `min={0.80} max={0.98} step={0.01}` (was 0.30–0.80), label "Match strictness — Rekognition similarity ≥ {value*100}%". Default 0.90. Keep the verify-mode control (off / photo / face).

- [ ] **Step 2: Full build + tests**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 3: Commit + push (triggers deploy)**

```bash
git add src/pages/settings/AttendanceSettingsSection.tsx
git commit -m "feat(attendance): threshold slider for Rekognition similarity %"
git push origin main
```

- [ ] **Step 4: Verify the deploy** — `gh run watch` the workflow; confirm the live bundle hash changed. Confirm `face_match_required` is still **OFF** in the DB (safe rollout).

---

## Task 9: Guided rollout (manual, with the user)

Not code — a runbook to run WITH the user once everything is deployed and AWS secrets are set.

- [ ] Confirm AWS secrets are set (enroll a test face → expect success).
- [ ] Enroll each staff member's reference face (admin-supervised via the enroll flow).
- [ ] Turn `face_match_required = ON` for a 1–2 day trial.
- [ ] Watch the Attendance Photos page; adjust threshold if legitimate punches show `no_match` too often.
- [ ] Decide on `face-login` (leave on password, or migrate to the same server-side flow later — tracked as a follow-up).

---

## Notes for the implementer
- **Never block a punch.** Every path in Task 5 must still record via `punch_attendance`. If you find a branch that returns without recording (other than `needs_enrollment` and hard auth failure), it's a bug.
- **No secrets in the frontend.** AWS keys live only in Edge Function secrets.
- **Keep face-match OFF** in the DB until Task 9 — the app must stay usable throughout.
- The old on-device `faceEngine.ts` / Human model can be removed only after confirming nothing imports it (face-login still might — leave it until that's migrated).
