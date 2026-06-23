# Client Module Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden client data integrity (ALL CAPS names, GSTIN toggle with placeholders, FSSAI 14-digit validation, duplicate prevention, record locking, Title Case contact person, no-GSTIN badge) and add a Google Sheets two-way sync utility.

**Architecture:** DB trigger enforces ALL CAPS; two new boolean columns (`gstin_is_placeholder` on `clients`, `can_edit_clients` on `profiles`) drive form behaviour and access control; `ClientForm` handles GSTIN toggle + duplicate warning entirely on the frontend; `ClientDetailPage` guards the Edit button and renders the no-GSTIN amber badge.

**Tech Stack:** React 18, TypeScript, Zod, react-hook-form, TanStack Query, Supabase (Postgres triggers + RLS), Tailwind CSS, Google Apps Script.

---

## File Map

| File | Status | Change |
|------|--------|--------|
| `supabase/migrations/007_client_fixes.sql` | **CREATE** | ALL CAPS trigger, `gstin_is_placeholder` column, `can_edit_clients` column |
| `src/types/index.ts` | **MODIFY** | Add `can_edit_clients: boolean` to `UserProfile` |
| `src/hooks/useClients.ts` | **MODIFY** | Add `useCanEditClient()` helper |
| `src/pages/clients/ClientForm.tsx` | **REWRITE** | GSTIN toggle, ALL CAPS, duplicate warning dialog |
| `src/pages/clients/ClientsPage.tsx` | **MODIFY** | Add `capitalize` class to contact_person display |
| `src/pages/clients/ClientDetailPage.tsx` | **MODIFY** | Edit guard, 🔒 icon, ⚠ No GSTIN badge |
| `src/pages/clients/LicenseForm.tsx` | **MODIFY** | Tighten FSSAI to `/^\d{14}$/` |
| `src/pages/admin/UserManagementPage.tsx` | **MODIFY** | Add "Edit Clients" toggle column |
| `google-sheets/sync-clients.gs` | **CREATE** | Apps Script push + pull sync |

---

## Task 1 — Supabase Migration 007

**Files:**
- Create: `supabase/migrations/007_client_fixes.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/007_client_fixes.sql` with this exact content:

```sql
-- ============================================================
-- MIGRATION 007 — Client Module Fixes
-- Adds: gstin_is_placeholder, can_edit_clients, ALL CAPS trigger
-- ============================================================

-- 1. Add gstin_is_placeholder to clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS gstin_is_placeholder BOOLEAN NOT NULL DEFAULT false;

-- 2. Add can_edit_clients to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_edit_clients BOOLEAN NOT NULL DEFAULT false;

-- 3. ALL CAPS trigger for company_name
CREATE OR REPLACE FUNCTION fn_uppercase_company_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.company_name := UPPER(NEW.company_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_uppercase_company_name ON clients;
CREATE TRIGGER trg_uppercase_company_name
  BEFORE INSERT OR UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION fn_uppercase_company_name();

-- 4. Backfill: uppercase all existing company names
UPDATE clients SET company_name = UPPER(company_name)
  WHERE company_name <> UPPER(company_name);

-- 5. RLS policy: only super_admin can toggle can_edit_clients
-- (Existing profiles update policy already restricts to own row or super_admin — verify in 003_rls_policies.sql)
-- No additional policy needed if profiles.update policy already covers super_admin bypass.
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Run this SQL using the `mcp__71fe10cc__execute_sql` tool (project `tpscert`):

```sql
-- Run the full contents of 007_client_fixes.sql (copy-paste above)
```

Expected: No errors. All statements succeed.

- [ ] **Step 3: Verify the migration applied**

Run via Supabase MCP:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'gstin_is_placeholder';
```

Expected: 1 row — `gstin_is_placeholder`, `boolean`, `false`.

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'can_edit_clients';
```

Expected: 1 row — `can_edit_clients`, `boolean`, `false`.

```sql
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'clients' AND trigger_name = 'trg_uppercase_company_name';
```

Expected: 1 row — `trg_uppercase_company_name`.

- [ ] **Step 4: Verify ALL CAPS backfill**

```sql
SELECT COUNT(*) FROM clients WHERE company_name <> UPPER(company_name);
```

Expected: `0` — all names already uppercased.

- [ ] **Step 5: Test the trigger with a live insert**

```sql
INSERT INTO clients (company_name, contact_person, contact_email, contact_phone, state, gstin)
VALUES ('test client lowercase', 'Test Person', 'test@test.com', '9876543210', 'Punjab', 'TESTGSTIN000001')
RETURNING company_name;
```

Expected: `company_name` = `TEST CLIENT LOWERCASE`.

Then clean up:

```sql
DELETE FROM clients WHERE gstin = 'TESTGSTIN000001';
```

- [ ] **Step 6: Commit the migration file**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms
git add supabase/migrations/007_client_fixes.sql
git commit -m "feat: migration 007 — ALL CAPS trigger, gstin_is_placeholder, can_edit_clients"
```

---

