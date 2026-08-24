# Portal — Obsolete Biometric Infrastructure Audit (read-only)
**Date:** 24 Aug 2026 · **Project:** tps-oms-portal (Supabase `gytscakgtsbxgdkbqhbx`) · **Status:** AUDIT ONLY — nothing deleted or altered

## What was inspected
`profiles.face_descriptor`, `profiles.face_model`, and the `face-refs` storage bucket, plus every code/migration reference in the `tps-oms` repo.

## Findings (all verified live)
| Item | State |
|---|---|
| `profiles.face_descriptor` column | Exists · **0 rows non-NULL** |
| `profiles.face_model` column | Exists · **0 rows non-NULL** |
| `face-refs` storage bucket | Exists · private · **5 objects, ~66 KB** (leftover enrolment selfies) |
| Runtime code references | Only `src/lib/attendanceGeo.ts` (`mapVerification()` — a pure helper mapping a Rekognition similarity score to a status; no live caller feeds it face data) |
| Migration references | 042, 043, 045, 075, 076, 077 (immutable history — never edited) |

## Dependency conclusion
The face-match / AWS Rekognition path was retired (migration 076 neutralised the enrolment gate; attendance now runs on the Hikvision device punch + GPS/selfie backup). The two columns are NULL for every employee and the bucket holds only 5 stale enrolment images. **The infrastructure is genuinely obsolete and safe to remove** — no live feature reads it.

## Why this was NOT executed (hard stop)
Removing it means (a) **deleting biometric data** (5 face images), (b) a **database schema change** (dropping two columns), and (c) deleting a **storage bucket**. All three are on the explicit stop-and-ask list, and the TPS-OMS change-control rule requires per-item approval. So this is reported, not done.

## Recommended safe removal (on your approval, in this order)
1. **Back up first:** download the 5 `face-refs` objects and `pg_dump` the two columns' (NULL) definitions to an off-platform archive; confirm no retention/legal hold applies to attendance biometrics.
2. **Storage:** delete the 5 objects, then delete the `face-refs` bucket.
3. **Schema (new migration, never edit old ones):** `alter table public.profiles drop column face_descriptor, drop column face_model;` — as a *new* forward migration, applied to prod through the normal path.
4. **Code:** remove the now-dead `mapVerification()` from `attendanceGeo.ts` if nothing else imports it (verify first).
5. Re-run the portal attendance flow end-to-end (device punch + GPS/selfie) to confirm no regression.

**Awaiting your explicit go-ahead before any of the above.**
