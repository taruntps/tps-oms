# PR3 M4 — Supabase Dashboard Security Recommendations

> These are **dashboard/console settings only you can apply** (no code). Apply on **production** (`portal.tpsxpert.com` project) and mirror on staging.
> Evidence basis: security advisor + `auth.users` snapshot (staging: 8 users, all email-confirmed, email-only, **0 MFA enrolled**) + this app being **internal-only** (users are admin-provisioned via `admin_create_user`; there is no legitimate public sign-up).

## 🔴 Critical / High (do first)
1. **Disable public sign-ups.** Auth → **Sign In / Providers** (or Settings) → turn **OFF** "Allow new users to sign up". *Internal ERP — accounts are created by admins only. If this is ON, anyone with the public anon key can self-register.* **Verify this first.**
2. **Apply the two RPC revokes to PRODUCTION.** Run migration `101_sec_revoke_definer_execute_from_public.sql` on the prod Supabase project (the `get_google_sa_json` / `get_employee_face_by_email` exposure is almost certainly live on prod). *This is SQL, not a toggle — say the word and I'll prepare it; you run/approve it against prod.*
3. **Enable Leaked Password Protection.** Auth → **Passwords** → enable "Check against HaveIBeenPwned". *(Advisor-confirmed OFF.)*

## 🟠 Recommended (strong)
4. **Enable MFA (TOTP).** Auth → **Multi-Factor Authentication** → enable TOTP. Enforce/encourage for **super_admin + director** at minimum. *(Evidence: 0 factors enrolled today.)*
5. **Strengthen password policy.** Auth → **Passwords** → minimum length **≥ 10** (app RPC currently enforces only ≥ 6) + require character classes (lower/upper/digit/symbol).
6. **Restrict redirect URLs.** Auth → **URL Configuration** → set **Site URL** = `https://portal.tpsxpert.com` and **Redirect Allow List** to only prod + staging origins. *Blocks auth-redirect abuse.*
7. **Session / token hygiene.** Auth → **Sessions**: enable **refresh-token rotation** + **reuse detection**; set a **max session lifetime** / inactivity timebox (server-side complement to the app's 15-min idle logout). Keep access-token expiry ≈ 1h (default).

## 🟡 Good practice
8. **OTP expiry** — Auth → set email OTP/link expiry short (e.g. ≤ 1h). Advisor also flags long OTP expiry as a warning class.
9. **Network restrictions** — Database → **Network Restrictions**: restrict direct Postgres access to known IPs (edge functions/CI). Reduces DB attack surface.
10. **Point-in-Time Recovery / backups** — Database → Backups: ensure PITR/backups enabled (this is also a PR5 item, but confirm now).
11. **API keys** — confirm the **service_role** key exists only in **Edge Function secrets / server env**, never client (code-verified clean); rotate the anon key only if you suspect leakage (it is public by design).
12. **`avatars` bucket public-listing** (advisor) — optionally make `avatars` private + serve via signed URLs (low sensitivity; profile pictures).
13. **Leave `extension_in_public` (moddatetime, pg_net)** as-is — best-practice only; moving extensions on a live DB is riskier than the benefit.

## Not needed (evidence-based)
- No social/OAuth providers configured (email-only) → no OAuth-scope/redirect exposure to review.
- All users email-confirmed → no unconfirmed-account cleanup needed.

## Priority order
1 → 2 → 3 (close exposures / stop self-signup / leaked-password), then 4 → 5 → 6 → 7 (auth hardening), then 8–13 (good practice / PR5 overlap).
