# Attendance Face Verification (Server-Side, AWS Rekognition) — Design Spec

**Date:** 2026-07-11
**Status:** Approved for planning
**Author:** TPS-OMS team

## Problem

Attendance needs identity verification so staff cannot punch in for one another
("buddy punching"). The previous approach ran the `@vladmandic/human` face model
**in the browser** (6.7 MB model + WebGL). On some staff devices the engine
stalled during model load/WebGL warmup, freezing the punch with no timeout —
staff were locked out. Running verification with no camera at all is not an
acceptable permanent solution.

## Goal

Reliable, accurate, low-lag attendance verification that:
- **Never runs a heavy face engine on the phone** (root cause of the freeze).
- Verifies the punching person is who they claim to be.
- Never blocks a legitimate staff member from punching.
- Keeps storage and cost negligible.
- Lets admins/HR review punch photos inside the portal (not raw Supabase folders).

## Chosen approach

**Server-side face matching via AWS Rekognition `CompareFaces` (1:1).**
The phone takes a **plain photo snapshot** (no on-device detection) and uploads
it. A Supabase Edge Function compares the photo against the person's enrolled
reference face in AWS's cloud and records the result. Decisions confirmed with
the user:

| Decision | Choice |
|---|---|
| Match engine | AWS Rekognition (region `ap-south-1`, Mumbai) |
| Fallback on fail/unreachable | **Allow the punch, flag it for review** (never block) |
| Liveness / anti-spoofing | **Skip for v1** (plain photo match); revisit if abuse appears |
| Capture UX | Manual **Capture** button (plain snapshot — no scan, no countdown) |

## Architecture & data flow

```
Attendance page (browser)
  └─ open camera → user taps "Capture" → plain <canvas> snapshot (JPEG ~12KB)
  └─ POST { photo(base64), gps{lat,lng,acc} } → Edge Function  (JWT of the user)
        │
Edge Function: attendance-verify-punch   (Deno, server-side)
  ├─ authenticate caller from JWT → user_id (cannot spoof another user)
  ├─ load settings (threshold, geofence, is_field_staff)
  ├─ geofence check (office staff only) → within radius? else 'out_of_range'
  ├─ fetch reference photo  face-refs/{user_id}/reference.jpg  (service role)
  ├─ AWS Rekognition CompareFaces(source=reference, target=photo)
  │     └─ 8s timeout; any error/timeout → status='unverified'
  ├─ similarity ≥ threshold → 'verified'; else 'no_match'
  ├─ upload punch photo → attendance/{user_id}/{date}/{ts}.jpg
  ├─ record punch via existing punch RPC + verification fields
  └─ return { ok, status, similarity }
        │
AWS Rekognition (cloud)  ── all heavy compute here; phone stays light
```

**Reliability guarantee:** the browser only draws a video frame to a canvas and
uploads it — there is no TensorFlow/WebGL/model on the device, so the freeze mode
cannot recur. The Edge Function always records the punch (allow + flag).

## Components

### C1. `faceEngine.ts` (frontend) — retire on-device matching
Remove the in-browser Human matching from the attendance/enrollment path. Keep a
minimal `snapshot(video)` helper (plain canvas draw + JPEG compress). The
`@vladmandic/human` dependency and `/public/models/*` can be removed once no code
imports them (verify before deleting; face-login also uses it — see Open Items).

### C2. `FaceCapture` (frontend) — plain snapshot
Camera preview + a **Capture** button. On tap: draw current frame to a downscaled
canvas (max 480px), compress to JPEG q0.6 (~12 KB), hand the base64 to the caller.
No detection loop, no auto-scan, no timeout hang. A "Retake" button lets the user
redo a blurry shot.

### C3. Edge Function `attendance-verify-punch` (Deno)
When `face_match_required = ON`, the client routes the punch **through this
function** (which performs the insert); when OFF, the client keeps using the
existing direct `punch_attendance` RPC. One entry point per mode — no double-punch.
- Input: `{ photo: base64, gps: {lat,lng,accuracy} }`, `Authorization: Bearer <user JWT>`.
- Resolves `user_id` from the JWT (never trust a client-sent id).
- Reads `attendance_settings` (threshold, geofence radius/coords) and the caller's
  `profiles.is_field_staff`.
- Geofence (office staff only): haversine distance ≤ radius → ok, else record
  status includes `out_of_range` note (still allowed per policy, flagged).
