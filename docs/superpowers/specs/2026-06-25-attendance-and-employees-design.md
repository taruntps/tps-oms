# Attendance + Employees — Design Spec

**Goal:** Build (A) an Employees module (employee details over the existing staff profiles) and (B) a geofenced web/mobile attendance system, plus a 30-minute idle auto-logout.

**Principle:** Employees ARE the existing `profiles` (accounts created in User Management). We do NOT create a parallel employee table for identity — we *extend* profiles and add a strictly-protected details table for sensitive PII.

---

## Security decision (PII protection)
`profiles` is readable by every authenticated staff member (needed for assignment dropdowns). RLS is row-level and cannot hide individual columns, so sensitive PII must NOT live on `profiles`. Split:

- **`profiles` (additions, staff-visible):** `employee_code` (Emp ID, unique), `designation` (Position), `department`, `is_field_staff` (bool).
- **`employee_details` (new, 1:1 by `user_id`, STRICT RLS):** `father_name`, `mother_name`, `date_of_birth`, `date_of_joining`, `higher_qualification`, `aadhar_no`, `pan_no`, `personal_email`, `home_phone`, `permanent_address`, `local_address`, `emergency_contact`.
  - RLS: SELECT/UPSERT where `user_id = auth.uid()` OR `has_role('super_admin','director','hr')`. (Aadhaar/PAN never exposed to peers.)

(Mobile no. = existing `profiles.phone`; work email = `profiles.email`; name = `profiles.name`.)

---

## A. Employees module

**Migration 018:** add the four profile columns + create `employee_details` with RLS.

**Employees page** (`/employees`, currently a ComingSoon placeholder):
- **List:** active staff cards/table — avatar, name, Emp ID, designation, department, role badge, field-staff chip, today's attendance status. Search.
- **Employee detail** (`/employees/:id`): tabs/sections —
  - *Profile* — the employee_details form (HR/admin edit any; an employee edits their own). Aadhaar/PAN masked except last 4 unless HR/admin.
  - *Attendance* — that employee's monthly punch history + summary (days present, hours, late count).
  - Field-staff toggle (admin), designation/department/Emp ID (admin).
- **Who sees what:** list visible to managers+/HR; full details only HR/admin or self.

Accounts are still **created** in User Management (invite/create). Employees page manages *details* + attendance, not account creation.

---

## B. Attendance system

### Data model (migration 019)
- **`office_locations`** — `id, name, latitude, longitude, radius_m (default 150), is_active`.
- **`attendance_settings`** (single row) — `expected_start_time` (e.g. 09:30), `standard_hours` (e.g. 8), `selfie_required` (bool, **admin toggle**), `accuracy_threshold_m` (default 100).
- **`attendance_punches`** — `id, user_id, punch_at (server now()), latitude, longitude, accuracy_m, distance_m, office_id, within_fence (bool), is_field (bool), selfie_path, device_info, created_at`.
- **`attendance_days`** (SQL view) — per user/day: first_in, last_out, punch_count, worked_minutes = last−first, `is_late` (first_in::time > expected_start), with approved-leave overlay later.

### Punch flow (mobile-first)
1. Employee opens **Attendance** on phone → **Punch** → browser captures GPS lat/lng + accuracy (+ selfie if `selfie_required`).
2. If selfie required: upload to private `attendance` storage bucket first.
3. Call `punch_attendance(lat, lng, accuracy, selfie_path)` RPC.

### `punch_attendance` RPC (SECURITY DEFINER — server-side enforcement)
- Reject if `accuracy_m > accuracy_threshold_m` (blocks desktop/IP fakes).
- Compute distance (Haversine) to each active office; pick nearest.
- If the caller is **field staff** (`profiles.is_field_staff`): always allowed, `is_field=true`, location recorded.
- Else: reject if distance > office radius (`within_fence=false` → error "You are not at the office").
- Insert the punch with server `now()` timestamp; return the new row.
- No client-trusted time or geofence — all decided in the function.

### Screens
- **Employee → Attendance:** big Punch button, today's punches + in/out + hours, monthly summary. Shows "Punch In" vs "Punch Out" based on last punch.
- **Admin → Attendance:** live daily board (who's in/out, where, late), per-employee monthly report (days/hours/late), raw punch audit with map link.
- **Admin → Settings:** office lat/lng + radius (map or manual), expected start, standard hours, **selfie on/off**, accuracy threshold.

### Storage
- Private `attendance` bucket, path `attendance/{user_id}/{date}/{time}.jpg`; owner-write + HR/admin read RLS. Selfies downscaled client-side (~80 KB) before upload.

### Honest limits (restated)
Web GPS is spoofable; accuracy gate + selfie + audit log are the deterrents, not the fence alone. Punching is a phone activity (desktop GPS too coarse).

---

## C. 30-minute idle auto-logout
- A client-side idle timer (reset on mousemove/keydown/touch/scroll/click). After 30 idle minutes → `supabase.auth.signOut()` + redirect to login with a "signed out for inactivity" note.
- Applies app-wide (in AppShell/AuthProvider). Independent of "Remember me" (Remember me only controls whether the login is remembered on next visit, not idle logout).

---

## Phasing
1. **Employees module** — migration 018 (profile fields + employee_details + RLS), Employees list + detail + details form, field-staff toggle.
2. **Attendance core** — migration 019 (offices/settings/punches/view), `punch_attendance` RPC, attendance bucket; Employee Attendance page (punch + history).
3. **Attendance admin** — daily board, monthly reports, Settings (office/geofence/selfie).
4. **Idle auto-logout.**

## Guardrails
- Aadhaar/PAN/PII strictly RLS-protected; never selected into staff-visible queries.
- Server-side geofence/accuracy/time in the RPC (never client-trusted).
- Each phase: tsc + build clean; DB changes verified; deploy + the user's live validation (auth screens).
- No changes to unrelated modules.
