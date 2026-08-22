# Promotional Email — Standard Operating Procedure (TPS Xperts Group)

A permanent, repeatable system for sending promotional emails to clients.
**Tool: Zoho Campaigns** (NOT the portal / ZeptoMail — see the warning at the bottom).

## Assets & where they live (permanent)

| Asset | Permanent home | Notes |
|---|---|---|
| Email template | **Zoho Campaigns → Templates → "TPS Promo — Master"** | Reused for every campaign |
| Template source/backup | `marketing/promo-email-template.html` (this repo) | Version-controlled master |
| This runbook | `marketing/PROMO-EMAIL-SOP.md` (this repo) | Update when the process changes |
| Client mailing list | **Zoho Campaigns → Contacts → list "TPS Clients"** | Kept current (see "List maintenance") |
| Brochures / PDFs | One public location (Zoho file library, or portal storage, or Drive "Public") | Button links to the hosted PDF |

## One-time setup (do once)

1. Zoho Campaigns → **Templates → Create Template → "Code your own" (HTML)**.
2. Paste the contents of `marketing/promo-email-template.html`.
3. **Save as "TPS Promo — Master."**
4. Create a **Contacts list "TPS Clients"** and import the client CSV (see below).

## Per-campaign workflow (every promo)

1. **Create Campaign → Email → template "TPS Promo — Master."**
2. Edit only the `<!-- EDIT: … -->` blocks: preview text, headline, body, bullets, sign-off.
3. **Brochure:** upload the new PDF to the hosted location, copy its link, paste into the
   **Download Brochure** button's `href`.
4. **Personalize:** cursor after "Dear" → Zoho **Insert Merge Tag → First Name**.
5. Set **Subject** + preview text. Select list **"TPS Clients"** (or a segment).
6. **Send a test to yourself.** Check desktop + mobile, click the brochure button.
7. **Send now / Schedule** (best B2B window: Tue–Thu, ~10–11 AM IST).
8. Review **open/click report** in Zoho afterwards.

## List maintenance (keeping "TPS Clients" current)

- **Manual (default):** ask the dev to export a fresh CSV from the portal CRM
  (First Name + Email + fields to personalize) → Zoho → import into "TPS Clients"
  (Zoho de-duplicates by email). Do this before a campaign if clients changed.
- **Automated (optional upgrade):** a scheduled job pushes new/updated portal clients
  into the Zoho list via the Zoho Campaigns API. Requires a Zoho Campaigns API token.
  Sending stays manual (you review each promo) — only the list is auto-synced.

## Compliance (must-follow)

- Send only to clients/contacts who have a business relationship / consent.
- **Every email must keep the unsubscribe link + postal address** (already in the footer).
- Honour unsubscribes automatically (Zoho does this).

## ⚠️ Do NOT send bulk via the portal / ZeptoMail

ZeptoMail is **transactional only** (OTPs, alerts). Sending promotional bulk through it
violates policy and can get the account suspended — which would break portal **OTP logins
and all alerts**. Always use Zoho Campaigns for promotions.