## Task 2 — Update TypeScript Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `can_edit_clients` to `UserProfile`**

In `src/types/index.ts`, find the `UserProfile` interface (currently lines 25–35) and add `can_edit_clients`:

```typescript
export interface UserProfile {
  id: string
  name: string
  email: string
  role: UserRole
  is_active: boolean
  can_edit_clients: boolean   // ← ADD THIS LINE
  department?: string
  phone?: string
  joining_date?: string
  created_at: string
}
```

- [ ] **Step 2: Verify TypeScript build passes**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no new errors (there may be pre-existing `as any` warnings — ignore those).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add can_edit_clients to UserProfile type"
```

---

## Task 3 — Add `useCanEditClient` Helper

**Files:**
- Modify: `src/hooks/useClients.ts`

- [ ] **Step 1: Add the helper at the bottom of `useClients.ts`**

Append to the end of `src/hooks/useClients.ts`:

```typescript
/**
 * Returns true if the current user may edit client records.
 * super_admin always can; others need can_edit_clients = true on their profile.
 */
export function useCanEditClient(): boolean {
  const { profile } = useAuth()
  if (!profile) return false
  return profile.role === 'super_admin' || profile.can_edit_clients === true
}
```

Also add the import at the top of the file (after the existing imports):

```typescript
import { useAuth } from '@/contexts/AuthContext'
```

The full updated top of `src/hooks/useClients.ts` should look like:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: No new TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useClients.ts
git commit -m "feat: add useCanEditClient permission helper"
```

---

## Task 4 — Rewrite ClientForm with GSTIN Toggle + ALL CAPS + Duplicate Warning

**Files:**
- Rewrite: `src/pages/clients/ClientForm.tsx`

This task replaces the entire file. Read the current file first, then write the new version.

- [ ] **Step 1: Replace `src/pages/clients/ClientForm.tsx` with the new implementation**

Write the following complete file content to `src/pages/clients/ClientForm.tsx`:

