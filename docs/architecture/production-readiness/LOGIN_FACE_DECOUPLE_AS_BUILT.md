# Decouple Face Recognition from Login — As-Built

> **Status:** ✅ Implemented locally + verified, awaiting review. Authentication is now fully independent of Face Recognition; the biometric engine stays available to Attendance.
> Improve-only: no business logic, schema, or permissions changed.

## What login used to do (audited)
`LoginPage.tsx` imported `PlainCapture` (Attendance's camera component), **pre-requested camera on mount** via `navigator.mediaDevices.getUserMedia`, and offered a "Face ID" tap that photographed the user and called the Supabase **`face-login` edge function** (server-side verification → magic-link OTP → session). There was **no on-device face engine** in login (so `@vladmandic/human` was never involved here).

## 1. Files modified
- `src/pages/auth/LoginPage.tsx` — **only file changed.** Removed: `PlainCapture` import, `getUserMedia` camera pre-request `useEffect`, face-scan state (`faceScanOpen`/`faceScanBusy`), `handleFaceScan`, `onFaceCapture` (the `face-login` call), the fingerprint icon button + hint, and the face-scan modal. Login is now standard **User ID / email + password**, with **Remember me**, a **Forgot password?** helper, and **Sign In**. Existing brute-force lock, employee-code→email resolution, and attempt logging are unchanged.

## 2. Dependencies removed
**None.** No library was used *only* by login. `xlsx` is unrelated. `@vladmandic/human` was already unused app-wide and is **retained** for Attendance's future on-device engine (see §3). `package.json` is untouched.

## 3. Dependencies / code retained for Attendance
- `src/pages/attendance/PlainCapture.tsx` and `FaceScanRing.tsx` — **untouched**; still used by `AttendancePage.tsx` and `AttendancePhotosPage.tsx` (5 references verified).
- `@vladmandic/human` — retained (reserved for the future Attendance on-device verification milestone).
- The `face-login` Supabase **edge function** remains deployed but is now **unreferenced by the client** (login was its only caller). Left in place (removing server functions is out of scope); flag for later cleanup if Attendance won't reuse it.

## 4. Architecture change
Authentication ↔ Face Recognition are now decoupled. `LoginPage` imports only `react-router-dom` + `supabase` — **no camera, webcam, face, AI-model, or attendance dependency**. All biometric capability lives in `src/pages/attendance/*` and can evolve independently.

## 5. Login performance / bundle impact
- Login **no longer bundles the camera-capture component** (`PlainCapture`) or triggers a camera permission prompt.
- `LoginPage` chunk after: **4.96 kB (1.81 kB gz)**. The camera-capture code now ships only in the Attendance chunk (loaded when a user visits Attendance), not on the auth path.
- Faster, lighter login: no `getUserMedia` call, no camera stream setup/teardown on mount.

## 6. Validation (verified)
- ✅ **`tsc --noEmit`** 0 errors · **`vitest` 34/34** · **`vite build`** clean.
- ✅ **Browser (`/login`, public page):** renders exactly User ID · Password · Remember me · Forgot password? · Sign In — **no fingerprint/face icon**.
- ✅ **Console clean — no `getUserMedia`/camera request** fired on login load (only vite + React-Router dev warnings).
- ✅ **Forgot password?** toggles admin-reset guidance (standard flow; no new email-recovery function added — reset stays admin-driven via `admin_reset_password`, unchanged).
- ✅ **Attendance untouched:** `PlainCapture`/`FaceScanRing` still referenced by AttendancePage/AttendancePhotosPage; no biometric code removed.
- ✅ Authorization/permissions/RLS/schema unchanged.

## Notes / follow-ups (not done here)
- Self-service email password reset (`resetPasswordForEmail` + a recovery landing page) was **not** added — it is net-new functionality and out of scope for a decoupling task. Forgot-password currently routes users to their admin (matching how resets actually work today). Say the word and I'll add full self-service reset as its own task.
- `face-login` edge function is now client-orphaned — candidate for removal in a later cleanup if Attendance won't reuse it.
- **Not yet committed/pushed** — this change is local until you approve; staging (`tps-oms-staging.pages.dev`) still shows the old face-enabled login until pushed to the `staging` branch.
