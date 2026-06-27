# Face-Matching Attendance Punch — Design Spec

**Date:** 2026-06-28
**Project:** TPS-OMS (portal.tpsxpert.com)
**Status:** Approved — ready for implementation plan

## Goal

Replace the "capture-and-record selfie" attendance punch with **face verification**: each
employee enrols their face once, and every punch compares the live face against that enrolled
template. A punch is only accepted when the live face matches the enrolled one (1:1 verification).

## Why 1:1 verification (not 1:N identification)

The employee is already authenticated (logged in). We are NOT searching for an identity among many —
we only confirm "is this the same face the logged-in user enrolled?". Comparing against a single
stored template is far more accurate and forgiving than identification, and is why an on-device model
is sufficient (no cloud service required).

## Engine decision

- **Library:** `@vladmandic/human` (MIT, actively maintained), client-side only.
- **Backends:** auto-selects WebGPU → WebGL → WASM per device → works on iOS Safari, Android Chrome,
  and desktop.
- **Modules loaded:** face detection + face description (embedding) only. Liveness/anti-spoof models
  are NOT loaded now but are one config flag away if photo-spoofing ever needs closing.
- **Models:** self-hosted under `public/models/` (no CDN dependency; browser-cached after first load).
- **Privacy:** the stored descriptor is a one-way numeric embedding (float array), not a reversible
  image. The reference selfie image continues to be stored in the existing `attendance` bucket as
  visual audit evidence.

## Trust model (explicit)

Matching runs in the browser. The `punch_attendance` RPC enforces "if face-match is required, the
punch must report a successful match" server-side, so a normal client cannot skip the check. However,
because the match is computed client-side, a determined technical user could forge the matched flag.
For internal staff attendance — with the selfie image also stored — this residual risk is accepted.
True tamper-proofing would require server/cloud matching, which was deliberately ruled out for cost
and privacy. The liveness flag in Human is the available upgrade path.

## Data model changes

### `profiles` (one active template per user)
- `face_descriptor` jsonb — the embedding array (null = not enrolled)
- `face_enrolled_at` timestamptz
- `face_model` text — e.g. `human-faceres` (records which model produced the descriptor)

### `attendance_settings`
- `face_match_required` boolean not null default false — ships OFF (dark launch)
- `face_match_threshold` numeric not null default 0.5 — match cutoff (tunable; see Threshold)

### `attendance_punches`
- `face_matched` boolean — whether the live face matched at punch time
- `face_score` numeric — the similarity/score recorded for audit

## Threshold semantics

`@vladmandic/human` exposes `human.match` / similarity in [0,1] where higher = more similar.
We store a **minimum similarity** threshold in `face_match_threshold` (default 0.5, admin-tunable via a
slider). A punch matches when `similarity >= threshold`. The exact default will be validated during
implementation against real enrol/punch pairs and adjusted if needed; the comparison helper is a pure
function and unit-tested.

## Components

### `src/lib/faceEngine.ts`
- Singleton that lazy-loads Human with a minimal config (face detect + description; mesh/iris/emotion/
  liveness off), models from `/models`.
- `getDescriptor(source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement): Promise<number[] | null>`
  — returns the embedding, or null if no/many faces or low detection confidence.
- `similarity(a: number[], b: number[]): number` — pure function, returns [0,1]. Unit-tested.
- Surfaces detection issues (no face / multiple faces / low confidence) as typed results so the UI can
  prompt the user.

### Enrolment (new) — `src/pages/attendance/FaceEnrollment.tsx` + hook
- Trigger: face-match required AND current user has no `face_descriptor`.
- Flow: open camera (reuse existing getUserMedia pattern) → require exactly one clearly-detected face →
  capture 2–3 frames, average their descriptors for robustness → save to the user's profile
  (`face_descriptor`, `face_enrolled_at`, `face_model`).
- Guards: reject if zero or multiple faces, or detection score too low; allow retry.

### Punch verification — extend `src/pages/attendance/AttendancePage.tsx`
- When `face_match_required`:
  - If not enrolled → route to enrolment first.
  - On capture: compute live descriptor → `similarity` vs enrolled → if `>= threshold`: upload selfie
    (existing path) and call punch with `face_matched=true, face_score`. If below: reject, show
    "Face didn't match — try again in better light", offer retry. No silent bypass.
- When face-match is OFF, behaviour is unchanged (current selfie_required flow).

### Admin
- **Attendance Settings** (`AttendanceSettingsSection.tsx`): add `Face match required` toggle +
  threshold slider, wired through `useUpdateAttendanceSettings`.
- **Reset enrolment**: an admin action (employee management / settings) that clears a user's
  `face_descriptor` so they re-enrol (new phone / appearance change). Admin-only.

### RPC — `punch_attendance`
- Add params `p_face_matched boolean default null`, `p_face_score numeric default null`; persist them
  to the new punch columns.
- Server guard: if `attendance_settings.face_match_required` is true and `p_face_matched` is not true,
  `raise exception` (reject the punch). Keeps the check from being skipped by a normal client.

## Data flow (punch, face-match on)

camera capture → `faceEngine.getDescriptor(frame)` → `similarity(live, enrolled)` → matched? →
upload selfie to `attendance` bucket → `punch_attendance(lat,lng,acc,selfie_path,device,face_matched,face_score)`
→ server validates + stores.

## Error / edge handling

- No face / multiple faces detected → retry prompt ("center one face").
- Not enrolled while required → enrolment modal first.
- Match fail → retry; repeated failures → "contact admin to re-enrol".
- Engine/model fails to load while face-match required → clear block with retry (never a silent allow).
- Reuses the existing camera/location permission help block.

## Policy decisions (approved)

1. **Self-enrol** on first punch; admin can reset. (Not admin-enrols-everyone.)
2. **Hard block** on mismatch, with retries; no silent bypass.
3. **Ships OFF** — enabled in settings after staff have enrolled, so nobody is locked out on day one.

## Testing

- **Unit:** `similarity()` and the threshold/match decision (pure functions) with known descriptor
  pairs (same-face high, different-face low).
- **Manual:** enrol on a phone → punch matches; a different person → rejected; (photo-spoof noted as
  out of scope without liveness).

## Out of scope (YAGNI)

- Liveness / anti-spoofing (available later via Human flag).
- Multiple templates per user / appearance history.
- 1:N identification.
- Cloud / server-side matching.