```typescript
import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, AlertTriangle } from 'lucide-react'
import { useCreateClient, useUpdateClient, useClients, type Client } from '@/hooks/useClients'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { STATE_NAMES, getCitiesForState } from '@/data/india'

// ── Utilities ───────────────────────────────────────────────────────────────

function generatePlaceholderGstin(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let suffix = ''
  for (let i = 0; i < 9; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return 'NOGSTN' + suffix // 6 + 9 = 15 chars total
}

function findSimilarClient(newName: string, clients: Client[], skipId?: string): Client | undefined {
  const words = newName.trim().toUpperCase().split(/\s+/)
  if (words.length < 6) return undefined // too short to trigger similarity check
  const first6 = words.slice(0, 6).join(' ')
  return clients.find(c => {
    if (skipId && c.id === skipId) return false
    const existing = c.company_name.trim().toUpperCase().split(/\s+/).slice(0, 6).join(' ')
    return existing === first6
  })
}

// ── Schema ─────────────────────────────────────────────────────────────────

const schema = z.object({
  company_name:    z.string().min(2, 'Required'),
  contact_person:  z.string().min(2, 'Required'),
  contact_phone:   z.string().min(10, 'Enter valid phone'),
  contact_email:   z.string().email('Invalid email'),
  city:            z.string().min(1, 'Select city'),
  state:           z.string().min(1, 'Select state'),
  gstin:           z.string().optional(),
  pan:             z.string().optional(),
  whatsapp_number: z.string().optional(),
  notes:           z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  client?: Client
  onClose: () => void
}

// ── Component ──────────────────────────────────────────────────────────────

export function ClientForm({ client, onClose }: Props) {
  const { profile } = useAuth()
  const create = useCreateClient()
  const update = useUpdateClient()
  const { data: allClients = [] } = useClients()
  const isEdit = !!client

  // Infer initial toggle state: if editing a client with a placeholder GSTIN → toggle off
  const [gstinAvailable, setGstinAvailable] = useState<boolean>(
    isEdit ? !(client as any).gstin_is_placeholder : true
  )
  const [showDupWarning, setShowDupWarning] = useState(false)
  const [dupClientName, setDupClientName] = useState('')
  const pendingData = useRef<FormData | null>(null)

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      company_name:    client?.company_name ?? '',
      contact_person:  client?.contact_person ?? '',
      contact_phone:   client?.contact_phone ?? '',
      contact_email:   client?.contact_email ?? '',
      city:            client?.city ?? '',
      state:           client?.state ?? 'Punjab',
      gstin:           (client as any)?.gstin_is_placeholder ? '' : (client?.gstin ?? ''),
      pan:             client?.pan ?? '',
      whatsapp_number: (client as any)?.whatsapp_number ?? '',
      notes:           client?.notes ?? '',
    },
  })

  const selectedState = watch('state')
  const [cities, setCities] = useState<string[]>([])

  useEffect(() => {
    const list = getCitiesForState(selectedState)
    setCities(list)
    const currentCity = watch('city')
    if (currentCity && !list.includes(currentCity)) setValue('city', '')
  }, [selectedState])

  useEffect(() => {
    setCities(getCitiesForState(selectedState))
  }, [])

  // ── Save logic ─────────────────────────────────────────────────────────────

  const doSave = async (data: FormData) => {
    const finalGstin = gstinAvailable
      ? (data.gstin ?? '').toUpperCase()
      : generatePlaceholderGstin()

    const payload = {
      company_name:         data.company_name.toUpperCase(),
      contact_person:       data.contact_person,
      contact_phone:        data.contact_phone,
      contact_email:        data.contact_email,
      city:                 data.city,
      state:                data.state,
      gstin:                finalGstin,
      gstin_is_placeholder: !gstinAvailable,
      pan:                  data.pan || null,
      whatsapp_number:      data.whatsapp_number || null,
      notes:                data.notes || null,
    }

    try {
      if (isEdit) {
        await update.mutateAsync({ id: client.id, ...(payload as any) })
        toast.success('Client updated')
      } else {
        await create.mutateAsync({ ...(payload as any), created_by: profile?.id })
        toast.success('Client added')
      }
      onClose()
    } catch (err: any) {
      if (err.message?.includes('idx_clients_gstin')) {
        toast.error('GSTIN already exists', 'This GSTIN is already registered with another client')
      } else {
        toast.error('Failed to save client', err.message)
      }
    }
  }

  const onSubmit = async (data: FormData) => {
    // Validate GSTIN when available
    if (gstinAvailable) {
      const g = (data.gstin ?? '').toUpperCase()
      if (!/^[A-Z0-9]{15}$/.test(g)) {
        toast.error('Invalid GSTIN', 'GSTIN must be exactly 15 uppercase letters/digits')
        return
      }
    }

    // Duplicate name check — only for no-GSTIN, new clients
    if (!gstinAvailable && !isEdit) {
      const similar = findSimilarClient(data.company_name, allClients)
      if (similar) {
        pendingData.current = data
        setDupClientName(similar.company_name)
        setShowDupWarning(true)
        return
      }
    }

    await doSave(data)
  }

  const handleDupConfirm = async () => {
    setShowDupWarning(false)
    if (pendingData.current) {
      await doSave(pendingData.current)
      pendingData.current = null
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{isEdit ? 'Edit Client' : 'Add Client'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto flex-1 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">

            {/* Company name — ALL CAPS enforced in real time */}
            <Field label="Company Name *" error={errors.company_name?.message} className="col-span-2">
              <input
                {...register('company_name')}
                onChange={e => setValue('company_name', e.target.value.toUpperCase(), { shouldValidate: true })}
                className={ic(!!errors.company_name)}
                placeholder="e.g. WALPAR NUTRITIONS LIMITED"
                style={{ textTransform: 'uppercase' }}
              />
            </Field>

            {/* State + City */}
            <Field label="State *" error={errors.state?.message}>
              <select {...register('state')} className={ic(!!errors.state)}>
                <option value="">Select state…</option>
                {STATE_NAMES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>

            <Field label="City *" error={errors.city?.message}>
              <select {...register('city')} className={ic(!!errors.city)} disabled={!selectedState}>
                <option value="">Select city…</option>
                {cities.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>

            {/* Contact person — Title Case display */}
            <Field label="Contact Person *" error={errors.contact_person?.message}>
              <input
                {...register('contact_person')}
                className={ic(!!errors.contact_person)}
                placeholder="Full name"
                style={{ textTransform: 'capitalize' }}
              />
            </Field>

            <Field label="Phone *" error={errors.contact_phone?.message}>
              <input {...register('contact_phone')} className={ic(!!errors.contact_phone)} placeholder="10-digit mobile" />
            </Field>

            <Field label="Email *" error={errors.contact_email?.message} className="col-span-2">
              <input {...register('contact_email')} className={ic(!!errors.contact_email)} placeholder="client@company.com" />
            </Field>

            {/* GSTIN toggle */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-brand-950 mb-2">GSTIN Available? *</label>
              <div className="flex rounded-lg border border-border overflow-hidden text-sm mb-2">
                <button
                  type="button"
                  onClick={() => setGstinAvailable(true)}
                  className={`flex-1 py-2 font-medium transition-colors ${gstinAvailable ? 'bg-brand-600 text-white' : 'bg-white text-muted-foreground hover:bg-[#F8FAFC]'}`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setGstinAvailable(false)}
                  className={`flex-1 py-2 font-medium transition-colors ${!gstinAvailable ? 'bg-amber-500 text-white' : 'bg-white text-muted-foreground hover:bg-[#F8FAFC]'}`}
                >
                  No
                </button>
              </div>

              {gstinAvailable ? (
                <input
                  {...register('gstin')}
                  onChange={e => setValue('gstin', e.target.value.toUpperCase(), { shouldValidate: false })}
                  className={ic(!!errors.gstin)}
                  placeholder="15-character GSTIN (auto-uppercased)"
                  maxLength={15}
                  style={{ textTransform: 'uppercase' }}
                />
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <AlertTriangle size={12} />
                  A placeholder ID (NOGSTN…) will be auto-assigned. You can update the real GSTIN later.
                </div>
              )}
              {errors.gstin && <p className="text-[11px] text-red-600 mt-1">{errors.gstin.message}</p>}
            </div>

            <Field label="PAN" error={errors.pan?.message}>
              <input {...register('pan')} className={ic(false)} placeholder="10-char PAN" />
            </Field>

            <Field label="WhatsApp Number" error={errors.whatsapp_number?.message}>
              <input {...register('whatsapp_number')} className={ic(false)} placeholder="91XXXXXXXXXX" />
            </Field>

            <Field label="Notes" error={errors.notes?.message} className="col-span-2">
              <textarea {...register('notes')} rows={2} className={ic(false)} />
            </Field>

          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={handleSubmit(onSubmit)} disabled={isSubmitting} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {isSubmitting ? 'Saving…' : isEdit ? 'Update Client' : 'Add Client'}
          </button>
        </div>
      </div>

      {/* Duplicate name warning dialog */}
      {showDupWarning && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-brand-950 mb-1">Possible Duplicate</h3>
                <p className="text-sm text-muted-foreground">
                  A client named <strong>"{dupClientName}"</strong> already exists. Are you sure this is a different company?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowDupWarning(false); pendingData.current = null }}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]"
              >
                Cancel
              </button>
              <button
                onClick={handleDupConfirm}
                className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600"
              >
                Yes, add anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>
      {children}
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
  )
}

const ic = (err: boolean) =>
  `w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 ${err ? 'border-red-400' : 'border-border'}`
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | grep -E "error|warning" | head -30
```

