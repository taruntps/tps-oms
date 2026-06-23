# Client Module Fixes — Design Spec
**Date:** 2026-06-23  
**Project:** TPS OMS — portal.tpsxpert.com  
**Status:** Approved, ready for implementation

---

## Goal

Harden the client data model with mandatory data integrity rules (ALL CAPS names, GSTIN validation, FSSAI validation, duplicate prevention, record locking) and provide a Google Sheets-based bulk import utility as a permanent backup mechanism.

---

## Architecture

Three layers of change:

1. **Database** — Postgres trigger for ALL CAPS normalisation; new `gstin_is_placeholder` column; `can_edit_clients` flag on `profiles`
2. **Portal (React)** — Form changes (GSTIN toggle, real-time caps, locking UX, UI fixes); User Management permission toggle
3. **Google Sheets** — Apps Script utility with push (import) and pull (backup) buttons

---

## 1. Data Integrity Rules

### 1.1 Company Name — Always ALL CAPS

- **Frontend:** `text-transform: uppercase` CSS on the company name input + `.toUpperCase()` applied before save
- **Database:** `BEFORE INSERT OR UPDATE` trigger on `clients` table:
  ```sql
  NEW.company_name := UPPER(NEW.company_name);
  ```
- Contact person name is **not** uppercased — stored and displayed in Title Case (CSS `text-transform: capitalize`)

### 1.2 GSTIN — Exactly 15 Characters, Always Uppercase

- Form has a **"GSTIN Available?"** toggle with two states:
  - **Yes** → text input shown, validated: exactly 15 alphanumeric characters (`/^[A-Z0-9]{15}$/`), stored as `UPPER()`
  - **No** → no input shown; system auto-generates `NOGSTN` + 9 random uppercase alphanumeric characters = 15 chars total (e.g. `NOGSTNX7K2P9Q4M`)
- New DB column: `gstin_is_placeholder BOOLEAN NOT NULL DEFAULT false`
  - Set to `true` when system generates the placeholder
  - Set to `false` when a real GSTIN is entered
- GSTIN has a unique index (`idx_clients_gstin`) — duplicate GSTIN on save shows inline error: *"This GSTIN is already registered with another client"*
- For no-GSTIN clients: additionally check company name similarity (first 6+ words match against existing records) → show yellow **warning dialog** before allowing save:
  > *"A client named '[NAME]' already exists. Are you sure this is a different company?"*  
  > Buttons: **Cancel** | **Yes, add anyway**

### 1.3 FSSAI License — Exactly 14 Digits

- Validation in `LicenseForm.tsx`: regex `/^\d{14}$/`
- Error message: *"FSSAI number must be exactly 14 digits (numbers only)"*
- Field is **optional** — blank is allowed; only validated when a value is entered

---

## 2. Client Record Locking

### 2.1 Lock Behaviour

- All client fields become **read-only** immediately after the first save
- Users without edit permission see fields as plain text (no input boxes), with a small **🔒** icon in the card header
- No "request edit" flow — keep it simple

### 2.2 Who Can Edit

- **Super Admin** — always has edit rights (bypasses flag)
- **All other users** — require `profiles.can_edit_clients = true`

### 2.3 New DB Column

```sql
ALTER TABLE profiles ADD COLUMN can_edit_clients BOOLEAN NOT NULL DEFAULT false;
```

- Default `false` — locked for everyone except super_admin until explicitly granted
- Only `super_admin` can flip this flag

### 2.4 User Management UI

- New **"Edit Clients"** column in the User Management table
- Toggle (on/off) per user row — visible and editable only by super_admin
- This is the first granular permission flag; Sub-project C (Permission System) will expand on this pattern

---

## 3. Client Form Changes

### 3.1 GSTIN Toggle

```
GSTIN Available?   [● Yes]  [  No]

Yes → shows: [_______________] (15-char input, auto-uppercase)
No  → shows grey info box: "A placeholder ID will be assigned: NOGSTN_________"
```

### 3.2 Company Name Field

- Placeholder updates to: `"e.g. WALPAR NUTRITIONS LIMITED"`
- Characters transform to uppercase as user types (real-time)

### 3.3 Duplicate Check Flow

1. On form submit, check GSTIN uniqueness → DB unique constraint handles this, show friendly error
2. For no-GSTIN clients, run name similarity check client-side against loaded client list before calling API
3. If match found → show warning modal → user confirms or cancels

---

## 4. Client UI Fixes

### 4.1 Client List Card

| Element | Current | Fixed |
|---------|---------|-------|
| Company name | Mixed case from import | ALL CAPS (DB trigger enforces) |
| Contact person | Mixed case | Title Case via CSS `capitalize` |
| Avatar initials | First 2 chars | Unchanged (works well with caps) |

### 4.2 Client Detail Page

