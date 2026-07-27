# PR3 — Security Audit Report (Phase 1) — evidence-based

> Read-only audit of staging (`gytscakgtsbxgdkbqhbx`) + codebase. **No changes made.** Fixes await approval.
> Note: production (`portal.tpsxpert.com`) may differ from staging (known drift) — findings should be re-confirmed on prod before/at go-live.

## 🔴 CRITICAL
### C1 — `get_google_sa_json()` exposes the Google service-account secret to any caller
- **Evidence:** `SECURITY DEFINER`, `EXECUTE` granted to **`anon` + `authenticated`**, no caller guard; body `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='google_sa_json'`.
- **Risk:** Anyone holding the **public anon key** (it ships in the client bundle) can `POST /rest/v1/rpc/get_google_sa_json` and exfiltrate the **decrypted Google service-account JSON** → full access to the connected Google Drive/Sheets. Unauthenticated exploit.
- **Root cause:** blanket `EXECUTE` grant to `anon`/`authenticated` on a Vault-reading definer function.
- **Fix (safe, reversible):** `REVOKE EXECUTE ON FUNCTION public.get_google_sa_json() FROM anon, authenticated;` — `service_role` retains it. Verified: client never calls it; only the `drive-ops` edge function (service_role) does. **No app behaviour change.**

## 🟠 HIGH
### H1 — `get_employee_face_by_email(email)` exposes biometric face descriptors to any caller
- **Evidence:** `SECURITY DEFINER`, `EXECUTE` to `anon` + `authenticated`, no guard; returns `user_id, email, face_descriptor` for any email.
- **Risk:** anon can harvest **biometric face templates** and enumerate valid employee emails.
- **Fix:** `REVOKE EXECUTE ... FROM anon, authenticated;` (service_role/face-login edge fn retains). Client never calls it. **No behaviour change.**

### H2 — `xlsx` (SheetJS) — Prototype Pollution + ReDoS (no npm fix)
- **Evidence:** `npm audit` HIGH ×2; `xlsx@0.18.5` frozen on npm.
- **Mitigating fact:** used **export-only** (`aoa_to_sheet`/`writeFile` from our own data); we do **not** parse untrusted `.xlsx`. Real exploitability low.
- **Fix options:** (a) accept + document (export-only), or (b) replace npm `xlsx` with the official SheetJS CDN build. Recommend (a) now, (b) as a follow-up.

## 🟡 MEDIUM
### M1 — No HTTP security headers (CSP / clickjacking / camera policy)
- **Evidence:** no `public/_headers`, no CSP meta. Missing: `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors` (clickjacking), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (camera), `Strict-Transport-Security`.
- **Fix:** add `public/_headers` (Cloudflare Pages). Additive, reversible. Notably a `Permissions-Policy: camera=(self)` reinforces the face-decouple, and `frame-ancestors 'none'` blocks clickjacking.

### M2 — `react-router` moderate CVEs
- **Evidence:** `npm audit` — open-redirect via backslash in `<Link>`/`useNavigate`; deserializeErrors constructor-injection (**SSR-only → N/A to this SPA**). Fix available.
- **Fix:** bump to patched version; regression-test routing (6→7 may be breaking — verify).

### M3 — Idle logout: no 13-min warning + stale message
- **Evidence:** `useIdleLogout` logs out at 15 min (✅) but there is **no 13-minute warning dialog** (PR3 requires it); toast says "30 minutes" (actual is 15).
- **Fix:** add a warning modal at 13 min (with "stay signed in") + correct the message.

### M4 — Leaked-password protection disabled
- **Evidence:** advisor `auth_leaked_password_protection`. Supabase HaveIBeenPwned check is OFF.
- **Fix:** enable in Supabase Dashboard → Auth → Passwords (no code).

## 🟢 LOW / INFO
- **L1** `avatars` bucket is public + listable (avatar enumeration; low sensitivity). Optional: private + signed URLs.
- **L2** `extension_in_public` (moddatetime, pg_net) — best-practice only; leave (risky to move on live DB).
- **L3** `rls_enabled_no_policy` ×1 (INFO) — deny-all, safe; confirm intended.
- **L4** `invoice-pdfs` bucket private with no referencing policy — verify the app's download path (functional, not a leak).
- **L5** Some legacy routes lack `allowedRoles` (defense-in-depth); RLS is authoritative, so not a hole.

## ✅ Validated strengths (evidence)
- **No service-role key or secrets in the client bundle**; `.env` gitignored; env samples are placeholders.
- **RLS enabled on every public table** (advisor found zero `rls_disabled`). HR salary/PII/payroll confined to hr/director/super_admin (M4 as-built).
- **Sensitive definer RPCs self-guard** with `has_role()` — `admin_create_user`, `admin_reset_password`, `delete_client/project`, `store/reveal_fssai_credential`. (C1/H1 are the only unguarded sensitive ones.)
- **Sensitive storage private** (`documents`, `attendance`, `face-refs`) with policies; only low-sensitivity `avatars` public.
- **No `dangerouslySetInnerHTML`** (XSS-safe); minimal logging, nothing sensitive.
- **Auth:** password-only login (no camera), brute-force lockout (`check_login_locked`/`record_login_attempt`), 15-min idle logout, persistSession + autoRefreshToken, remember-me storage split, refresh-race fixed (03c921c).

## Security Scores (0–100)
| Area | Now | After C1/H1 (+M1–M4) |
|---|---|---|
| Authentication | 80 | 90 |
| Authorization | 90 | 92 |
| **Data Protection** | **55** (C1 secret exposure) | 92 |
| API Security | 70 | 90 |
| Frontend Security | 72 | 86 |
| Dependency Security | 65 | 75 |
| Logging | 95 | 95 |
| **Overall** | **~72** | **~89** |

## Production Readiness recommendation
**❌ Additional security fixes required before PR4** — specifically **C1 (critical) and H1 (high)** are *live* exposures reachable with the public anon key. Both fixes are 2-line, reversible `REVOKE` migrations with **no app behaviour change** (verified the client never calls these RPCs). After C1/H1 (+ the MEDIUM items), → ✅ ready for PR4.

## Proposed Phase-2 order (all reversible; stop-before-destructive)
1. **C1 + H1** — REVOKE EXECUTE from anon/authenticated (migration). *Highest priority — live exposure.*
2. **M1** — add `public/_headers` (CSP, frame-ancestors, Permissions-Policy camera, etc.).
3. **M3** — 13-min idle warning modal + fix stale text.
4. **M4** — enable leaked-password protection (dashboard; your action).
5. **M2** — react-router patch (+ routing regression test).
6. **H2/L*** — document/accept or schedule.
