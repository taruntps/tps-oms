# Face-Matching Attendance Punch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add on-device 1:1 face verification to the attendance punch — each employee enrols once, every punch must match the enrolled face.

**Architecture:** Client-side `@vladmandic/human` computes a face embedding in the browser (works iOS/Android/desktop, auto WebGPU→WebGL→WASM). The embedding (a number array) is stored on `profiles`; each punch recomputes a live embedding, compares similarity against the enrolled one, and only proceeds on a match. The `punch_attendance` RPC persists the match result and rejects unverified punches when face-match is required. Ships OFF by default.

**Tech Stack:** React + Vite + TypeScript, Supabase (Postgres + RPC + Storage), `@vladmandic/human`, vitest (added for the pure matching helper only).

**Spec:** `docs/superpowers/specs/2026-06-28-face-match-attendance-design.md`

**Verification model:** This repo has no test framework and is verified by `npm run build` + live-DB probe (via Supabase MCP) + manual device test. We add vitest **only** for the pure `similarity()`/threshold helper (genuinely worth unit-testing, cheap). Everything else is verified by build + probe + manual, matching the project's established pattern.

**Conventions (must follow):**
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Commit via `git commit -F /tmp/msg.txt` (apostrophes break heredoc).
- New DB columns lag the generated TS types — use `(supabase.from('x') as any)` / `(x as any)` casts, exactly as `SoiTab.tsx` and `useAuthorityQueries.ts` already do.
- Migrations: create the file under `supabase/migrations/NNN_*.sql` AND apply it to the live DB via the Supabase MCP `apply_migration` tool (project_id `muxwwvwmephtwghsrzbp`). Migration 041 is the latest; new ones start at 042.
- Do NOT deploy until Task 8. Deploy = push to `main` (GitHub Actions → portal.tpsxpert.com).

---

## File Structure

- `supabase/migrations/042_face_match_schema.sql` — new columns on profiles / attendance_settings / attendance_punches (created + applied via MCP).
- `supabase/migrations/043_punch_attendance_face.sql` — extend `punch_attendance` RPC (created + applied via MCP).
- `src/lib/faceEngine.ts` — Human singleton + `getDescriptor()` + pure `similarity()`/`isMatch()`. One responsibility: face math.
- `src/lib/faceEngine.test.ts` — vitest unit tests for the pure helpers.
- `public/models/` — self-hosted Human model files (face detect + description only).
- `src/hooks/useFaceEnrollment.ts` — load current user's enrolment state + save/clear descriptor.
- `src/pages/attendance/FaceCapture.tsx` — shared camera+detect modal used by both enrolment and punch (extracted from the inline camera code in `AttendancePage.tsx`).
- `src/pages/attendance/AttendancePage.tsx` — wire enrolment gate + match-before-punch.
- `src/hooks/useAttendance.ts` — extend `usePunch` to pass face fields; add settings fields.
- `src/pages/settings/AttendanceSettingsSection.tsx` — admin toggle + threshold slider.
- `src/pages/admin/UserManagementPage.tsx` — admin "Reset face enrolment" action.
- `vitest.config.ts`, `package.json` — add vitest + test script.

---

## Task 1: Database schema (columns)

**Files:**
- Create: `supabase/migrations/042_face_match_schema.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 042 — Face-match attendance: enrolment template + settings + per-punch audit.

-- One active face template per employee. Descriptor is a one-way numeric embedding,
-- not a reversible image.
alter table public.profiles
  add column if not exists face_descriptor  jsonb,
  add column if not exists face_enrolled_at timestamptz,
  add column if not exists face_model       text;

-- Admin controls. Ships OFF (dark launch). Threshold = minimum similarity (0..1).
alter table public.attendance_settings
  add column if not exists face_match_required  boolean not null default false,
  add column if not exists face_match_threshold numeric not null default 0.5;

-- Per-punch audit of the verification result.
alter table public.attendance_punches
  add column if not exists face_matched boolean,
  add column if not exists face_score   numeric;
```

- [ ] **Step 2: Apply it to the live DB**

Use the Supabase MCP `apply_migration` tool: `project_id = muxwwvwmephtwghsrzbp`, `name = 042_face_match_schema`, `query =` the SQL above.
Expected: `{"success": true}`.

- [ ] **Step 3: Verify the columns exist**