- **No-GSTIN badge:** If `gstin_is_placeholder = true`, show amber badge **"⚠ No GSTIN"** next to the GSTIN field
- **Locked state:** Fields render as plain text for read-only users; 🔒 icon in card header
- **Edit button:** Visible only to super_admin or users with `can_edit_clients = true`

---

## 5. Google Sheets Sync Utility

### 5.1 Sheet Structure

One Google Sheet shared with the team. Two tabs:

**Tab 1: `Clients`** — Fixed columns (header row frozen, columns locked):

| Column | Field | Notes |
|--------|-------|-------|
| A | Company Name | Script uppercases on sync |
| B | GSTIN Available (Yes/No) | Dropdown validation |
| C | GSTIN | Required if B = Yes; leave blank if B = No |
| D | Contact Person | Title Case |
| E | Phone | 10 digits |
| F | Email | Valid email format |
| G | State | Dropdown from India states list |
| H | District | Free text |
| I | FSSAI License No | Optional, 14 digits if filled |
| J | FSSAI Valid Till | Date (DD/MM/YYYY) |
| K | Notes | Free text |

**Tab 2: `Sync Log`** — Auto-filled by script on every sync run:

| Column | Content |
|--------|---------|
| Timestamp | Run date/time |
| Total rows | Rows processed |
| Imported | New rows successfully inserted |
| Skipped | Duplicates skipped (reason noted) |
| Errors | Validation failures (row + reason) |

### 5.2 Two Buttons

| Button | Function |
|--------|----------|
| **▶ Sync to Supabase** | Push new client rows to DB |
| **⬇ Pull from Supabase** | Fetch all clients from DB back to sheet |

### 5.3 Push Logic (Sync to Supabase)

1. Read all rows with data in column A
2. For each row:
   - Normalize: `company_name → UPPER()`, `gstin → UPPER()`
   - Validate: GSTIN exactly 15 chars if provided; FSSAI exactly 14 digits if provided; required fields present
   - If GSTIN Available = No → generate `NOGSTN` + 9 random alphanumeric; set `gstin_is_placeholder = true`
   - Duplicate check: GSTIN match against existing → skip + log. No-GSTIN → name similarity (6+ words) → skip + log
3. Batch insert valid rows via Supabase REST API (`POST /rest/v1/clients`)
4. Service role key stored in **Script Properties** (not visible in sheet)
5. Write results to `Sync Log` tab with timestamp

### 5.4 Pull Logic (Pull from Supabase)

1. Call `GET /rest/v1/clients?select=*&order=company_name`
2. Clear existing data rows in `Clients` tab (keep header row)
3. Write all clients back to sheet
4. Serves as full snapshot backup of the live database

### 5.5 Security

- Supabase service role key stored in **Google Apps Script → Project Settings → Script Properties**
- Key is never written into sheet cells or script source
- Sheet sharing: controlled by Google Drive permissions (team members only)

---

## 6. Out of Scope (This Sub-project)

- Sub-project B (Project workflow redesign)
- Sub-project C (Granular permission system — full implementation)
- Sub-project D (Individual task module)
- Sub-project E (Dashboards and reports)
- Client deletion (not implemented — clients are never deleted, only deactivated)

---

## 7. Files Touched

| File | Change |
|------|--------|
| `supabase/migrations/007_client_fixes.sql` | New migration: trigger, `gstin_is_placeholder`, `can_edit_clients` |
| `src/data/india.ts` | ✅ Already done — full district list |
| `src/pages/clients/ClientForm.tsx` | GSTIN toggle, caps transform, duplicate warning |
| `src/pages/clients/ClientsPage.tsx` | Title Case CSS for contact person |
| `src/pages/clients/ClientDetailPage.tsx` | Locking UX, no-GSTIN badge, edit button guard |
| `src/pages/clients/LicenseForm.tsx` | FSSAI 14-digit validation tightened |
| `src/hooks/useClients.ts` | `can_edit_clients` check helper |
| `src/pages/admin/UserManagementPage.tsx` | "Edit Clients" toggle column |
| `google-sheets/sync-clients.gs` | New — Apps Script for push + pull |

---

## 8. Testing Checklist

- [ ] Company name saved in ALL CAPS regardless of input case
- [ ] GSTIN toggle: Yes shows input, No generates `NOGSTN_________`
- [ ] GSTIN shorter/longer than 15 chars → validation error
- [ ] Duplicate GSTIN → friendly error, form stays open
- [ ] No-GSTIN name similarity → warning dialog appears
- [ ] FSSAI 13 or 15 digits → validation error; 14 digits → passes
- [ ] Client detail locked for users without `can_edit_clients`
- [ ] Super admin always sees Edit button
- [ ] `can_edit_clients` toggle in User Management works
- [ ] Google Sheet push: new row imported correctly
- [ ] Google Sheet push: duplicate GSTIN skipped, logged
- [ ] Google Sheet pull: all clients appear in sheet
- [ ] `⚠ No GSTIN` badge visible on placeholder GSTIN clients