- Downloads reference via service role; if none → `{ ok:false, needs_enrollment:true }`.
- Calls AWS Rekognition `CompareFaces` with an 8s timeout.
- Maps result → `verification_status ∈ { verified, no_match, unverified }`.
- Uploads punch photo; inserts the punch (reuse existing `punch_attendance` RPC,
  extended with `photo_path`, `verification_status`, `face_similarity`).
- Returns the outcome for the UI to show a badge/toast.
- AWS creds + region from Edge Function secrets (never in frontend).

### C4. Edge Function `attendance-enroll-face` (Deno)
- Input: `{ photo: base64 }` + user JWT.
- AWS `DetectFaces` → must be exactly one face with good confidence, else reject
  with a clear message ("Face not clear — retake in good light").
- Upload to `face-refs/{user_id}/reference.jpg` (overwrite = re-enroll).
- Admins may enroll/reset on behalf of a user (role check).

### C5. Database
- `attendance_punches`: add `photo_path text`, `verification_status text`
  (`verified|no_match|unverified|none`), `face_similarity numeric`.
- New private bucket `face-refs` with RLS: a user reads/writes own reference;
  admins (super_admin/director/manager/hr) read all. Edge Functions use service role.
- `attendance` bucket stays private (already is).
- `attendance_settings`: reuse `face_match_required` (on/off) and
  `face_match_threshold`. **Threshold semantics change:** the old slider (0.30–0.80,
  default 0.50) was tuned for Human cosine-similarity and is meaningless for
  Rekognition, which returns 0–100% similarity. Rework the slider to **80–98%,
  default 90%**, and pass it as Rekognition's `SimilarityThreshold`. Migrate any
  stored value (< 1.0 → treat as legacy, reset to 0.90).

### C6. In-portal review browser — "Attendance Photos"
New admin/HR page (or tab under Attendance/Reports): punch cards showing
**name · date · time · photo thumbnail · GPS · status badge (✅ verified /
⚠️ unverified / ❌ no-match / 📍 out-of-range)**. Filters: staff, date range,
status. Click a card → enlarged photo + map link. Signed URLs (short-lived) for
the private photos. No raw-folder browsing.

## Error handling

| Condition | Behaviour |
|---|---|
| AWS timeout/error | Punch recorded `unverified`, flagged; toast: "Recorded — verification skipped" |
| Similarity < threshold | Punch recorded `no_match`, flagged; toast: "Recorded — face not matched, HR notified" |
| No reference enrolled | Prompt to enroll first (or admin-configurable allow-as-unverified) |
| Camera blocked/denied | Clear message + fall back to manager-assisted punch |
| Enrollment photo unclear | Reject with retake guidance (DetectFaces gate) |

## Security

- AWS Access Key/Secret **only** in Edge Function secrets.
- Caller identity from JWT; a user can never punch/verify as another user.
- `face-refs` and `attendance` buckets private; access via short-lived signed URLs
  and role-gated RLS.
- Reference and punch photos are personal data — documented retention (optional
  auto-delete punch photos > 12 months; references kept until staff exit).

## Testing

- **Unit:** haversine geofence; status-mapping (similarity vs threshold → status);
  JPEG snapshot size stays < 30 KB.
- **Edge Function:** mock Rekognition responses (match / no-match / error/timeout)
  → assert status + that the punch is always recorded (allow + flag).
- **Enrollment:** DetectFaces gate rejects 0-face and multi-face photos.
- **Manual device test (critical):** enroll + punch on the actual staff phones
  that previously froze — confirm no hang and a result within a few seconds.
- **Fallback drill:** disable AWS creds → confirm punches still record as
  `unverified` (never blocked).

## Rollout

1. Ship with `face_match_required = OFF` (current safe state) — build & verify.
2. Enroll each staff member's reference face (admin-supervised).
3. Turn `face_match_required = ON` for a 1–2 day trial; watch the review page.
4. Adjust threshold if false "no-match" rate is high; then leave on.

## What the user provides (one-time)

- AWS account → IAM user with `rekognition:CompareFaces` + `rekognition:DetectFaces`.
- Access Key ID + Secret Access Key.
- Region `ap-south-1`. Provided keys are stored in Edge Function secrets by the team.

## Open items / notes

- **face-login** also uses the on-device Human engine. This spec covers
  *attendance*. Face-login can be migrated to the same server-side flow in a
  follow-up (or left on password, which is reliable). Decide during planning.
- Liveness deferred (v2) — plain photo match can be spoofed by a printed photo;
  acceptable for a 5-person team with photo record + flag-for-review.

## Non-goals (v1)

- Liveness / anti-spoofing.
- Migrating face-login (separate follow-up).
- Multi-face-per-person enrollment / re-training.