Expected: No new TypeScript errors. (Ignore pre-existing `as any` warnings.)

- [ ] **Step 3: Manual browser test — GSTIN toggle**

Start dev server:
```bash
npm run dev
```

- Open `http://localhost:5173/clients` → click "Add Client"
- Verify GSTIN toggle shows "Yes" (blue) by default with a text input
- Click "No" → toggle goes amber, info box appears, no text input shown
- Click "Yes" again → text input returns
- Type `abc` in GSTIN input, click Add Client → toast "GSTIN must be exactly 15 uppercase letters/digits"
- Type `22AAAAA0000A1Z5` in GSTIN → validation passes (proceed to next failure)

- [ ] **Step 4: Manual browser test — ALL CAPS**

- In Add Client form, type `walpar nutritions limited` in Company Name → it should auto-uppercase to `WALPAR NUTRITIONS LIMITED` as you type
- Submit and check the DB: `SELECT company_name FROM clients ORDER BY created_at DESC LIMIT 1;` → should be ALL CAPS

- [ ] **Step 5: Manual browser test — duplicate warning**

- Add a client with No GSTIN and company name with 6+ words (e.g. "CHIMAK HEALTHCARE PRIVATE LIMITED INDIA TEST")
- Add another client with the same first 6 words — warning dialog should appear
- Click Cancel → dialog closes, form stays open
- Click "Yes, add anyway" → client is saved

- [ ] **Step 6: Commit**

```bash
git add src/pages/clients/ClientForm.tsx
git commit -m "feat: ClientForm — GSTIN toggle, ALL CAPS, duplicate name warning"
```

---

## Task 5 — Title Case Contact Person in ClientsPage

**Files:**
- Modify: `src/pages/clients/ClientsPage.tsx`

- [ ] **Step 1: Add `capitalize` class to the contact_person line**

In `src/pages/clients/ClientsPage.tsx`, find line ~91:

```tsx
<p className="text-xs text-muted-foreground mt-0.5 truncate">{client.contact_person} · {client.city ?? client.state}</p>
```

Replace with:

```tsx
<p className="text-xs text-muted-foreground mt-0.5 truncate capitalize">{client.contact_person} · {client.city ?? client.state}</p>
```

- [ ] **Step 2: Verify in browser**

On the Clients list page, contact person names like "priya vanshika" should display as "Priya Vanshika".

- [ ] **Step 3: Commit**

```bash
git add src/pages/clients/ClientsPage.tsx
git commit -m "fix: Title Case for contact_person in ClientsPage list"
```

---

## Task 6 — Client Detail: Edit Guard + Lock Icon + No-GSTIN Badge

**Files:**
- Modify: `src/pages/clients/ClientDetailPage.tsx`

- [ ] **Step 1: Add imports and canEdit logic**

At the top of `ClientDetailPage.tsx`, add to the existing imports:

```tsx
import { Lock } from 'lucide-react'
import { useCanEditClient } from '@/hooks/useClients'
```

So the full import for lucide-react becomes:

```tsx
import { ArrowLeft, Plus, Pencil, Phone, Mail, MapPin, Hash, FileText, AlertTriangle, CheckCircle2, Clock, Lock } from 'lucide-react'
```

Inside the `ClientDetailPage` component, right after the `useState` declarations (before the `if (isLoading)` block), add:

```tsx
const canEdit = useCanEditClient()
```