Use the Supabase MCP `execute_sql` tool:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='profiles' and column_name like 'face_%';
```
Expected: rows `face_descriptor`, `face_enrolled_at`, `face_model`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/042_face_match_schema.sql
git commit -F /tmp/msg.txt   # "feat(db): face-match attendance schema (profiles/settings/punch)"
```

---

## Task 2: Vitest + pure matching helper (TDD)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`, `src/lib/faceEngine.test.ts`, `src/lib/faceEngine.ts`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```
Expected: vitest appears in devDependencies.

- [ ] **Step 2: Add the test script to `package.json`**

In the `"scripts"` block add:

```json
"test": "vitest run"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
```

- [ ] **Step 4: Write the failing test** — `src/lib/faceEngine.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { similarity, isMatch } from './faceEngine'

const a = [0.1, 0.2, 0.3, 0.4]
const aSame = [0.1, 0.2, 0.3, 0.4]
const b = [-0.4, -0.3, 0.9, 0.1]

describe('similarity', () => {
  it('returns ~1 for identical descriptors', () => {
    expect(similarity(a, aSame)).toBeGreaterThan(0.99)
  })
  it('returns lower for different descriptors', () => {
    expect(similarity(a, b)).toBeLessThan(similarity(a, aSame))
  })
  it('returns 0 for mismatched lengths', () => {
    expect(similarity(a, [0.1, 0.2])).toBe(0)
  })
})

describe('isMatch', () => {
  it('passes when similarity >= threshold', () => {
    expect(isMatch(a, aSame, 0.5)).toBe(true)
  })
  it('fails when similarity < threshold', () => {
    expect(isMatch(a, b, 0.99)).toBe(false)
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import './faceEngine'` / `similarity is not exported`.

- [ ] **Step 6: Create `src/lib/faceEngine.ts` with ONLY the pure helpers**

```ts
// Face matching engine. Pure helpers here are unit-tested; the Human-backed
// descriptor extraction (browser-only, WebGL/WASM) is added in Task 3.

/** Cosine similarity in [0,1] (negative clamped to 0). 0 if shapes differ or empty. */
export function similarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (na === 0 || nb === 0) return 0
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb))
  return Math.max(0, cos)
}

/** True when the live descriptor matches the enrolled one at/above threshold. */
export function isMatch(live: number[], enrolled: number[], threshold: number): boolean {
  return similarity(live, enrolled) >= threshold
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 5 tests pass.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/faceEngine.ts src/lib/faceEngine.test.ts
git commit -F /tmp/msg.txt   # "feat(attendance): pure face-similarity helpers + vitest"
```

---

## Task 3: Human engine + self-hosted models

**Files:**
- Modify: `src/lib/faceEngine.ts`
- Create: `public/models/` (model files)

- [ ] **Step 1: Install Human**

```bash
npm install @vladmandic/human
```
Expected: `@vladmandic/human` in dependencies.

- [ ] **Step 2: Copy the required model files into `public/models/`**

Human needs only the face-detect + description models for this feature. Copy them from the installed package's model repo. Run:

```bash
mkdir -p public/models
# Human ships model JSON+bin in the @vladmandic/human-models repo; the npm package
# references them. Download the four files we use into public/models:
for f in blazeface.json blazeface.bin faceres.json faceres.bin; do
  curl -fsSL "https://cdn.jsdelivr.net/npm/@vladmandic/human-models/models/$f" -o "public/models/$f"
done
ls -la public/models
```
Expected: `blazeface.json`, `blazeface.bin`, `faceres.json`, `faceres.bin` present (each non-empty). These are served by Vite from `/models/...` at runtime, so no CDN dependency in production.

- [ ] **Step 3: Append the Human-backed extractor to `src/lib/faceEngine.ts`**

Add below the pure helpers:

```ts
import type Human from '@vladmandic/human'

export const FACE_MODEL = 'human-faceres'

export type DescriptorResult =
  | { ok: true; descriptor: number[] }
  | { ok: false; reason: 'no_face' | 'multiple_faces' | 'low_quality' | 'engine' }

let _human: Human | null = null
let _loading: Promise<Human> | null = null

async function getHuman(): Promise<Human> {
  if (_human) return _human
  if (!_loading) {
    _loading = (async () => {
      const { Human } = await import('@vladmandic/human')
      const h = new (Human as any)({
        modelBasePath: '/models',
        cacheModels: true,
        face: {
          enabled: true,
          detector: { rotation: false, maxDetected: 5, minConfidence: 0.4 },
          description: { enabled: true },
          mesh: { enabled: false }, iris: { enabled: false },
          emotion: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false },
        },
        body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false },
      })
      await h.load()
      await h.warmup()
      return h
    })()
  }
  _human = await _loading
  return _human
}

/** Detect exactly one good face in the source and return its embedding. */
export async function getDescriptor(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
): Promise<DescriptorResult> {
  let h: Human
  try { h = await getHuman() } catch { return { ok: false, reason: 'engine' } }
  try {
    const res = await h.detect(source as any)
    const faces = res.face ?? []
    if (faces.length === 0) return { ok: false, reason: 'no_face' }
    if (faces.length > 1) return { ok: false, reason: 'multiple_faces' }
    const face = faces[0]
    const emb = face.embedding as number[] | undefined
    if (!emb || emb.length === 0 || (face.score ?? 0) < 0.5) return { ok: false, reason: 'low_quality' }
    return { ok: true, descriptor: Array.from(emb) }
  } catch { return { ok: false, reason: 'engine' } }
}

/** Average several descriptors element-wise (used at enrolment for robustness). */
export function averageDescriptors(list: number[][]): number[] {
  if (list.length === 0) return []
  const n = list[0].length
  const out = new Array(n).fill(0)
  for (const d of list) for (let i = 0; i < n; i++) out[i] += d[i]
  return out.map(x => x / list.length)
}
```

- [ ] **Step 4: Add a unit test for `averageDescriptors`** in `src/lib/faceEngine.test.ts`

```ts
import { averageDescriptors } from './faceEngine'

describe('averageDescriptors', () => {
  it('averages element-wise', () => {
    expect(averageDescriptors([[2, 4], [4, 8]])).toEqual([3, 6])
  })
  it('returns [] for empty input', () => {
    expect(averageDescriptors([])).toEqual([])
  })
})
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test && npm run build`
Expected: tests PASS; `npm run build` ends with `✓ built`. (Human is dynamically imported, so it is code-split out of the main bundle.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/faceEngine.ts src/lib/faceEngine.test.ts public/models package.json package-lock.json
git commit -F /tmp/msg.txt   # "feat(attendance): Human face engine + self-hosted models"
```

---

## Task 4: Enrolment hook

**Files:**
- Create: `src/hooks/useFaceEnrollment.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { FACE_MODEL } from '@/lib/faceEngine'

export interface FaceEnrollment { enrolled: boolean; enrolledAt: string | null; descriptor: number[] | null }

export function useFaceEnrollment(userId?: string) {
  return useQuery({
    queryKey: ['face_enrollment', userId],
    enabled: !!userId,
    queryFn: async (): Promise<FaceEnrollment> => {
      const { data, error } = await (supabase.from('profiles') as any)
        .select('face_descriptor, face_enrolled_at').eq('id', userId).single()
      if (error) throw error
      const d = data?.face_descriptor as number[] | null
      return { enrolled: !!d?.length, enrolledAt: data?.face_enrolled_at ?? null, descriptor: d ?? null }
    },
  })
}

export function useSaveFaceEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, descriptor }: { userId: string; descriptor: number[] }) => {
      const { error } = await (supabase.from('profiles') as any)
        .update({ face_descriptor: descriptor, face_enrolled_at: new Date().toISOString(), face_model: FACE_MODEL })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['face_enrollment', v.userId] }),
  })
}

// Admin clears a user's template so they re-enrol.
export function useResetFaceEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await (supabase.from('profiles') as any)
        .update({ face_descriptor: null, face_enrolled_at: null, face_model: null }).eq('id', userId)
      if (error) throw error
    },
    onSuccess: (_d, userId) => qc.invalidateQueries({ queryKey: ['face_enrollment', userId] }),
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: `✓ built` (no type errors).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFaceEnrollment.ts
git commit -F /tmp/msg.txt   # "feat(attendance): face enrolment hooks (read/save/reset)"
```

---

## Task 5: Shared FaceCapture modal

Extract the camera logic currently inline in `AttendancePage.tsx` (lines ~83–135: `openCamera`, the `useEffect` stream attach, `stopCamera`, `captureAndPunch`, and the camera modal JSX at ~268–283) into a reusable component that returns a captured **canvas frame** and runs detection, so both enrolment and punch reuse it.

**Files:**
- Create: `src/pages/attendance/FaceCapture.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useRef, useEffect, useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { getDescriptor, type DescriptorResult } from '@/lib/faceEngine'

