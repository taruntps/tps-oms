# Portal Biometric Decommission — Final Plan (AWAITING APPROVAL)
**Date:** 24 Aug 2026 · Project: tps-oms-portal (`gytscakgtsbxgdkbqhbx`) · **Status: NOTHING DELETED — approval required before any step**

Supersedes the audit note with a live-reconfirmed, execution-ready plan. Per your rules, no biometric data, column, storage object, or schema has been touched.

## Dependency recheck (24 Aug, all confirmed)
- **App code references:** `face_descriptor` 0, `face_model` 0, `face-refs` 0, `faceDescriptor`/`faceModel` 0. The only related code is `src/lib/attendanceGeo.ts::mapVerification()`, which is imported **only by its own test** (`attendanceGeo.test.ts`) — no production caller.
- **Live DB (reconfirmed via read-only query):** 9 profiles — `face_descriptor` NULL for all 9, `face_model` NULL for all 9, `face_enrolled_at` set on 5, `face-refs` bucket = **5 objects / 66,237 bytes**.
- **Active workflow:** attendance now runs on the Hikvision device punch + GPS/selfie (migration 076 neutralised the face gate). No live feature reads any of these.

---

## DELETE (exactly what would be removed)
1. **Storage:** the 5 objects in the `face-refs` bucket, then the `face-refs` bucket itself. *(These 5 images are the only actual biometric data.)*
2. **Schema (new forward migration — old migrations never edited):** on `public.profiles`, drop `face_descriptor`, `face_model`. *(Both NULL for all rows.)*
3. **Code:** remove `mapVerification()` and its now-orphaned test from `src/lib/attendanceGeo.ts` / `attendanceGeo.test.ts`.

## WHY (obsolete)
The AWS Rekognition face-match path was retired 2026-07-28; enrolment columns are NULL for every employee and the bucket holds only pre-retirement enrolment selfies. Attendance is fully served by the Hikvision terminal + GPS/selfie. Nothing in production reads these.

## IMPACT (what could be affected)
- **None functionally** — no live code path touches them. Dropping the columns cannot break attendance, payroll, or HRMS (verified: 0 references).
- **RLS policies** on the `face-refs` bucket (migrations 075) become moot once the bucket is gone — harmless.
- **Reversibility:** column drops and bucket deletion are irreversible for the *data*; the *schema* can be re-added later if ever needed, but the 5 images cannot be recovered once deleted — hence the backup step.

## DECISION NEEDED — related columns (NOT in the delete above)
Migration 042 also added `face_enrolled_at` (profiles, 5 non-null) and `face_match_required` / `face_match_threshold` / `face_matched` / `face_score` on punch/attendance tables. These are **outside your named scope** (you named descriptor/model/bucket). I have **left them untouched** and recommend deciding on them separately — dropping punch-table columns needs a closer check that no attendance view/report selects them. Flagging, not touching.

## BACKUP (retain before deletion)
1. Download all 5 `face-refs` objects to off-platform cold storage (confirm no HR/legal retention hold on attendance biometrics first).
2. `pg_dump` the `profiles` table (or at least the two columns' definitions) as a rollback reference.
3. Snapshot the current migration state.

## EXECUTION (exact operations — run only on your approval)
```
# 1. BACKUP (do first, verify the downloads open)
#    - Supabase Studio → Storage → face-refs → download all 5 objects to secure archive
#    - pg_dump --schema-only -t public.profiles > profiles_schema_backup.sql

# 2. STORAGE (after backup verified)
delete from storage.objects where bucket_id = 'face-refs';
delete from storage.buckets  where id = 'face-refs';

# 3. SCHEMA — new forward migration supabase/migrations/NNN_drop_face_columns.sql
alter table public.profiles
  drop column if exists face_descriptor,
  drop column if exists face_model;

# 4. CODE — remove mapVerification + test, then run the suite
```

## Verification after execution
- Portal attendance flow end-to-end (device punch + GPS/selfie) — no regression.
- `npm run build` / test suite green after removing `mapVerification`.
- Confirm bucket 404s and columns are gone.

**STOP — awaiting your explicit approval to proceed. I will not delete anything until you approve this plan.**