- [ ] **Step 2: Replace the Edit button guard**

Find the Edit button block (currently uses `RoleGuard roles={['super_admin','director','manager']}`):

```tsx
<RoleGuard roles={['super_admin','director','manager']}>
  <button onClick={() => setEditClient(true)} className="flex items-center gap-2 text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-[#F8FAFC]">
    <Pencil size={12} />
    Edit
  </button>
</RoleGuard>
```

Replace with:

```tsx
{canEdit ? (
  <button onClick={() => setEditClient(true)} className="flex items-center gap-2 text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-[#F8FAFC]">
    <Pencil size={12} />
    Edit
  </button>
) : (
  <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5 border border-border rounded-lg bg-[#F8FAFC]">
    <Lock size={11} />
    Locked
  </span>
)}
```

- [ ] **Step 3: Add 🔒 icon to client card header**

Find the company name heading inside the client card:

```tsx
<div className="flex items-center gap-2 flex-wrap">
  <h2 className="text-xl font-display font-bold text-brand-950">{client.company_name}</h2>
  {client.trade_name && <span ...>{client.trade_name}</span>}
  {!client.is_active && <span ...>Inactive</span>}
</div>
```

Replace with:

```tsx
<div className="flex items-center gap-2 flex-wrap">
  <h2 className="text-xl font-display font-bold text-brand-950">{client.company_name}</h2>
  {client.trade_name && <span className="text-xs text-muted-foreground bg-[#F8FAFC] border border-border px-2 py-0.5 rounded">{client.trade_name}</span>}
  {!client.is_active && <span className="text-xs text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded">Inactive</span>}
  {(client as any).gstin_is_placeholder && (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700">
      <AlertTriangle size={10} />
      No GSTIN
    </span>
  )}
  {!canEdit && (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <Lock size={9} />
      Locked
    </span>
  )}
</div>
```

- [ ] **Step 4: Add ⚠ No GSTIN badge next to the GSTIN Detail**

Find:

```tsx
<Detail icon={Hash} label="GSTIN" value={client.gstin} />
```

Replace with:

```tsx
<div>
  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">GSTIN</p>
  <p className="text-xs font-medium text-brand-950 flex items-center gap-1.5">
    <Hash size={10} className="text-muted-foreground shrink-0" />
    {(client as any).gstin_is_placeholder ? (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded text-[10px] font-semibold">
        <AlertTriangle size={9} />
        No GSTIN
      </span>
    ) : (
      client.gstin ?? '—'
    )}
  </p>
</div>
```

- [ ] **Step 5: Add `capitalize` class to contact_person display**

Find:

```tsx
<p className="text-sm text-muted-foreground mt-0.5">{client.contact_person}</p>
```

Replace with:

```tsx
<p className="text-sm text-muted-foreground mt-0.5 capitalize">{client.contact_person}</p>
```

- [ ] **Step 6: Verify build passes**

```bash
npm run build 2>&1 | grep error | head -20
```

Expected: No new errors.

- [ ] **Step 7: Manual browser test**

- Open a client detail page as `super_admin` → Edit button shown, no Lock icon
- Log in as a user with `can_edit_clients = false` → Edit button replaced by "Locked" chip with 🔒
- For a client with `gstin_is_placeholder = true` → amber "⚠ No GSTIN" badge appears

- [ ] **Step 8: Commit**

```bash
git add src/pages/clients/ClientDetailPage.tsx
git commit -m "feat: client detail — edit guard, lock icon, no-GSTIN badge, Title Case"
```

---

## Task 7 — Tighten FSSAI License Number Validation

**Files:**
- Modify: `src/pages/clients/LicenseForm.tsx`

- [ ] **Step 1: Update the Zod schema for `license_number`**

In `src/pages/clients/LicenseForm.tsx`, find the schema definition:

```typescript
const schema = z.object({
  license_type:        z.string().min(1, 'Required'),
  license_number:      z.string().optional(),
  ...
```

Replace `license_number` with:

```typescript
  license_number: z.union([
    z.string().length(0),  // allow blank (license not yet issued)
    z.string().regex(/^\d{14}$/, 'FSSAI number must be exactly 14 digits'),
  ]).optional(),
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | grep error | head -10
```

- [ ] **Step 3: Manual browser test**

- Open a client detail page → Add Licence
- Enter `1234567890` (10 digits) in Licence Number → validation error "FSSAI number must be exactly 14 digits"
- Enter `12345678901234` (14 digits) → passes
- Leave blank → passes (optional field)

- [ ] **Step 4: Commit**

```bash
git add src/pages/clients/LicenseForm.tsx
git commit -m "fix: FSSAI license number must be exactly 14 digits when provided"
```

---

## Task 8 — "Edit Clients" Toggle in User Management

**Files:**
- Modify: `src/pages/admin/UserManagementPage.tsx`

- [ ] **Step 1: Add `can_edit_clients` to `UserRow` interface**

Find:

```typescript
interface UserRow {
  id: string
  name: string
  role: Role
  is_active: boolean
  email?: string
  phone?: string
  whatsapp_number?: string
}
```

Replace with:

```typescript
interface UserRow {
  id: string
  name: string
  role: Role
  is_active: boolean
  can_edit_clients: boolean
  email?: string
  phone?: string
  whatsapp_number?: string
}
```

- [ ] **Step 2: Add `can_edit_clients` to the query select**

Find:

```typescript
const { data, error } = await supabase
  .from('profiles')
  .select('id, name, role, is_active, phone, whatsapp_number')
  .order('name')
```

Replace with:

```typescript
const { data, error } = await supabase
  .from('profiles')
  .select('id, name, role, is_active, can_edit_clients, phone, whatsapp_number')
  .order('name')
```

- [ ] **Step 3: Add the `updateCanEditClients` mutation**

After the `updateRole` mutation definition, add:

```typescript
const updateCanEditClients = useMutation({
  mutationFn: async ({ id, can_edit_clients }: { id: string; can_edit_clients: boolean }) => {
    const { error } = await supabase.from('profiles').update({ can_edit_clients } as any).eq('id', id)
    if (error) throw error
  },
  onSuccess: () => { toast.success('Permission updated'); qc.invalidateQueries({ queryKey: ['profiles'] }) },
  onError: (e: Error) => toast.error('Failed', e.message),
})
```

- [ ] **Step 4: Add "Edit Clients" column to the table**

Find the table headers array:

```tsx
{['Name','Role','Status','Actions'].map(h => (
  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
))}
```

Replace with:

```tsx
{['Name','Role','Status','Edit Clients','Actions'].map(h => (
  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
))}
```

- [ ] **Step 5: Add the Edit Clients toggle cell in each row**

Find the row `<tr>` content — right before the `Actions` `<td>`, add a new cell:

```tsx
{/* Edit Clients toggle — only super_admin can change this */}
<td className="px-5 py-3">
  {profile?.role === 'super_admin' && u.id !== profile?.id ? (
    <button
      onClick={() => updateCanEditClients.mutate({ id: u.id, can_edit_clients: !u.can_edit_clients })}
      title={u.can_edit_clients ? 'Revoke client edit access' : 'Grant client edit access'}
      className={cn(
        'p-1.5 rounded-lg transition-colors',
        u.can_edit_clients
          ? 'text-green-600 hover:bg-red-50 hover:text-red-600'
          : 'text-gray-300 hover:bg-green-50 hover:text-green-600'
      )}
    >
      {u.can_edit_clients ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
    </button>
  ) : (
    <span className="text-xs text-muted-foreground">
      {u.id === profile?.id ? '—' : (u.can_edit_clients ? '✓' : '—')}
    </span>
  )}
</td>
```

Add this cell **before** the existing Actions `<td>` block.

- [ ] **Step 6: Verify build passes**

```bash
npm run build 2>&1 | grep error | head -20
```

- [ ] **Step 7: Manual browser test**

- Log in as `super_admin` → go to User Management
- Verify new "Edit Clients" column appears
- Toggle Edit Clients ON for a user → their row shows green toggle
- Log in as that user → go to a client detail page → Edit button now visible
- Toggle Edit Clients OFF → user loses edit access

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/UserManagementPage.tsx
git commit -m "feat: User Management — Edit Clients permission toggle column"
```

---

## Task 9 — Google Sheets Sync Script

**Files:**
- Create: `google-sheets/sync-clients.gs`

This is a Google Apps Script file. It must be manually pasted into a Google Sheets container script editor (Extensions → Apps Script). The Supabase service role key is stored in Script Properties, never in the code.

- [ ] **Step 1: Create the `google-sheets/` directory**

```bash
mkdir -p /Users/tarunsingh/Documents/Projects/tps-oms/google-sheets
```

- [ ] **Step 2: Create `google-sheets/sync-clients.gs`**

Write the following content:

```javascript
// ============================================================
// TPS OMS — Google Sheets ↔ Supabase Client Sync
// Setup:
//   1. Open your Google Sheet → Extensions → Apps Script
//   2. Paste this entire file
//   3. Project Settings → Script Properties → Add:
//        SUPABASE_URL  = https://<your-project>.supabase.co
//        SUPABASE_KEY  = <your service role key>
//   4. Save → Run onOpen() once to authorise
// ============================================================

const SHEET_NAME = 'Clients'
const LOG_SHEET  = 'Sync Log'

// ── Menu ──────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TPS Sync')
    .addItem('▶ Sync to Supabase', 'syncToSupabase')
    .addItem('⬇ Pull from Supabase', 'pullFromSupabase')
    .addToUi()
}

// ── Push: Sheet → Supabase ────────────────────────────────────────────────────