const REASON_MSG: Record<string, string> = {
  no_face: 'No face detected — center your face and retry.',
  multiple_faces: 'More than one face in frame — only you should be visible.',
  low_quality: 'Face unclear — move to better light and retry.',
  engine: 'Face engine failed to load — check your connection and retry.',
}

interface Props {
  title: string
  actionLabel: string
  busy?: boolean
  // Returns a captured frame canvas + its descriptor for the caller to use.
  onCapture: (result: { canvas: HTMLCanvasElement; descriptor: number[] }) => void
  onCancel: () => void
}

export function FaceCapture({ title, actionLabel, busy, onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}) }
        setReady(true)
      } catch (e: any) {
        const msg = e?.name === 'NotAllowedError' ? 'Camera is blocked for this site. Re-enable it, then retry.'
          : e?.name === 'NotFoundError' ? 'No camera found on this device.'
          : e?.name === 'NotReadableError' ? 'Camera is busy in another app — close it and retry.'
          : e?.message ?? 'Could not open the camera'
        toast.error('Camera error', msg); onCancel()
      }
    })()
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }, [])

  const snapshot = (video: HTMLVideoElement): HTMLCanvasElement => {
    const max = 480
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(video.videoWidth * scale); c.height = Math.round(video.videoHeight * scale)
    c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height)
    return c
  }

  const onShoot = async () => {
    const video = videoRef.current
    if (!video || working || busy) return
    setWorking(true)
    try {
      const canvas = snapshot(video)
      const res: DescriptorResult = await getDescriptor(canvas)
      if (!res.ok) { toast.error('Try again', REASON_MSG[res.reason]); setWorking(false); return }
      onCapture({ canvas, descriptor: res.descriptor })
    } catch (e: any) {
      toast.error('Capture failed', e.message); setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-[70] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-black rounded-2xl overflow-hidden shadow-2xl">
        <video ref={videoRef} playsInline muted className="w-full aspect-[3/4] object-cover bg-black" />
        <div className="flex items-center justify-between gap-3 p-4 bg-[#111]">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-white/20 text-white rounded-lg hover:bg-white/10">Cancel</button>
          <button onClick={onShoot} disabled={!ready || working || busy}
            className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {(working || busy) ? <Sym name="progress_activity" size={16} className="animate-spin" /> : <Sym name="photo_camera" size={16} />}
            {actionLabel}
          </button>
        </div>
      </div>
      <p className="text-white/60 text-xs mt-3">{title}</p>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/attendance/FaceCapture.tsx
git commit -F /tmp/msg.txt   # "feat(attendance): reusable FaceCapture modal (camera + detect)"
```

---

## Task 6: Settings hook + RPC params

**Files:**
- Modify: `src/hooks/useAttendance.ts`
- Create: `supabase/migrations/043_punch_attendance_face.sql`

- [ ] **Step 1: Extend `usePunch` to pass the face fields** — in `src/hooks/useAttendance.ts`, replace the `usePunch` mutation body's argument + rpc call:

```ts
export function usePunch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ lat, lng, accuracy, selfiePath, device, faceMatched, faceScore }: {
      lat: number; lng: number; accuracy: number; selfiePath?: string | null; device?: string
      faceMatched?: boolean | null; faceScore?: number | null
    }) => {
      const { data, error } = await (supabase.rpc as any)('punch_attendance', {
        p_lat: lat, p_lng: lng, p_accuracy: accuracy,
        p_selfie_path: selfiePath ?? undefined, p_device: device ?? undefined,
        p_face_matched: faceMatched ?? undefined, p_face_score: faceScore ?? undefined,
      })
      if (error) throw error
      return data as { id: string; within_fence: boolean; distance_m: number; is_field: boolean }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance_today'] })
      qc.invalidateQueries({ queryKey: ['attendance_days'] })
    },
  })
}
```

- [ ] **Step 2: Write the RPC migration** — `supabase/migrations/043_punch_attendance_face.sql`

```sql
-- 043 — punch_attendance accepts + persists the face-match result and enforces it
-- server-side when face_match_required is on.
create or replace function public.punch_attendance(
  p_lat double precision, p_lng double precision, p_accuracy double precision,
  p_selfie_path text default null, p_device text default null,
  p_face_matched boolean default null, p_face_score numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_settings attendance_settings%rowtype;
  v_is_field boolean;
  v_office office_locations%rowtype;
  v_dist double precision;
  v_best_dist double precision := null;
  v_best_office uuid := null;
  v_within boolean := false;
  v_punch_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select * into v_settings from attendance_settings limit 1;
  select is_field_staff into v_is_field from profiles where id = v_user;

  if p_accuracy is null or p_accuracy > coalesce(v_settings.accuracy_threshold_m, 100) then
    raise exception 'Location accuracy too low (% m). Move to an open area and retry.', round(coalesce(p_accuracy, 9999));
  end if;

  for v_office in select * from office_locations where is_active loop
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - v_office.latitude) / 2), 2) +
      cos(radians(v_office.latitude)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - v_office.longitude) / 2), 2)
    ));
    if v_best_dist is null or v_dist < v_best_dist then
      v_best_dist := v_dist; v_best_office := v_office.id; v_within := v_dist <= v_office.radius_m;
    end if;
  end loop;

  if coalesce(v_settings.selfie_required, false) and p_selfie_path is null then
    raise exception 'A selfie is required to punch.';
  end if;

  -- Face-match enforcement: if required, the punch must report a successful match.
  if coalesce(v_settings.face_match_required, false) and coalesce(p_face_matched, false) is not true then
    raise exception 'Face did not match your enrolled face. Please retry.';
  end if;

  if not coalesce(v_is_field, false) and not coalesce(v_within, false) then
    raise exception 'You are not at an office location (nearest is % m away).', round(coalesce(v_best_dist, 0));
  end if;

  insert into attendance_punches
    (user_id, punch_at, latitude, longitude, accuracy_m, distance_m, office_id, within_fence, is_field, selfie_path, device_info, face_matched, face_score)
  values
    (v_user, now(), p_lat, p_lng, p_accuracy, v_best_dist, v_best_office, coalesce(v_within,false), coalesce(v_is_field,false), p_selfie_path, p_device, p_face_matched, p_face_score)
  returning id into v_punch_id;

  return jsonb_build_object(
    'id', v_punch_id,
    'within_fence', coalesce(v_within, false),
    'distance_m', round(coalesce(v_best_dist, 0)),
    'is_field', coalesce(v_is_field, false)
  );
