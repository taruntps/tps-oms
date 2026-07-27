# Phase 0 + Phase 1 — Go-Live Readiness Report

> Scope executed: pre-flight, verification, and migration readiness ONLY. **No production data copied. Old prod (Blue) untouched — read-only SELECTs only. No writes to either database.** Awaiting your review before Phase 2.

## ✅ Verdict: READY for Phase 2, subject to 4 dashboard items you must set (below)

---

## 1. Codebase gate (Phase 0.3)
| Check | Result |
|---|---|
| Branch | `staging` @ `5ae9fae` |
| `npm run build` (`tsc -b && vite build`) | ✅ clean, built in 25s |
| Entry chunk | 49.5 kB (14 kB gz); vendors split; xlsx async |

## 2. Green (staging → live) readiness
| Check | Result | Verdict |
|---|---|---|
| Base tables | 156 | ✅ full platform |
| **RLS coverage** | **156 / 156 (0 without)** | ✅ |
| RLS policies | 341 | ✅ |
| Functions | 65 | ✅ |
| **All 41 prod tables present** | yes (0 missing) | ✅ copy targets exist |
| **Security hotfix in place** | `get_google_sa_json` & `get_employee_face_by_email`: no EXECUTE for anon / authenticated / public; ACL not default | ✅ already locked |
| Edge Functions | 14 incl. `billing-worker` (Blue's junk `awstest-temp`/`facediag-temp` correctly absent) | ✅ |
| Storage buckets | attendance, avatars, documents, face-refs, invoice-pdfs (all 5) | ✅ copy targets ready |
| **Migrations to apply** | **none** — Green is already ahead of Blue | ✅ no risky prod-migration step |

**Migration readiness = data-migration readiness:** because Green already carries the full, correct schema, go-live needs **no schema migrations** — only data. This is exactly why "promote staging" avoids the drift risk.

## 3. Blue (old prod) baseline captured — Phase-2 validation target
**~10,328 business rows across 41 tables.** Largest: soi_products 4103, notifications 1522, whatsapp_log 1336, stages 577, stage_audit_log 469, stage_timeline 462, login_attempts 384, audit_log 311, notification_log 310, credential_access_log 213, payments 100, projects 91, query_points 89, clients 77, licenses 64, attendance_punches 51. Empty in prod: documents, client_documents, employee_details, knowledge_base, task_comments, task_extension_requests, project_transfers, performance_reports, delete_requests.

**Auth users to recreate in Green (5, all real staff, same UUIDs, password-reset at cutover):**
| Email | Role |
|---|---|
| tarun@tpsxpert.com | super_admin |
| jyoti@tpsxpert.com | manager |
| regulatory@tpsxpert.com | executive |
| advisory@tpsxpert.com | executive |
| head.ra@tpsxpert.com | executive |

**Storage to copy (tiny — ~68 objects, ~5.5 MB):** attendance 54 (0.6 MB), documents 8 (4.8 MB), face-refs 5 (0.1 MB), avatars 1. *(Note: prod `documents` TABLE is empty — file attachments largely live in Google Drive, not Supabase Storage, so storage copy is minimal.)*

## 4. Green test data to purge before load (Phase 1.1 — PREPARED, NOT RUN)
8 test auth users, 8 profiles, 3 clients, 2 projects, 0 of everything else. Purge script prepared at `green_purge_testdata.sql` (ordered child→parent DELETEs; auth users via Admin API). **Not executed** — it runs at the start of Phase 2 with your approval. Exact FK-dependent set will be re-verified against Green immediately before running.

## 5. Items ONLY you can set (I cannot reach these via API) — required before/at Phase 2
1. **Green tier + PITR/backups** — you confirmed paid tier ✅; please also toggle **Point-in-Time Recovery + daily backups ON** (Green → Database → Backups).
2. **Backup Blue** — take an on-demand backup of old prod before Phase 2 (Blue → Database → Backups) and note the restore point. *(Copy never writes Blue, but this is the safety net.)*
3. **Green auth hardening** (Green → Authentication → Providers/Policies): disable public sign-ups, enable leaked-password protection, set Site URL / redirect URLs to `https://portal.tpsxpert.com`, and configure SMTP so password-reset emails send at cutover.
4. **Secrets for Phase 2.D** — see the verified inventory in §7 below. (Vault can be auto-migrated by me; Edge Function env values you copy Blue→Green.)

## 7. Verified secret inventory (Phase 2.D)
**Vault — Blue has 64 secrets; Green Vault is empty.**
- `google_sa_json` ×1 (Google service account for Drive)
- `fssai_cred_<license-uuid>` ×62 (per-license FSSAI portal passwords; 62 of 64 licenses)

Because Phase 2 preserves license UUIDs, these secret **names still match** after the copy. **Migration path:** auto — read each decrypted value from Blue's `vault.decrypted_secrets` and recreate in Green via `vault.create_secret(value, name, description)`. Caveat: plaintext transits tool output (only way to move cross-project — encrypted per-project key). User to choose auto vs manual at Phase 2 start.

**Mailer = ZeptoMail (NOT Resend).** Edge Functions use `ZEPTOMAIL_TOKEN` + `MAIL_FROM`. Auth SMTP → `smtp.zeptomail.in:587`, user `emailapikey`, pass = ZeptoMail token.

**Edge Function secrets to copy Blue→Green (values write-only; user copies).** Auto-injected `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` excluded:
`ZEPTOMAIL_TOKEN, MAIL_FROM, SITE_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, GETSWIPE_API_KEY, GETSWIPE_BASE_URL, GETSWIPE_BUSINESS_ID, GETSWIPE_WEBHOOK_SECRET, BILLING_PROVIDER, DRIVE_SUB_EMAIL, SHEETS_SYNC_TOKEN`

## 6. What did NOT happen (by your instruction)
- ❌ No production data copied. ❌ No writes to Blue or Green. ❌ Purge not executed. ❌ No `staging→main` merge. ❌ No secrets flipped. ❌ Nothing deployed.

---

## Recommendation
Green is schema-complete, fully RLS-protected, security-hardened, and every copy target (tables, buckets, functions) exists. Blue baseline is captured for row-count validation. **Approve Phase 2** and I will: (2.A) purge Green test data + recreate the 5 auth users with matching UUIDs → (2.B) copy all 41 tables in FK order → (2.C) copy the ~68 storage objects → (2.D) you re-enter secrets, I verify Drive + a send → (2.E) full Blue-vs-Green validation report. I stop for your OK before the flip (Phase 4).