function syncToSupabase() {
  const props = PropertiesService.getScriptProperties()
  const SUPABASE_URL = props.getProperty('SUPABASE_URL')
  const SUPABASE_KEY = props.getProperty('SUPABASE_KEY')

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    SpreadsheetApp.getUi().alert('Missing Script Properties: SUPABASE_URL and SUPABASE_KEY must be set.')
    return
  }

  const ss     = SpreadsheetApp.getActiveSpreadsheet()
  const sheet  = ss.getSheetByName(SHEET_NAME)
  if (!sheet) { SpreadsheetApp.getUi().alert('Sheet "' + SHEET_NAME + '" not found.'); return }

  const lastRow = sheet.getLastRow()
  if (lastRow < 2) { SpreadsheetApp.getUi().alert('No data rows found (row 2 onward expected).'); return }

  const rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues()

  let imported = 0, skipped = 0, errors = 0
  const errorLog = []

  rows.forEach((row, idx) => {
    const rowNum = idx + 2
    const [
      companyName, gstinAvailable, gstin, contactPerson,
      phone, email, state, district, fssaiLicNo, fssaiValidTill, notes
    ] = row

    // Skip empty rows
    if (!companyName) { skipped++; return }

    // Normalise
    const name    = String(companyName).trim().toUpperCase()
    const hasGstin = String(gstinAvailable).trim().toLowerCase() === 'yes'
    let finalGstin = hasGstin ? String(gstin).trim().toUpperCase() : ''
    const isPlaceholder = !hasGstin

    // Validate GSTIN when provided
    if (hasGstin && !/^[A-Z0-9]{15}$/.test(finalGstin)) {
      errorLog.push('Row ' + rowNum + ': Invalid GSTIN "' + finalGstin + '" — skipped')
      errors++; return
    }

    // Generate placeholder if no GSTIN
    if (!hasGstin) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      let suffix = ''
      for (let i = 0; i < 9; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
      finalGstin = 'NOGSTN' + suffix
    }

    // Validate FSSAI (optional, 14 digits if present)
    const fssai = String(fssaiLicNo).trim()
    if (fssai && !/^\d{14}$/.test(fssai)) {
      errorLog.push('Row ' + rowNum + ': Invalid FSSAI "' + fssai + '" — skipped')
      errors++; return
    }

    // Build payload
    const payload = {
      company_name:         name,
      contact_person:       String(contactPerson).trim(),
      contact_phone:        String(phone).trim(),
      contact_email:        String(email).trim(),
      state:                String(state).trim(),
      city:                 String(district).trim(),
      gstin:                finalGstin,
      gstin_is_placeholder: isPlaceholder,
      notes:                notes ? String(notes).trim() : null,
    }

    // POST to Supabase
    // ?on_conflict=gstin tells PostgREST which column to use for conflict detection
    const response = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/clients?on_conflict=gstin', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer':        'resolution=ignore-duplicates',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    })

    const code = response.getResponseCode()
    if (code === 201 || code === 200) {
      imported++
    } else {
      const body = response.getContentText()
      if (body.includes('idx_clients_gstin')) {
        errorLog.push('Row ' + rowNum + ': GSTIN ' + finalGstin + ' already exists — skipped')
        skipped++
      } else {
        errorLog.push('Row ' + rowNum + ': HTTP ' + code + ' — ' + body.substring(0, 120))
        errors++
      }
    }
  })

  // Write to Sync Log
  writeLog(ss, 'PUSH', rows.length, imported, skipped, errors, errorLog)

  SpreadsheetApp.getUi().alert(
    '✅ Sync complete\n' +
    'Imported: ' + imported + '\n' +
    'Skipped: ' + skipped + '\n' +
    'Errors: ' + errors + '\n\n' +
    (errorLog.length ? 'See Sync Log tab for details.' : 'No errors.')
  )
}

// ── Pull: Supabase → Sheet ────────────────────────────────────────────────────

function pullFromSupabase() {
  const props = PropertiesService.getScriptProperties()
  const SUPABASE_URL = props.getProperty('SUPABASE_URL')
  const SUPABASE_KEY = props.getProperty('SUPABASE_KEY')

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    SpreadsheetApp.getUi().alert('Missing Script Properties.')
    return
  }

  const response = UrlFetchApp.fetch(
    SUPABASE_URL + '/rest/v1/clients?select=company_name,gstin,gstin_is_placeholder,contact_person,contact_phone,contact_email,state,city,notes&order=company_name',
    {
      method: 'get',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      },
      muteHttpExceptions: true,
    }
  )

  if (response.getResponseCode() !== 200) {
    SpreadsheetApp.getUi().alert('Failed to fetch from Supabase: ' + response.getContentText())
    return
  }

  const clients = JSON.parse(response.getContentText())
  const ss    = SpreadsheetApp.getActiveSpreadsheet()
  let sheet   = ss.getSheetByName(SHEET_NAME)

  // Create sheet if missing
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME)
  }

  // Clear data rows (keep header)
  const lastRow = sheet.getLastRow()
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 11).clearContent()

  // Write header if missing
  const header = ['Company Name','GSTIN Available (Yes/No)','GSTIN','Contact Person','Phone','Email','State','District','FSSAI License No','FSSAI Valid Till','Notes']
  sheet.getRange(1, 1, 1, header.length).setValues([header])
  sheet.getRange(1, 1, 1, header.length).setFontWeight('bold')

  // Write client rows
  if (clients.length === 0) {
    SpreadsheetApp.getUi().alert('No clients found in Supabase.')
    return
  }

  const dataRows = clients.map(c => [
    c.company_name,
    c.gstin_is_placeholder ? 'No' : 'Yes',
    c.gstin_is_placeholder ? '' : (c.gstin || ''),
    c.contact_person,
    c.contact_phone,
    c.contact_email,
    c.state,
    c.city,
    '',   // FSSAI not in this query (join not needed here)
    '',
    c.notes || '',
  ])

  sheet.getRange(2, 1, dataRows.length, 11).setValues(dataRows)

  writeLog(ss, 'PULL', clients.length, clients.length, 0, 0, [])

  SpreadsheetApp.getUi().alert('✅ Pulled ' + clients.length + ' clients from Supabase.')
}