end; $function$;
```

- [ ] **Step 3: Apply the RPC migration** via Supabase MCP `apply_migration` (`name = 043_punch_attendance_face`, the SQL above). Expected: `{"success": true}`.

- [ ] **Step 4: Probe the enforcement on the live DB** via Supabase MCP `execute_sql`:

```sql
do $$
declare v_user uuid; v_msg text; v_blocked boolean := false;
begin
  select id into v_user from profiles limit 1;
  update attendance_settings set face_match_required = true;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  begin
    perform punch_attendance(30.7, 76.7, 10, 'x/y.jpg', 'probe', false, 0.1);
  exception when others then v_blocked := true; v_msg := sqlerrm;
  end;
  update attendance_settings set face_match_required = false;  -- restore OFF
  raise notice 'blocked=% msg=%', v_blocked, v_msg;
end $$;
```
Expected: no error from the `do` block; the inner punch is blocked (face-match required + matched=false) and settings are restored to OFF. (If the block raised, investigate before continuing.)

- [ ] **Step 5: Typecheck + commit**

```bash
npm run build   # expect ✓ built
git add src/hooks/useAttendance.ts supabase/migrations/043_punch_attendance_face.sql
git commit -F /tmp/msg.txt   # "feat(attendance): punch RPC persists + enforces face match"
```

---

## Task 7: Wire enrolment + match into AttendancePage

**Files:**
- Modify: `src/pages/attendance/AttendancePage.tsx`

- [ ] **Step 1: Replace the inline camera state/handlers with FaceCapture + enrolment/match logic.**

Remove the inline camera implementation (`camOpen`, `videoRef`, `streamRef`, `openCamera`, the stream `useEffect`, `stopCamera`, `captureAndPunch`, and the camera modal JSX) and replace with the wiring below. Keep `doPunch`, the stats, lists, and permissions help unchanged.

Add imports:

```tsx
import { FaceCapture } from './FaceCapture'
import { useFaceEnrollment, useSaveFaceEnrollment } from '@/hooks/useFaceEnrollment'
import { getDescriptor, averageDescriptors, similarity } from '@/lib/faceEngine'
```

Add state + hooks inside the component (alongside the existing ones):

```tsx
const { data: enrollment } = useFaceEnrollment(user?.id)
const saveEnroll = useSaveFaceEnrollment()
const faceOn = !!settings?.face_match_required
const threshold = Number(settings?.face_match_threshold ?? 0.5)
const [mode, setMode] = useState<null | 'enroll' | 'punch'>(null)
const enrollFrames = useRef<number[][]>([])
```

Replace `onPunchClick` with face-aware routing:

```tsx
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
```

Add the capture-result handler. It serves three flows: enrol (collect 3 frames, average, save), face-punch (match then upload+punch), and legacy-selfie (upload+punch, no match):

```tsx
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
```

Update `doPunch` to forward the face fields:

```tsx
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
```

Replace the old camera modal JSX with FaceCapture + an enrolment hint on the punch card:

```tsx
{mode && (
  <FaceCapture
    title={mode === 'enroll' ? `Enrol your face (${enrollFrames.current.length}/3) — center one face` : 'Center your face, then Punch'}
    actionLabel={mode === 'enroll' ? 'Capture' : 'Capture & Punch'}
    busy={busy}
    onCapture={onCapture}
    onCancel={() => { setMode(null); setBusy(false) }}
  />
)}
```

And under the existing `selfie_required` hint on the punch card, add a face hint:

```tsx
{faceOn && (
  <p className="text-[11px] text-white/55 mt-1 flex items-center justify-center gap-1">
    <Sym name="face" size={12} />
    {enrollment?.enrolled ? 'Face verification is on at each punch.' : 'First punch will enrol your face.'}
  </p>
)}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: `✓ built` (no unused-variable or type errors — ensure removed camera refs aren't referenced).

- [ ] **Step 3: Commit**

```bash
git add src/pages/attendance/AttendancePage.tsx
git commit -F /tmp/msg.txt   # "feat(attendance): face enrolment + match-before-punch in AttendancePage"
```

---

## Task 8: Admin controls (settings toggle + reset) and deploy

**Files:**
- Modify: `src/pages/settings/AttendanceSettingsSection.tsx`
- Modify: `src/pages/admin/UserManagementPage.tsx`

- [ ] **Step 1: Add face fields to the settings local state** — in `AttendanceSettingsSection.tsx`, extend the `s` state initialiser and its `useEffect` sync:

```tsx
const [s, setS] = useState({ expected_start_time: '09:30', standard_hours: 8, selfie_required: false, accuracy_threshold_m: 100, face_match_required: false, face_match_threshold: 0.5 })
```

```tsx
useEffect(() => { if (settings) setS({
  expected_start_time: (settings.expected_start_time ?? '09:30').slice(0,5),
  standard_hours: Number(settings.standard_hours ?? 8),
  selfie_required: !!settings.selfie_required,
  accuracy_threshold_m: settings.accuracy_threshold_m ?? 100,
  face_match_required: !!(settings as any).face_match_required,
  face_match_threshold: Number((settings as any).face_match_threshold ?? 0.5),
}) }, [settings])
```

- [ ] **Step 2: Include the face fields in `saveSettings`:**

```tsx
const saveSettings = async () => {
  try { await updateSettings.mutateAsync({ expected_start_time: s.expected_start_time, standard_hours: s.standard_hours, selfie_required: s.selfie_required, accuracy_threshold_m: s.accuracy_threshold_m, face_match_required: s.face_match_required, face_match_threshold: s.face_match_threshold } as any); toast.success('Attendance settings saved') }
  catch (e: any) { toast.error('Failed', e.message) }
}
```

- [ ] **Step 3: Add the toggle + threshold UI** inside the settings form (place near the `selfie_required` control; match the surrounding markup style):

```tsx
<label className="flex items-center gap-2 text-sm text-brand-950">
  <input type="checkbox" checked={s.face_match_required}
    onChange={e => setS(v => ({ ...v, face_match_required: e.target.checked }))} />
  Require face match at punch
</label>
{s.face_match_required && (
  <div className="pl-6">
    <label className="block text-[11px] text-muted-foreground mb-1">
      Match strictness — similarity ≥ {s.face_match_threshold.toFixed(2)} (higher = stricter)
    </label>
    <input type="range" min={0.3} max={0.8} step={0.01} value={s.face_match_threshold}
      onChange={e => setS(v => ({ ...v, face_match_threshold: Number(e.target.value) }))}
      className="w-full max-w-xs" />
  </div>
)}
```

- [ ] **Step 4: Add a "Reset face enrolment" action in `UserManagementPage.tsx`.** Import the hook and add a per-user button (admin only — this page is already admin-gated):

```tsx
import { useResetFaceEnrollment } from '@/hooks/useFaceEnrollment'
```

In the component:

```tsx
const resetFace = useResetFaceEnrollment()
const onResetFace = async (id: string, name: string) => {
  if (!confirm(`Clear ${name}'s face enrolment? They will re-enrol on their next punch.`)) return
  try { await resetFace.mutateAsync(id); toast.success('Face enrolment cleared') }
  catch (e: any) { toast.error('Failed', e.message) }
}
```

Add a row action button (place alongside the existing per-user actions, matching their markup):

```tsx
<button onClick={() => onResetFace(u.id, u.name)} title="Reset face enrolment"
  className="text-xs text-amber-700 hover:text-amber-800 flex items-center gap-1">
  <Sym name="face_retouching_off" size={13} /> Reset face
</button>
```

(If `Sym`, `toast`, or `u` differ in that file, adapt to the existing imports/loop variable; do not introduce new patterns.)

- [ ] **Step 5: Full verification**

Run: `npm test && npm run build`
Expected: tests PASS; `✓ built`.

- [ ] **Step 6: Commit + deploy**

```bash
git add src/pages/settings/AttendanceSettingsSection.tsx src/pages/admin/UserManagementPage.tsx
git commit -F /tmp/msg.txt   # "feat(attendance): admin face-match toggle, threshold, reset enrolment"
git push origin main         # GitHub Actions → portal.tpsxpert.com
```

- [ ] **Step 7: Manual device verification (after deploy completes)**

On a phone, logged in as a test employee, with `face_match_required` toggled ON in settings:
1. First punch → enrolment runs (3 captures) → "Face enrolled".
2. Punch again → your face → matches → "Punched". Confirm `attendance_punches.face_matched = true`, `face_score` populated (via Supabase MCP `execute_sql`).
3. Have a different person try to punch as you → rejected with "Face did not match".
4. Admin → Reset face for the test user → next punch re-enrols.
Then toggle `face_match_required` OFF again until rollout is decided.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Storage on profiles → Task 1 ✓ · settings + audit fields → Task 1 ✓ · faceEngine (getDescriptor/similarity) → Tasks 2–3 ✓ · self-hosted models → Task 3 ✓ · enrolment (3-frame average) → Tasks 4,7 ✓ · punch match + reject → Task 7 ✓ · RPC params + server enforcement → Task 6 ✓ · admin toggle/threshold/reset → Task 8 ✓ · error/edge messages → Task 5 (REASON_MSG) + Task 7 ✓ · ships OFF → Task 1 default false ✓ · privacy (descriptor only) → inherent to schema/hook ✓.
- Trust-model note (client-computed match, server-trusts-flag) is implemented exactly as specified: RPC enforces the flag; honest residual risk accepted.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The one open value (default threshold 0.5) is a real default validated in Task 8 Step 7, not a placeholder.

**Type consistency:** `getDescriptor` returns `DescriptorResult` (Tasks 3,5). `similarity(a,b)`/`isMatch`/`averageDescriptors` signatures consistent (Tasks 2,3,7). `usePunch` arg adds `faceMatched`/`faceScore` (Task 6) consumed in `doPunch` (Task 7). RPC params `p_face_matched`/`p_face_score` consistent between migration (Task 6) and hook (Task 6). Enrolment hook field names (`face_descriptor`/`face_enrolled_at`/`face_model`) match migration 042 (Task 1).