// ── Sync Log ──────────────────────────────────────────────────────────────────

function writeLog(ss, direction, total, imported, skipped, errors, errorLines) {
  let logSheet = ss.getSheetByName(LOG_SHEET)
  if (!logSheet) {
    logSheet = ss.insertSheet(LOG_SHEET)
    logSheet.getRange(1, 1, 1, 6).setValues([['Timestamp','Direction','Total Rows','Imported','Skipped','Errors']])
    logSheet.getRange(1, 1, 1, 6).setFontWeight('bold')
  }

  const now     = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  const lastRow = logSheet.getLastRow()
  logSheet.getRange(lastRow + 1, 1, 1, 6).setValues([[now, direction, total, imported, skipped, errors]])

  if (errorLines.length > 0) {
    const errStart = logSheet.getLastRow() + 2
    logSheet.getRange(errStart, 1).setValue('--- Error details for run at ' + now + ' ---')
    errorLines.forEach((line, i) => logSheet.getRange(errStart + 1 + i, 1).setValue(line))
  }
}
```

- [ ] **Step 3: Commit the script**

```bash
git add google-sheets/sync-clients.gs
git commit -m "feat: Google Sheets ↔ Supabase client sync script (push + pull)"
```

- [ ] **Step 4: Manual setup instructions (to be performed by the operator, not automated)**

1. Open your Google Sheet for client data
2. Go to **Extensions → Apps Script**
3. Paste the entire contents of `google-sheets/sync-clients.gs`
4. Click **Save** (floppy disk icon)
5. Go to **Project Settings** (gear icon) → **Script Properties** → **Add property**:
   - `SUPABASE_URL` = `https://<your-project-ref>.supabase.co`
   - `SUPABASE_KEY` = `<your Supabase service role key>`
6. Click **Run** → select `onOpen` → grant permissions
7. Go back to your sheet — the **TPS Sync** menu now appears in the top menu bar

---

## Task 10 — Final Build & Deploy

- [ ] **Step 1: Full production build**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms
npm run build 2>&1
```

Expected: `✓ built in X.Xs` with no errors.

- [ ] **Step 2: Confirm all 8 testing checklist items pass**

Run through the spec checklist manually in the browser on the dev build:

```
[ ] Company name saved in ALL CAPS regardless of input case
[ ] GSTIN toggle: Yes shows input, No generates NOGSTN_________
[ ] GSTIN shorter/longer than 15 chars → validation error
[ ] Duplicate GSTIN → friendly error, form stays open
[ ] No-GSTIN + 6+ word match → warning dialog appears
[ ] FSSAI 13 or 15 digits → validation error; 14 digits → passes
[ ] Client detail locked for users without can_edit_clients
[ ] Super admin always sees Edit button
[ ] can_edit_clients toggle in User Management works
[ ] ⚠ No GSTIN badge visible on placeholder GSTIN clients
```

- [ ] **Step 3: Push to main and deploy**

```bash
git push origin main
```

GitHub Actions will build and deploy to GitHub Pages automatically. Monitor at:
`https://github.com/[org]/tps-oms/actions`

- [ ] **Step 4: Verify on live portal**

Open `https://portal.tpsxpert.com` → hard refresh (Cmd+Shift+R) → confirm all changes are live.

---

## Quick Reference

### GSTIN Placeholder Format
`NOGSTN` + 9 random uppercase alphanumeric chars = 15 chars total  
Example: `NOGSTNX7K2P9Q4M`

### can_edit_clients Logic
- `super_admin` → always can edit (bypasses flag)
- All other roles → require `profiles.can_edit_clients = true`
- Only `super_admin` can toggle the flag in User Management

### Duplicate Name Check
Triggers only when:
1. GSTIN toggle is set to "No" (no real GSTIN provided)
2. Company name has 6 or more words
3. The first 6 words (uppercased) exactly match an existing client

### Supabase Migration Commands (via MCP)
Run SQL through Supabase MCP (`mcp__71fe10cc__execute_sql`), not via local CLI.
The project ref is `tpscert` (portal.tpsxpert.com project).
