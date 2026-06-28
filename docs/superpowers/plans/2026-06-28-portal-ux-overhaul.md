# Portal UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul TPS-OMS portal UX across clients, tasks, dashboard, payments, notifications, and reports — all live by EOD.

**Architecture:** 10 focused tasks across existing React/Vite/Supabase stack. One DB migration (theme column). No new npm packages. Pie chart via raw SVG. Themes via CSS custom properties + localStorage. Dashboard notification panel filters to today/unread. Subagent tasks T1–T4 are independent and run in parallel first.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind, Supabase (project: muxwwvwmephtwghsrzbp), react-query, react-router-dom, Material Symbols icons via `Sym` component.

**Conventions:**
- All Material Symbols icons: `<Sym name="icon_name" size={N} />`
- CSS classes: `glass-panel`, `glass-panel-heavy`, `cn()` from `@/lib/utils`
- Supabase client: `import { supabase } from '@/lib/supabase'`
- Auth context: `const { profile } = useAuth()` — profile has `id`, `role`, `name`
- Roles: `super_admin` > `director` > `manager` > `executive` | `accounts` | `hr` | `auditor`
- Formatting: `formatRupees(paise)`, `formatDate(iso)` from `@/lib/utils`
- Commit message suffix: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 1: Quick Wins — Tasks Default, Project Card Swap

**Files:**
- Modify: `src/pages/tasks/TasksPage.tsx` (line ~42)
- Modify: `src/pages/projects/ProjectsPage.tsx` (line ~90-130)

### Step 1: Default tasks status filter to 'open'

In `src/pages/tasks/TasksPage.tsx`, line ~42:

```tsx
// BEFORE:
const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')

// AFTER:
const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('open')
```

- [ ] **Step 1: Change default status filter**

Open `src/pages/tasks/TasksPage.tsx`. Find:
```tsx
const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
```
Replace with:
```tsx
const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('open')
```

### Step 2: Project card — swap client name and project type positions

In `src/pages/projects/ProjectsPage.tsx`, find the project card row in the `filtered.map(p => ...)` block. Currently it shows:
```
project_code | project_type badge | Executive | Due date    client row
```

Find the card JSX (around line 100+). The card currently has this structure:
```tsx
<div key={p.id} onClick={...} className="bg-white rounded-xl ...">
  <div className="...">
    <span className="font-mono ...">{p.project_code}</span>
    <span className={cn(projectTypeBadge(p.service_type), ...)}>{p.service_type ?? 'General'}</span>
    ...
    <span>Executive: {p.profiles_assigned?.name}</span>
    <span>Due {formatDate(p.target_date)}</span>
  </div>
  <p>CLIENT NAME</p>
</div>
```

Replace the card's inner display so: **client name** appears where project type badge was (as a text label), and **project type** appears where the due date was. The revised card inner content:

```tsx
<div
  key={p.id}
  onClick={() => navigate(`/projects/${p.id}`)}
  className="bg-white rounded-xl border border-border px-5 py-4 cursor-pointer hover:border-brand-600/30 hover:shadow-sm transition-all group"
>
  <div className="flex items-start justify-between gap-4">
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[11px] text-muted-foreground">{p.project_code}</span>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', STATUS_BADGE[p.status])}>
          {p.status.replace('_', ' ')}
        </span>
        {p.is_blocked && (
          <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded font-medium">BLOCKED</span>
        )}
      </div>
      <p className="text-sm font-semibold text-brand-950 mt-1 truncate">{p.project_name}</p>
      {/* CLIENT NAME — now the prominent secondary line */}
      <p className="text-xs text-brand-600 font-medium mt-0.5 truncate">{(p as any).clients?.company_name ?? '—'}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        Executive: {(p as any).profiles_assigned?.name ?? '—'}
        {p.target_date && <> · Due {formatDate(p.target_date)}</>}
      </p>
    </div>
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      {/* PROJECT TYPE — now shown on the right */}
      {p.service_type && (
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', projectTypeBadge(p.service_type))}>
          {p.service_type}
        </span>
      )}
      {p.active_clock && p.clock_switched_at && (
        <ClockBadge clock={p.active_clock} since={p.clock_switched_at} isBlocked={p.is_blocked ?? false} personName={(p as any).profiles_assigned?.name} />
      )}
      <Sym name="chevron_right" size={16} className="text-muted-foreground/40 group-hover:text-brand-600 transition-colors mt-1" />
    </div>
  </div>
</div>
```

- [ ] **Step 2: Swap client/type in ProjectsPage card**

Find the card JSX that renders each project in `filtered.map(p => ...)` in `src/pages/projects/ProjectsPage.tsx`. Replace the entire card `<div key={p.id} ...>` with the JSX shown above. Keep all the imports and state variables — only the card rendering changes.

- [ ] **Step 3: Verify build**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms && npm run build 2>&1 | tail -5
```
Expected: `✓ built in` — no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms
git add src/pages/tasks/TasksPage.tsx src/pages/projects/ProjectsPage.tsx
git commit -m "$(cat <<'EOF'
fix: tasks default to open; project cards show client name prominently

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Clients Page — 3-Column Grid Layout

**Files:**
- Modify: `src/pages/clients/ClientsPage.tsx`

- [ ] **Step 1: Replace list with grid**

In `src/pages/clients/ClientsPage.tsx`, find the `filtered.map(client => ...)` rendering inside the `else` branch. Replace the outer `<div className="space-y-2">` and its content with:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
  {filtered.map(client => (
    <div
      key={client.id}
      onClick={() => navigate(`/clients/${client.id}`)}
      className="bg-white rounded-xl border border-border p-4 cursor-pointer hover:border-brand-600/30 hover:shadow-md transition-all group flex flex-col gap-3"
    >
      {/* Header row: avatar + company name */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-600/10 flex items-center justify-center shrink-0">
          <span className="text-brand-600 font-display font-bold text-sm">
            {client.company_name.slice(0, 2).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-brand-950 text-sm leading-tight truncate">{client.company_name}</p>
          {client.trade_name && (
            <p className="text-[11px] text-muted-foreground truncate">{client.trade_name}</p>
          )}
          {!client.is_active && (
            <span className="inline-block text-[10px] text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded mt-0.5">Inactive</span>
          )}
        </div>
      </div>

      {/* Contact person */}
      <div className="text-xs text-muted-foreground truncate">
        <Sym name="person" size={11} className="inline mr-1 -mt-px" />
        {toTitleCase(client.contact_person)}
      </div>

      {/* Phone + Email */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sym name="call" size={11} className="shrink-0" />
          <span className="truncate">{client.contact_phone}</span>
        </div>
        {client.contact_email && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sym name="mail" size={11} className="shrink-0" />
            <span className="truncate">{client.contact_email}</span>
          </div>
        )}
      </div>

      {/* City/State footer */}
      <div className="text-[11px] text-muted-foreground/70 flex items-center gap-1 border-t border-border pt-2">
        <Sym name="location_on" size={11} />
        {client.city ?? client.state ?? '—'}
        <Sym name="chevron_right" size={13} className="ml-auto text-muted-foreground/40 group-hover:text-brand-600 transition-colors" />
      </div>
    </div>
  ))}
</div>
```

Also update the skeleton loader to match the grid:
```tsx
{isLoading ? (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="h-40 bg-white rounded-xl border border-border animate-pulse" />
    ))}
  </div>
) : ...}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms
git add src/pages/clients/ClientsPage.tsx
git commit -m "$(cat <<'EOF'
feat: clients page 3-column grid card layout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: DB Migration — Dashboard Theme Column

**Files:**
- Create: `supabase/migrations/046_dashboard_theme.sql`

The migration adds `dashboard_theme text not null default 'ocean'` to `profiles`. Themes: ocean, slate, sand, forest, white.

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/046_dashboard_theme.sql`:

```sql
-- Add dashboard_theme preference to profiles
alter table profiles
  add column if not exists dashboard_theme text not null default 'ocean'
  check (dashboard_theme in ('ocean','slate','sand','forest','white'));

comment on column profiles.dashboard_theme is 'User-chosen dashboard colour theme';
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use the `mcp__71fe10cc-2bfb-4a8b-9072-45a0142d54ac__apply_migration` tool:
- project_id: `muxwwvwmephtwghsrzbp`
- name: `046_dashboard_theme`
- query: contents of the SQL above

- [ ] **Step 3: Commit migration**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms
git add supabase/migrations/046_dashboard_theme.sql
git commit -m "$(cat <<'EOF'
chore: migration 046 - dashboard_theme column on profiles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Payments Tab — Quoted Amount Display + Mark Payment Complete

**Files:**
- Modify: `src/pages/projects/tabs/PaymentsTab.tsx`
- Modify: `src/hooks/usePayments.ts`

The `projects` table already has `quoted_amount` (paise), `paid_amount` (paise), and `payment_status` enum ('pending'|'partial'|'paid'|'overdue'|'refunded'). The PaymentsTab receives `projectId` and `clientId` but NOT quoted_amount. We need to also pass `quotedAmount` and `paymentStatus` as props, OR query the project inside the tab.

The simplest approach: add `quotedAmount: number` and `paymentStatus: string` props to `PaymentsTab`.

### PaymentsTab changes

- [ ] **Step 1: Update PaymentsTab props interface**

In `src/pages/projects/tabs/PaymentsTab.tsx`, update the Props interface:

```tsx
interface Props {
  projectId: string
  clientId: string
  quotedAmount: number       // in paise — 0 if not set
  paymentStatus: string      // existing project.payment_status
}
```

- [ ] **Step 2: Add useMarkPaymentComplete hook in usePayments.ts**

In `src/hooks/usePayments.ts`, add:

```ts
export function useMarkPaymentComplete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase
        .from('projects')
        .update({ payment_status: 'paid' } as any)
        .eq('id', projectId)
      if (error) throw error
    },
    onSuccess: (_d, projectId) => {
      qc.invalidateQueries({ queryKey: ['payments', projectId] })
      qc.invalidateQueries({ queryKey: ['projects', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
```

- [ ] **Step 3: Rewrite PaymentsTab**

Replace the full content of `src/pages/projects/tabs/PaymentsTab.tsx` with:

```tsx
import { useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePayments, useCreatePayment, useMarkPaymentComplete } from '@/hooks/usePayments'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { formatDate, formatRupees, cn } from '@/lib/utils'

const PAYMENT_MODES = ['Cash', 'NEFT', 'IMPS', 'UPI', 'Cheque', 'RTGS', 'Other']

const schema = z.object({
  amount:       z.coerce.number().min(1, 'Amount required'),
  payment_date: z.string().min(1, 'Date required'),
  payment_mode: z.string().min(1, 'Mode required'),
  invoice_no:   z.string().optional(),
  reference_no: z.string().optional(),
  notes:        z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  projectId: string
  clientId: string
  quotedAmount: number
  paymentStatus: string
}

export function PaymentsTab({ projectId, clientId, quotedAmount, paymentStatus }: Props) {
  const { profile } = useAuth()
  const { data: payments = [], isLoading } = usePayments(projectId)
  const createPayment = useCreatePayment()
  const markComplete = useMarkPaymentComplete()
  const [showForm, setShowForm] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)

  const totalReceived = payments.reduce((s, p) => s + p.amount, 0)
  const pending = quotedAmount > 0 ? Math.max(0, quotedAmount - totalReceived) : 0
  const isComplete = paymentStatus === 'paid'

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { payment_mode: 'NEFT', payment_date: new Date().toISOString().split('T')[0] },
  })

  const onSubmit = async (data: FormData) => {
    try {
      await createPayment.mutateAsync({
        ...data,
        amount:       Math.round(data.amount * 100),
        project_id:   projectId,
        client_id:    clientId,
        recorded_by:  profile!.id,
        invoice_no:   data.invoice_no   || null,
        reference_no: data.reference_no || null,
        notes:        data.notes        || null,
      })
      toast.success('Payment recorded')
      reset()
      setShowForm(false)
    } catch (err: any) {
      toast.error('Failed', err.message)
    }
  }

  const handleMarkComplete = async () => {
    try {
      await markComplete.mutateAsync(projectId)
      toast.success('Payment marked as complete — no further pending shown.')
      setConfirmComplete(false)
    } catch (e: any) {
      toast.error('Failed', e.message)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Quoted" amount={quotedAmount} color="text-brand-700" />
        <SummaryCard label="Received" amount={totalReceived} color="text-emerald-700" />
        <SummaryCard
          label={isComplete ? 'Completed' : 'Pending'}
          amount={isComplete ? 0 : pending}
          color={isComplete ? 'text-green-600' : pending > 0 ? 'text-red-600' : 'text-muted-foreground'}
          badge={isComplete ? '✓ PAID' : undefined}
        />
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div />
        <div className="flex items-center gap-3">
          {!isComplete && (
            <RoleGuard roles={['super_admin','director','accounts']}>
              <button
                onClick={() => setConfirmComplete(true)}
                className="flex items-center gap-1.5 text-sm text-green-700 font-medium border border-green-300 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg"
              >
                <Sym name="check_circle" size={14} />
                Mark Payment Complete
              </button>
            </RoleGuard>
          )}
          {isComplete && (
            <span className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
              <Sym name="verified" size={14} /> Payment Complete
            </span>
          )}
          <RoleGuard roles={['super_admin','director','manager','accounts']}>
            <button
              onClick={() => setShowForm(s => !s)}
              className="flex items-center gap-1.5 text-sm text-white font-medium bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg"
            >
              <Sym name="add" size={13} />
              Record Payment
            </button>
          </RoleGuard>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-[#F8FAFC] rounded-xl border border-border p-5">
          <h4 className="text-xs font-semibold text-brand-950 mb-4">New Payment Entry</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹) *" error={errors.amount?.message}>
              <input type="number" step="0.01" {...register('amount')} className={ic(!!errors.amount)} placeholder="0.00" />
            </Field>
            <Field label="Date *" error={errors.payment_date?.message}>
              <input type="date" {...register('payment_date')} className={ic(!!errors.payment_date)} />
            </Field>
            <Field label="Mode *" error={errors.payment_mode?.message}>
              <select {...register('payment_mode')} className={ic(!!errors.payment_mode)}>
                {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Invoice No.">
              <input {...register('invoice_no')} className={ic(false)} placeholder="INV-001" />
            </Field>
            <Field label="Reference / UTR" className="col-span-2">
              <input {...register('reference_no')} className={ic(false)} placeholder="Transaction reference" />
            </Field>
            <Field label="Notes" className="col-span-2">
              <textarea {...register('notes')} rows={2} className={ic(false)} />
            </Field>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}
              className="px-4 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {isSubmitting ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-1.5 border border-border text-sm rounded-lg hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Payments list */}
      {isLoading ? (
        <div className="space-y-2 animate-pulse">{[1,2].map(i => <div key={i} className="h-14 glass-panel rounded-xl" />)}</div>
      ) : payments.length === 0 ? (
        <div className="glass-panel rounded-xl border-dashed !border-white/20 p-8 text-center">
          <p className="text-xs text-white/60">No payments recorded yet. Use "Record Payment" to add one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-border px-5 py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-green-700">{formatRupees(p.amount)}</span>
                  <span className="text-[10px] bg-[#F8FAFC] border border-border px-1.5 py-0.5 rounded text-muted-foreground">{p.payment_mode}</span>
                  {p.invoice_no && <span className="text-[10px] text-muted-foreground">#{p.invoice_no}</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                  <span>{formatDate(p.payment_date)}</span>
                  {p.reference_no && <span className="font-mono">Ref: {p.reference_no}</span>}
                  {(p as any).profiles?.name && <span>by {(p as any).profiles.name}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm mark complete modal */}
      {confirmComplete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h2 className="font-display font-semibold text-brand-950 mb-1">Mark Payment as Complete?</h2>
            <p className="text-xs text-muted-foreground mb-4">
              This will mark the project as fully paid. No pending payment will be shown going forward.
              {quotedAmount > 0 && totalReceived < quotedAmount && (
                <span className="block mt-2 text-amber-700 font-medium">
                  ⚠ Received ({formatRupees(totalReceived)}) is less than quoted ({formatRupees(quotedAmount)}).
                  Proceed only if remaining amount is waived or settled offline.
                </span>
              )}
              {quotedAmount > 0 && totalReceived > quotedAmount && (
                <span className="block mt-2 text-blue-700 font-medium">
                  Received ({formatRupees(totalReceived)}) exceeds quoted ({formatRupees(quotedAmount)}).
                </span>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmComplete(false)}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={handleMarkComplete} disabled={markComplete.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                {markComplete.isPending ? 'Saving…' : 'Yes, Mark Complete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, amount, color, badge }: { label: string; amount: number; color: string; badge?: string }) {
  return (
    <div className="bg-white rounded-xl border border-border px-4 py-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn('text-base font-bold font-mono mt-1', color)}>{badge ?? formatRupees(amount)}</p>
    </div>
  )
}

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-medium text-brand-950 mb-1">{label}</label>
      {children}
      {error && <p className="text-[11px] text-red-600 mt-0.5">{error}</p>}
    </div>
  )
}

const ic = (err: boolean) =>
  cn('w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600', err ? 'border-red-400' : 'border-border')
```

- [ ] **Step 4: Pass quotedAmount + paymentStatus from ProjectDetailPage**

In `src/pages/projects/ProjectDetailPage.tsx`, find where `<PaymentsTab>` is rendered and add the new props:

```tsx
// Before — find this line:
<PaymentsTab projectId={project.id} clientId={project.client_id} />

// After:
<PaymentsTab
  projectId={project.id}
  clientId={project.client_id}
  quotedAmount={(project as any).quoted_amount ?? 0}
  paymentStatus={(project as any).payment_status ?? 'pending'}
/>
```

- [ ] **Step 5: Build check**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms && npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms
git add src/pages/projects/tabs/PaymentsTab.tsx src/hooks/usePayments.ts src/pages/projects/ProjectDetailPage.tsx
git commit -m "$(cat <<'EOF'
feat: payments tab - quoted/received/pending summary + mark payment complete with confirm

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Dashboard Themes — 5 Colour Themes + Switcher

**Files:**
- Modify: `src/index.css` (add theme CSS vars)
- Create: `src/hooks/useTheme.ts`
- Modify: `src/pages/dashboard/DashboardPage.tsx` (add theme switcher UI)
- Modify: `src/components/layout/AppShell.tsx` (apply theme class to root div)

### Theme definitions

Themes are applied by setting a `data-theme` attribute on the `<body>` element. Each theme overrides the teal gradient background via CSS vars.

- [ ] **Step 1: Add theme CSS vars to src/index.css**

At the end of `src/index.css`, append:

```css
/* ── Dashboard Themes ───────────────────────────────────── */
[data-theme="ocean"] {
  --theme-bg-from: #0F4C75;
  --theme-bg-to: #1B262C;
}
[data-theme="slate"] {
  --theme-bg-from: #1e293b;
  --theme-bg-to: #0f172a;
}
[data-theme="sand"] {
  --theme-bg-from: #78350f;
  --theme-bg-to: #292524;
}
[data-theme="forest"] {
  --theme-bg-from: #14532d;
  --theme-bg-to: #052e16;
}
[data-theme="white"] {
  --theme-bg-from: #475569;
  --theme-bg-to: #1e293b;
}
```

Then find the existing `.app-shell` or `body` background gradient in `src/index.css` (it likely uses the teal gradient). Update the gradient to reference these vars:

```css
body {
  background: linear-gradient(135deg, var(--theme-bg-from, #0F4C75) 0%, var(--theme-bg-to, #1B262C) 100%);
  min-height: 100vh;
}
```

- [ ] **Step 2: Create src/hooks/useTheme.ts**

```ts
import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type DashboardTheme = 'ocean' | 'slate' | 'sand' | 'forest' | 'white'

const THEMES: { value: DashboardTheme; label: string; from: string; to: string }[] = [
  { value: 'ocean',  label: 'Ocean',   from: '#0F4C75', to: '#1B262C' },
  { value: 'slate',  label: 'Slate',   from: '#1e293b', to: '#0f172a' },
  { value: 'sand',   label: 'Sand',    from: '#78350f', to: '#292524' },
  { value: 'forest', label: 'Forest',  from: '#14532d', to: '#052e16' },
  { value: 'white',  label: 'Classic', from: '#475569', to: '#1e293b' },
]
export { THEMES }

function applyTheme(theme: DashboardTheme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('dashboard_theme', theme)
}

export function useTheme() {
  const { profile } = useAuth()

  useEffect(() => {
    const saved = (profile as any)?.dashboard_theme as DashboardTheme | undefined
      ?? (localStorage.getItem('dashboard_theme') as DashboardTheme | null)
      ?? 'ocean'
    applyTheme(saved)
  }, [profile])

  const setTheme = useCallback(async (theme: DashboardTheme) => {
    applyTheme(theme)
    if (profile?.id) {
      await supabase.from('profiles').update({ dashboard_theme: theme } as any).eq('id', profile.id)
    }
  }, [profile?.id])

  const current = (typeof document !== 'undefined'
    ? (document.documentElement.getAttribute('data-theme') as DashboardTheme)
    : null) ?? 'ocean'

  return { current, setTheme, THEMES }
}
```

- [ ] **Step 3: Add ThemeSwitcher to DashboardPage**

In `src/pages/dashboard/DashboardPage.tsx`, add the following at the top of the return's inner `<div className="p-6 space-y-6 ...">`:

```tsx
import { useTheme, THEMES } from '@/hooks/useTheme'
// (add this import at the top of the file)

// Inside the component:
const { current: currentTheme, setTheme } = useTheme()

// Add at the top of the <div className="p-6 ..."> content:
<div className="flex justify-end">
  <div className="flex items-center gap-1.5 glass-panel rounded-xl px-3 py-2">
    <Sym name="palette" size={13} className="text-white/60 mr-1" />
    {THEMES.map(t => (
      <button
        key={t.value}
        title={t.label}
        onClick={() => setTheme(t.value)}
        className={cn(
          'w-5 h-5 rounded-full border-2 transition-transform hover:scale-110',
          currentTheme === t.value ? 'border-white scale-110' : 'border-white/30'
        )}
        style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
      />
    ))}
  </div>
</div>
```

- [ ] **Step 4: Build check**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms && npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms
git add src/index.css src/hooks/useTheme.ts src/pages/dashboard/DashboardPage.tsx
git commit -m "$(cat <<'EOF'
feat: 5 dashboard themes (ocean/slate/sand/forest/classic) with per-user persistence

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Dashboard Overhaul — Clickable Chips, All-Projects, New Task, Pie Chart, Director Merge

**Files:**
- Modify: `src/hooks/useDashboard.ts`
- Modify: `src/pages/dashboard/DashboardPage.tsx`

### 6A: useDashboard.ts changes

- [ ] **Step 1: Update useMyProjects to include all statuses and admin totals**

In `src/hooks/useDashboard.ts`, replace `useMyProjects` with:

```ts
export function useMyProjects() {
  const { profile } = useAuth()
  const isAdmin = ['super_admin', 'director'].includes(profile?.role ?? '')
  return useQuery({
    queryKey: ['my-projects', profile?.id, isAdmin],
    enabled: !!profile?.id,
    queryFn: async () => {
      let q = supabase
        .from('projects')
        .select(`
          id, project_code, project_name, service_type, status,
          active_clock, clock_switched_at, is_blocked, target_date,
          clients(company_name)
        `)
        .order('target_date', { ascending: true, nullsFirst: false })

      if (!isAdmin) {
        q = q.eq('assigned_to', profile!.id)
      }

      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}
```

- [ ] **Step 2: Add useTodayPunches and usePendingPayments to useDashboard.ts**

Append to `src/hooks/useDashboard.ts`:

```ts
// ── Today's attendance punches ──────────────────────────────────────────────
export function useTodayPunches() {
  const { profile } = useAuth()
  const isAdmin = ['super_admin', 'director'].includes(profile?.role ?? '')
  return useQuery({
    queryKey: ['today-punches', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      let q = supabase
        .from('attendance_punches')
        .select(`
          id, punch_time, punch_type, office_name,
          profiles!attendance_punches_user_id_fkey(name, role)
        `)
        .gte('punch_time', `${today}T00:00:00`)
        .lte('punch_time', `${today}T23:59:59`)
        .order('punch_time', { ascending: true })

      if (!isAdmin) {
        q = (q as any).eq('user_id', profile!.id)
      }

      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })
}

// ── Pending payments (projects with quoted > paid and payment_status != paid) ─
export function usePendingPayments() {
  return useQuery({
    queryKey: ['pending-payments-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id, project_code, project_name, quoted_amount, paid_amount,
          payment_status, completed_date, target_date,
          clients(company_name)
        `)
        .neq('payment_status', 'paid')
        .gt('quoted_amount', 0)
        .order('completed_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []).filter((p: any) => (p.quoted_amount ?? 0) > (p.paid_amount ?? 0))
    },
  })
}
```

### 6B: DashboardPage.tsx full rewrite

- [ ] **Step 3: Rewrite DashboardPage.tsx**

Replace the full content of `src/pages/dashboard/DashboardPage.tsx` with:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { ClockBadge } from '@/components/shared/ClockBadge'
import { Sym } from '@/components/shared/Sym'
import {
  useMyProjects, useRecentNotifications, useDirectorStats,
  useTodayPunches, usePendingPayments,
} from '@/hooks/useDashboard'
import { useAuth } from '@/contexts/AuthContext'
import { IncomingTransfers } from '@/pages/projects/ProjectTransfer'
import { formatDate, formatRupees, daysUntil, cn } from '@/lib/utils'
import { useTheme, THEMES } from '@/hooks/useTheme'
import { TaskModal } from '@/pages/tasks/TaskModal'
import { useClients } from '@/hooks/useClients'
import { useProjects } from '@/hooks/useProjects'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = ['super_admin', 'director'].includes(profile?.role ?? '')
  const { current: currentTheme, setTheme } = useTheme()
  const [creatingTask, setCreatingTask] = useState(false)

  const { data: myProjects = [], isLoading: loadingProjects } = useMyProjects()
  const { data: notifications = [], isLoading: loadingNotif } = useRecentNotifications()
  const { data: stats } = useDirectorStats()
  const { data: todayPunches = [] } = useTodayPunches()
  const { data: pendingPayments = [] } = usePendingPayments()
  const { data: clients = [] } = useClients()
  const { data: allProjects = [] } = useProjects()
  const { data: staff = [] } = useQuery({
    queryKey: ['profiles', 'staff'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name, role').eq('is_active', true).order('name')
      return data as { id: string; name: string; role: string }[]
    },
  })

  const activeProjects = myProjects.filter(p => p.status === 'active')
  const overdue = activeProjects.filter(p => { const d = daysUntil(p.target_date); return d !== null && d < 0 })
  const dueThisWeek = activeProjects.filter(p => { const d = daysUntil(p.target_date); return d !== null && d >= 0 && d <= 7 })
  const blocked = myProjects.filter(p => p.is_blocked)

  // Pie data
  const completed  = myProjects.filter(p => p.status === 'completed').length
  const pending    = activeProjects.length - overdue.length - blocked.length
  const pieData = [
    { label: 'Active',    value: pending,             color: '#3B82F6' },
    { label: 'Overdue',   value: overdue.length,       color: '#EF4444' },
    { label: 'Blocked',   value: blocked.length,       color: '#F59E0B' },
    { label: 'Completed', value: completed,             color: '#10B981' },
  ].filter(d => d.value > 0)

  // Today's notifications only (unread OR created today)
  const todayStr = new Date().toISOString().split('T')[0]
  const dashNotifs = notifications.filter(n =>
    !n.is_read || n.created_at.startsWith(todayStr)
  ).slice(0, 5)

  return (
    <div>
      <TopBar title={`Welcome, ${profile?.name?.split(' ')[0] ?? 'there'}`} subtitle="Your workspace" />

      <div className="p-6 space-y-5 animate-fade-up">
        <IncomingTransfers />

        {/* Theme switcher + New Task */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1.5 glass-panel rounded-xl px-3 py-2">
            <Sym name="palette" size={13} className="text-white/60 mr-1" />
            {THEMES.map(t => (
              <button
                key={t.value}
                title={t.label}
                onClick={() => setTheme(t.value)}
                className={cn(
                  'w-5 h-5 rounded-full border-2 transition-transform hover:scale-110',
                  currentTheme === t.value ? 'border-white scale-110' : 'border-white/30'
                )}
                style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
              />
            ))}
          </div>
          <button
            onClick={() => setCreatingTask(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 border border-white/20 text-white text-sm font-medium rounded-xl transition-all"
          >
            <Sym name="add_task" size={15} /> New Task
          </button>
        </div>

        {/* Overdue alert */}
        {overdue.length > 0 && (
          <div className="glass-panel rounded-xl px-5 py-3 flex items-center gap-3 !bg-red-500/15 !border-red-400/30">
            <Sym name="warning" size={18} className="text-red-300 shrink-0" />
            <p className="text-sm text-white">
              <strong>{overdue.length} project{overdue.length > 1 ? 's' : ''}</strong> past target date.
            </p>
          </div>
        )}

        {/* Summary chips — all clickable */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Chip icon="folder_open" label="My Projects"   value={myProjects.length}   color="brand"
            onClick={() => navigate('/projects?scope=mine')} />
          <Chip icon="warning"     label="Overdue"       value={overdue.length}       color={overdue.length > 0 ? 'red' : 'gray'}
            onClick={() => navigate('/projects?filter=overdue')} />
          <Chip icon="schedule"    label="Due This Week" value={dueThisWeek.length}   color={dueThisWeek.length > 0 ? 'amber' : 'gray'}
            onClick={() => navigate('/projects?filter=week')} />
          <Chip icon="block"       label="Blocked"       value={blocked.length}       color="gray"
            onClick={() => navigate('/projects?filter=blocked')} />
        </div>

        {/* Director KPIs (admin only) */}
        {isAdmin && stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiMini label="Total Active"    value={stats.active}          sub="projects" />
            <KpiMini label="Active Clients"  value={stats.activeClients}   sub="registered" />
            <KpiMini label="Total Billed"    value={formatRupees(stats.totalRevenue)} sub="received" isRupee />
            <KpiMini label="Pending Payment" value={formatRupees(stats.pendingPayment)} sub="outstanding" isRupee warn={stats.pendingPayment > 0} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left: Projects + Pie chart */}
          <div className="lg:col-span-2 space-y-5">

            {/* Projects */}
            <div>
              <SectionHeader title="My Active Projects" count={activeProjects.length} onViewAll={() => navigate('/projects')} />
              {loadingProjects ? (
                <SkeletonList rows={3} />
              ) : activeProjects.length === 0 ? (
                <EmptyState message="No active projects assigned to you." />
              ) : (
                <div className="space-y-2">
                  {activeProjects.slice(0, 8).map(p => {
                    const days = daysUntil(p.target_date)
                    const isOverdue = days !== null && days < 0
                    return (
                      <div
                        key={p.id}
                        onClick={() => navigate(`/projects/${p.id}`)}
                        className="glass-panel rounded-xl p-4 cursor-pointer hover:bg-white/[0.18] transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[11px] text-white/55">{p.project_code}</span>
                              {p.is_blocked && (
                                <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded-full font-medium">BLOCKED</span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-white mt-0.5 truncate">{p.project_name}</p>
                            <p className="text-xs text-white/60 mt-0.5">{(p as any).clients?.company_name}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            {p.active_clock && p.clock_switched_at && (
                              <ClockBadge clock={p.active_clock} since={p.clock_switched_at} isBlocked={p.is_blocked ?? false} personName="" />
                            )}
                            {p.target_date && (
                              <span className={cn(
                                'text-[11px] font-medium',
                                isOverdue ? 'text-red-300' : days !== null && days <= 7 ? 'text-warning-amber' : 'text-white/55'
                              )}>
                                {isOverdue ? `${Math.abs(days!)}d overdue` : days === 0 ? 'Due today' : `Due ${formatDate(p.target_date)}`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {activeProjects.length > 8 && (
                    <button onClick={() => navigate('/projects')} className="w-full glass-panel rounded-xl py-2.5 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all">
                      View all {activeProjects.length} projects →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Pie chart widget */}
            {pieData.length > 0 && (
              <PieChartWidget data={pieData} total={myProjects.length} navigate={navigate} />
            )}
          </div>

          {/* Right column: notifications + punches + pending payments */}
          <div className="space-y-5">

            {/* Notifications (today + unread) */}
            <div>
              <SectionHeader
                title="Notifications"
                count={dashNotifs.filter(n => !n.is_read).length}
                countLabel="unread"
                icon="notifications"
                onViewAll={() => navigate('/notifications')}
              />
              {loadingNotif ? (
                <SkeletonList rows={3} />
              ) : dashNotifs.length === 0 ? (
                <EmptyState message="No unread notifications." />
              ) : (
                <div className="space-y-1.5">
                  {dashNotifs.map(n => (
                    <div
                      key={n.id}
                      onClick={() => navigate('/notifications')}
                      className={cn(
                        'glass-panel rounded-xl px-4 py-3 cursor-pointer hover:bg-white/[0.15]',
                        !n.is_read && '!border-white/30 !bg-white/[0.16]'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {!n.is_read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-fixed-dim shrink-0" />}
                        <div className={cn('flex-1', n.is_read && 'ml-3.5')}>
                          <p className="text-xs font-medium text-white">{n.title}</p>
                          <p className="text-[10px] text-white/45 mt-1">{formatDate(n.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Today's punches */}
            {todayPunches.length > 0 && (
              <div>
                <SectionHeader title="Today's Punches" count={todayPunches.length} icon="fingerprint" />
                <div className="space-y-1.5">
                  {todayPunches.slice(0, 6).map((punch: any) => (
                    <div key={punch.id} className="glass-panel rounded-xl px-4 py-2.5 flex items-center justify-between">
                      <div>
                        {isAdmin && <p className="text-xs font-medium text-white">{punch.profiles?.name ?? '—'}</p>}
                        <p className="text-[11px] text-white/60">
                          {new Date(punch.punch_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full font-medium',
                        punch.punch_type === 'in' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                      )}>
                        {punch.punch_type === 'in' ? 'IN' : 'OUT'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending payments */}
            {pendingPayments.length > 0 && (
              <div>
                <SectionHeader title="Pending Payments" count={pendingPayments.length} icon="payments" />
                <div className="space-y-1.5">
                  {pendingPayments.slice(0, 5).map((p: any) => {
                    const pending = (p.quoted_amount ?? 0) - (p.paid_amount ?? 0)
                    const isOverduePayment = p.completed_date && new Date(p.completed_date) < new Date()
                    return (
                      <div
                        key={p.id}
                        onClick={() => navigate(`/projects/${p.id}`)}
                        className={cn(
                          'glass-panel rounded-xl px-4 py-2.5 cursor-pointer hover:bg-white/[0.15]',
                          isOverduePayment && '!border-red-400/30 !bg-red-500/10'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{p.project_name}</p>
                            <p className="text-[10px] text-white/55 truncate">{p.clients?.company_name}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={cn('text-xs font-bold', isOverduePayment ? 'text-red-300' : 'text-warning-amber')}>
                              {formatRupees(pending)}
                            </p>
                            {isOverduePayment && <p className="text-[9px] text-red-400">OVERDUE</p>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {pendingPayments.length > 5 && (
                    <button onClick={() => navigate('/reports/performance')} className="w-full glass-panel rounded-xl py-2 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all">
                      View all {pendingPayments.length} pending →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick-add task modal */}
      {creatingTask && (
        <TaskModal
          task={null}
          me={profile?.id ?? ''}
          isAdmin={isAdmin}
          staff={staff}
          projects={allProjects as any}
          clients={clients}
          onClose={() => setCreatingTask(false)}
        />
      )}
    </div>
  )
}

// ── Pie Chart Widget ─────────────────────────────────────────────────────────

function PieChartWidget({ data, total, navigate }: {
  data: { label: string; value: number; color: string }[]
  total: number
  navigate: ReturnType<typeof useNavigate>
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  const r = 60, cx = 80, cy = 80
  let cumulative = 0
  const total_ = data.reduce((s, d) => s + d.value, 0) || 1

  const slices = data.map(d => {
    const startAngle = (cumulative / total_) * 2 * Math.PI - Math.PI / 2
    cumulative += d.value
    const endAngle = (cumulative / total_) * 2 * Math.PI - Math.PI / 2
    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
    return {
      ...d,
      path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      pct: Math.round((d.value / total_) * 100),
    }
  })

  const FILTER_MAP: Record<string, string> = {
    Active: '/projects?filter=active',
    Overdue: '/projects?filter=overdue',
    Blocked: '/projects?filter=blocked',
    Completed: '/projects?status=completed',
  }

  return (
    <div className="glass-panel rounded-2xl p-5">
      <h2 className="font-display font-semibold text-white text-sm mb-4">Project Overview</h2>
      <div className="flex items-center gap-6">
        <div className="relative shrink-0">
          <svg width={160} height={160}>
            {slices.map(s => (
              <path
                key={s.label}
                d={s.path}
                fill={s.color}
                opacity={hovered && hovered !== s.label ? 0.4 : 1}
                className="cursor-pointer transition-opacity"
                onMouseEnter={() => setHovered(s.label)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => navigate(FILTER_MAP[s.label] ?? '/projects')}
              />
            ))}
            <circle cx={cx} cy={cy} r={30} fill="rgba(0,0,0,0.25)" />
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize={14} fontWeight="bold" fill="white">{total}</text>
            <text x={cx} y={cy + 12} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.6)">total</text>
          </svg>
        </div>
        <div className="space-y-2 flex-1">
          {slices.map(s => (
            <button
              key={s.label}
              onClick={() => navigate(FILTER_MAP[s.label] ?? '/projects')}
              onMouseEnter={() => setHovered(s.label)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                'w-full flex items-center gap-2.5 text-left transition-opacity',
                hovered && hovered !== s.label ? 'opacity-40' : 'opacity-100'
              )}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-xs text-white/80 flex-1">{s.label}</span>
              <span className="text-xs font-bold text-white">{s.value}</span>
              <span className="text-[10px] text-white/50 w-8 text-right">{s.pct}%</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Shared sub-components ────────────────────────────────────────────────────

function Chip({ icon, label, value, color, onClick }: {
  icon: string; label: string; value: number
  color: 'brand' | 'red' | 'amber' | 'gray'
  onClick?: () => void
}) {
  const iconColor = { brand: 'text-primary-fixed-dim', red: 'text-red-300', amber: 'text-warning-amber', gray: 'text-white/50' }[color]
  return (
    <button
      onClick={onClick}
      className="glass-panel-heavy rounded-2xl p-4 text-left hover:bg-white/[0.22] transition-all w-full"
    >
      <Sym name={icon} size={22} fill className={cn('mb-2', iconColor)} />
      <p className="text-2xl font-display font-bold text-white">{value}</p>
      <p className="text-[11px] font-medium mt-0.5 text-white/60">{label}</p>
    </button>
  )
}

function KpiMini({ label, value, sub, isRupee, warn }: {
  label: string; value: string | number; sub: string; isRupee?: boolean; warn?: boolean
}) {
  return (
    <div className="glass-panel rounded-xl p-3">
      <p className="text-[10px] text-white/55 uppercase tracking-wide">{label}</p>
      <p className={cn('text-sm font-bold font-mono mt-1', warn ? 'text-warning-amber' : 'text-white')}>{value}</p>
      <p className="text-[10px] text-white/40">{sub}</p>
    </div>
  )
}

function SectionHeader({ title, count, countLabel = 'total', icon, onViewAll }: {
  title: string; count?: number; countLabel?: string; icon?: string; onViewAll?: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {icon && <Sym name={icon} size={15} className="text-white/70" />}
        <h2 className="font-display font-semibold text-white text-sm">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        {count !== undefined && (
          <span className="text-[11px] text-white/70 bg-white/10 border border-white/15 px-2 py-0.5 rounded-full">
            {count} {countLabel}
          </span>
        )}
        {onViewAll && (
          <button onClick={onViewAll} className="text-[11px] text-white/55 hover:text-white transition-colors">View all →</button>
        )}
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="glass-panel rounded-xl border-dashed !border-white/20 p-8 text-center">
      <p className="text-xs text-white/60">{message}</p>
    </div>
  )
}

function SkeletonList({ rows }: { rows: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 glass-panel rounded-xl" />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Build check**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms && npm run build 2>&1 | tail -20
```
Fix any TypeScript errors before proceeding.

- [ ] **Step 5: Commit**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms
git add src/hooks/useDashboard.ts src/pages/dashboard/DashboardPage.tsx
git commit -m "$(cat <<'EOF'
feat: dashboard overhaul - clickable chips, pie chart, punches widget, pending payments, director merge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Notifications — Sidebar Page + Bell Blinking

**Files:**
- Create: `src/pages/notifications/NotificationsPage.tsx`
- Modify: `src/App.tsx` (add route)
- Modify: `src/components/layout/Sidebar.tsx` (add nav item)
- Modify: `src/components/layout/NotificationPanel.tsx` (add blink animation)
- Modify: `src/hooks/useNotifications.ts` (add markRead for single notif)

- [ ] **Step 1: Create NotificationsPage**

Create `src/pages/notifications/NotificationsPage.tsx`:

```tsx
import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useNotifications } from '@/hooks/useNotifications'
import { formatDate, cn } from '@/lib/utils'

const TYPE_COLOR: Record<string, string> = {
  stage_overdue:    'bg-red-100 text-red-700',
  expiry_warning:   'bg-amber-100 text-amber-700',
  block_request:    'bg-blue-100 text-blue-700',
  block_approved:   'bg-green-100 text-green-700',
  payment_overdue:  'bg-red-100 text-red-700',
}

type Filter = 'all' | 'unread' | 'read'

export default function NotificationsPage() {
  const { notifications, unreadCount, loading, markAllRead, markRead } = useNotifications()
  const [filter, setFilter] = useState<Filter>('all')

  const visible = notifications.filter(n => {
    if (filter === 'unread') return !n.is_read
    if (filter === 'read') return n.is_read
    return true
  })

  return (
    <div>
      <TopBar title="Notifications" subtitle={`${unreadCount} unread`} />

      <div className="p-6 animate-fade-up">
        {/* Filter tabs + Mark all read */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-1 glass-panel rounded-xl p-1">
            {(['all', 'unread', 'read'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize',
                  filter === f ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'
                )}
              >
                {f}
                {f === 'unread' && unreadCount > 0 && (
                  <span className="ml-1 text-[10px] bg-brand-600 text-white rounded-full px-1.5 py-0.5">{unreadCount}</span>
                )}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white border border-white/20 px-3 py-1.5 rounded-xl transition-all"
            >
              <Sym name="done_all" size={14} /> Mark all read
            </button>
          )}
        </div>

        {/* Notification list */}
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1,2,3,4,5].map(i => <div key={i} className="h-20 glass-panel rounded-xl" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="notifications_off" size={32} className="mx-auto text-white/30 mb-3" />
            <p className="text-sm text-white/60">
              {filter === 'unread' ? 'All caught up! No unread notifications.' : 'No notifications yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(n => (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                className={cn(
                  'glass-panel rounded-xl px-5 py-4 cursor-pointer hover:bg-white/[0.15] transition-all',
                  !n.is_read && '!bg-white/[0.18] !border-white/30'
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5',
                    TYPE_COLOR[n.type] ?? 'bg-gray-100 text-gray-600'
                  )}>
                    {n.type.replace(/_/g, ' ')}
                  </span>
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0 mt-1" />}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{n.title}</p>
                    {n.body && <p className="text-xs text-white/60 mt-0.5 leading-snug">{n.body}</p>}
                    <p className="text-[11px] text-white/40 mt-1.5 font-mono">{formatDate(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <button
                      onClick={e => { e.stopPropagation(); markRead(n.id) }}
                      className="text-white/40 hover:text-white transition-colors shrink-0"
                      title="Mark as read"
                    >
                      <Sym name="check" size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Check useNotifications has markRead for single notification**

In `src/hooks/useNotifications.ts`, verify `markRead` exists. If it's not exported, add:

```ts
// Add inside the useNotifications hook, after markAllRead:
const markRead = async (id: string) => {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
  setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  setUnreadCount(prev => Math.max(0, prev - 1))
}

// Add to the return object:
return { notifications, unreadCount, loading, markAllRead, markRead }
```

- [ ] **Step 3: Add route to App.tsx**

In `src/App.tsx`, add the notifications route inside the authenticated routes section:

```tsx
// At the top: add import
import NotificationsPage from '@/pages/notifications/NotificationsPage'

// In the routes, add alongside other protected routes:
<Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
```

- [ ] **Step 4: Add Notifications to Sidebar**

In `src/components/layout/Sidebar.tsx`, in the `NAV` array, add after the Tasks item:

```ts
{ href: '/notifications', label: 'Notifications', icon: 'notifications', roles: ['super_admin','director','manager','executive','accounts','hr','auditor'] },
```

To show unread count badge on the sidebar item, update the NavLink render:

```tsx
// Replace the NavLink content to show badge for notifications:
{NAV.filter(item => role && item.roles.includes(role)).map(item => (
  <NavLink key={item.href} to={item.href}
    className={({ isActive }) => cn(
      'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all group',
      isActive ? 'bg-white/20 text-white font-medium border-r-4 border-white'
               : 'text-white/70 hover:bg-white/10 hover:text-white'
    )}
  >
    {({ isActive }) => (
      <>
        <Sym name={item.icon} size={18} fill={isActive} className="shrink-0" />
        <span className="flex-1">{item.label}</span>
        {item.href === '/notifications' && unreadCount > 0 && (
          <span className="text-[9px] bg-red-500 text-white rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </>
    )}
  </NavLink>
))}
```

To get `unreadCount` in the sidebar, import and use the hook:

```tsx
import { useNotifications } from '@/hooks/useNotifications'
// Inside Sidebar():
const { unreadCount } = useNotifications()
```

- [ ] **Step 5: Add bell blink animation to NotificationPanel**

In `src/components/layout/NotificationPanel.tsx`, update the button with blink when unread:

```tsx
// Replace the button className:
<button
  onClick={() => setOpen(o => !o)}
  className={cn(
    'relative w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 transition-colors',
    unreadCount > 0 && 'animate-pulse-bell'
  )}
  aria-label="Notifications"
>
```

In `src/index.css`, add the bell animation:

```css
@keyframes pulse-bell {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.4); }
  50% { box-shadow: 0 0 0 6px rgba(255,255,255,0); }
}
.animate-pulse-bell {
  animation: pulse-bell 2s ease-in-out infinite;
}
```

- [ ] **Step 6: Build check**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms && npm run build 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms
git add src/pages/notifications/ src/App.tsx src/components/layout/Sidebar.tsx src/components/layout/NotificationPanel.tsx src/hooks/useNotifications.ts src/index.css
git commit -m "$(cat <<'EOF'
feat: notifications page + sidebar badge + bell pulse animation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Reports Overhaul — Filters, UI Fixes, Merge Queries, Referrals Tab

**Files:**
- Modify: `src/pages/reports/PerformancePage.tsx`
- Modify: `src/components/layout/Sidebar.tsx` (remove Queries Report entry)
- Modify: `src/App.tsx` (ensure /reports/queries still works via redirect)

### Changes:
1. **Employee filter** — dropdown to filter exec breakdown by employee
2. **Client filter** — show projects per client company
3. **Fix clock distribution** — replace long horizontal bars with 3 equal KPI cards
4. **Remove Revenue from exec breakdown** — table shows: Executive | Closed | On-Time only
5. **Queries Report tab** — move content from QueriesReportPage into a tab here
6. **Pending Payments tab** — list of all projects with pending payments

- [ ] **Step 1: Rewrite PerformancePage.tsx**

Replace the full `src/pages/reports/PerformancePage.tsx` content with the following. Key structural change: add a top-level `tab` state ('performance' | 'queries' | 'payments' | 'referrals'), and render the appropriate section per tab.

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { formatRupees, formatDate, cn } from '@/lib/utils'
import { Sym } from '@/components/shared/Sym'
import { useNavigate } from 'react-router-dom'

type ReportTab = 'performance' | 'queries' | 'payments' | 'referrals'

function periodOf(monthOffset: number) {
  const d = new Date()
  d.setMonth(d.getMonth() + monthOffset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function periodLabel(period: string) {
  const [y, m] = period.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

interface ExecRow { id: string; name: string; total: number; completed: number; onTime: number }

interface ReportData {
  period: string; projects_total: number; projects_closed: number
  on_time_rate: number; avg_closure_days: number; revenue_paise: number
  clock_employee_pct: number; clock_client_pct: number; clock_authority_pct: number
  exec_breakdown: ExecRow[]
}

async function computeReport(period: string): Promise<ReportData> {
  const [year, month] = period.split('-').map(Number)
  const from = new Date(year, month - 1, 1).toISOString()
  const to   = new Date(year, month, 0, 23, 59, 59).toISOString()

  const [closedRes, activeRes, payRes] = await Promise.all([
    supabase.from('projects')
      .select('id, assigned_to, target_date, completed_date, paid_amount, quoted_amount, active_clock')
      .eq('status', 'completed')
      .gte('completed_date', from.split('T')[0])
      .lte('completed_date', to.split('T')[0]),
    supabase.from('projects')
      .select('id, active_clock')
      .in('status', ['active', 'on_hold'])
      .lte('created_at', to),
    supabase.from('payments')
      .select('amount, project_id')
      .gte('payment_date', from.split('T')[0])
      .lte('payment_date', to.split('T')[0]),
  ])

  const closed  = closedRes.data ?? []
  const active_ = activeRes.data ?? []
  const pays    = payRes.data ?? []

  const pc = closed.length
  const onTime = closed.filter(p => p.target_date && p.completed_date && p.completed_date <= p.target_date).length
  const otr = pc ? Math.round((onTime / pc) * 100) : 0
  const days_ = closed.map(p => {
    if (!p.completed_date) return null
    const created = new Date(p.target_date ?? p.completed_date)
    return Math.max(0, Math.round((new Date(p.completed_date).getTime() - created.getTime()) / 86400000))
  }).filter((d): d is number => d !== null)
  const avgC = days_.length ? Math.round(days_.reduce((a,b) => a+b, 0) / days_.length) : 0

  const all_ = [...closed, ...active_]
  const t_  = all_.length || 1
  const emp  = all_.filter(p => p.active_clock === 'employee').length
  const cli  = all_.filter(p => p.active_clock === 'client').length
  const auth = all_.filter(p => p.active_clock === 'authority').length

  const execMap = new Map<string, ExecRow>()
  for (const p of closed) {
    if (!p.assigned_to) continue
    if (!execMap.has(p.assigned_to)) execMap.set(p.assigned_to, { id: p.assigned_to, name: '', total: 0, completed: 0, onTime: 0 })
    const row = execMap.get(p.assigned_to)!
    row.completed++; row.total++
    if (p.target_date && p.completed_date && p.completed_date <= p.target_date) row.onTime++
  }
  const execIds = [...execMap.keys()]
  if (execIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, name').in('id', execIds)
    for (const p of profs ?? []) { if (execMap.has(p.id)) execMap.get(p.id)!.name = p.name }
  }

  return {
    period, projects_total: pc + active_.length, projects_closed: pc,
    on_time_rate: otr, avg_closure_days: avgC,
    revenue_paise: pays.reduce((s,p) => s + (p.amount ?? 0), 0),
    clock_employee_pct: Math.round((emp / t_) * 100),
    clock_client_pct:   Math.round((cli / t_) * 100),
    clock_authority_pct:Math.round((auth / t_) * 100),
    exec_breakdown: [...execMap.values()].sort((a, b) => b.completed - a.completed),
  }
}

export default function PerformancePage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ReportTab>('performance')
  const [period, setPeriod] = useState(periodOf(0))
  const [execFilter, setExecFilter] = useState<string>('all')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['perf_report_live', period],
    queryFn: () => computeReport(period),
    staleTime: 5 * 60 * 1000,
  })

  const { data: saved = [] } = useQuery({
    queryKey: ['saved_reports'],
    queryFn: async () => {
      const { data } = await supabase
        .from('performance_reports')
        .select('*, profiles!performance_reports_generated_by_fkey(name)')
        .order('created_at', { ascending: false }).limit(12)
      return data ?? []
    },
  })

  // Queries data
  const { data: queries = [] } = useQuery({
    queryKey: ['authority-queries-report'],
    enabled: activeTab === 'queries',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('authority_queries')
        .select(`*, projects(project_code, project_name, clients(company_name))`)
        .order('received_date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  // Pending payments data
  const { data: pendingPays = [] } = useQuery({
    queryKey: ['pending-payments-report'],
    enabled: activeTab === 'payments',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`id, project_code, project_name, quoted_amount, paid_amount, payment_status, completed_date, target_date, assigned_to, clients(company_name), profiles_assigned:profiles!projects_assigned_to_fkey(name)`)
        .neq('payment_status', 'paid')
        .gt('quoted_amount', 0)
        .order('completed_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []).filter((p: any) => (p.quoted_amount ?? 0) > (p.paid_amount ?? 0))
    },
  })

  // Referrals data
  const { data: referrals = [] } = useQuery({
    queryKey: ['referrals-report'],
    enabled: activeTab === 'referrals',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referrals')
        .select(`*, clients(company_name), profiles!referrals_referred_by_fkey(name)`)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const saveReport = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error('No data')
      const { error } = await supabase.from('performance_reports').insert({
        report_period: data.period, projects_closed: data.projects_closed,
        on_time_rate: data.on_time_rate, avg_closure_days: data.avg_closure_days,
        revenue_paise: data.revenue_paise, generated_by: profile!.id,
        report_data: data as any,
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Report saved'); qc.invalidateQueries({ queryKey: ['saved_reports'] }) },
    onError: (e: Error) => toast.error('Save failed', e.message),
  })

  const PERIODS = Array.from({ length: 6 }, (_, i) => ({ value: periodOf(-i), label: periodLabel(periodOf(-i)) }))

  const filteredExec = execFilter === 'all' ? data?.exec_breakdown ?? []
    : (data?.exec_breakdown ?? []).filter(e => e.id === execFilter)

  const TABS: { key: ReportTab; label: string; icon: string }[] = [
    { key: 'performance', label: 'Performance', icon: 'bar_chart' },
    { key: 'payments',    label: 'Pending Payments', icon: 'payments' },
    { key: 'queries',     label: 'Queries Report', icon: 'fact_check' },
    { key: 'referrals',   label: 'Referrals', icon: 'handshake' },
  ]

  return (
    <div>
      <TopBar title="Reports" subtitle="Performance, payments, queries & referrals" />

      <div className="p-6 space-y-5 animate-fade-up">
        {/* Tab bar */}
        <div className="flex items-center gap-1 glass-panel rounded-xl p-1 w-fit flex-wrap">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all',
                activeTab === t.key ? 'bg-white/20 text-white font-medium' : 'text-white/60 hover:text-white'
              )}
            >
              <Sym name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Performance tab ── */}
        {activeTab === 'performance' && (
          <>
            {/* Period selector */}
            <div className="flex items-center gap-3 flex-wrap">
              <Sym name="bar_chart" size={16} className="text-white/70" />
              <span className="text-sm font-medium text-white">Period:</span>
              <div className="flex gap-1.5 flex-wrap">
                {PERIODS.map(p => (
                  <button key={p.value} onClick={() => setPeriod(p.value)}
                    className={cn('px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                      period === p.value ? 'bg-brand-600 text-white border-brand-700'
                        : 'border border-white/20 text-white hover:bg-white/10')}>
                    {p.label}
                  </button>
                ))}
              </div>
              {isFetching && <Sym name="refresh" size={12} className="animate-spin text-white/70" />}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 glass-panel rounded-xl animate-pulse" />)}
              </div>
            ) : data ? (
              <>
                {/* KPI row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KPI icon="check_circle" label="Projects Closed"  value={data.projects_closed} color="text-green-600" />
                  <KPI icon="trending_up"  label="On-Time Rate"     value={`${data.on_time_rate}%`} color={data.on_time_rate >= 80 ? 'text-green-600' : data.on_time_rate >= 60 ? 'text-amber-600' : 'text-red-600'} />
                  <KPI icon="schedule"     label="Avg Closure Days" value={`${data.avg_closure_days}d`} color="text-brand-600" />
                  <KPI icon="bar_chart"    label="Revenue Collected" value={formatRupees(data.revenue_paise)} color="text-brand-600" />
                </div>

                {/* Clock distribution — 3 equal cards, NOT long bars */}
                <div className="bg-white rounded-xl border border-border p-5">
                  <h3 className="text-sm font-semibold text-brand-950 mb-4">Clock Distribution (Active Projects)</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <ClockCard emoji="🟢" label="Employee"  pct={data.clock_employee_pct}  color="bg-green-500" />
                    <ClockCard emoji="🟡" label="Client"    pct={data.clock_client_pct}    color="bg-amber-400" />
                    <ClockCard emoji="🔵" label="Authority" pct={data.clock_authority_pct} color="bg-blue-500" />
                  </div>
                </div>

                {/* Executive filter + breakdown */}
                <div className="bg-white rounded-xl border border-border overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <Sym name="groups" size={14} className="text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-brand-950">Executive Breakdown</h3>
                    </div>
                    <select
                      value={execFilter}
                      onChange={e => setExecFilter(e.target.value)}
                      className="text-xs px-2 py-1.5 border border-border rounded-lg bg-white text-brand-950"
                    >
                      <option value="all">All Executives</option>
                      {(data.exec_breakdown ?? []).map(e => (
                        <option key={e.id} value={e.id}>{e.name || e.id}</option>
                      ))}
                    </select>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-[#F8FAFC]">
                        <tr>
                          {['Executive','Closed','On-Time'].map(h => (
                            <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredExec.length === 0 ? (
                          <tr><td colSpan={3} className="px-5 py-6 text-center text-xs text-muted-foreground">No data</td></tr>
                        ) : filteredExec.map(e => (
                          <tr key={e.id} className="hover:bg-[#F8FAFC]">
                            <td className="px-5 py-3 font-medium text-brand-950">{e.name || '—'}</td>
                            <td className="px-5 py-3">{e.completed}</td>
                            <td className="px-5 py-3">
                              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
                                e.completed
                                  ? e.onTime / e.completed >= 0.8 ? 'bg-green-100 text-green-700'
                                  : e.onTime / e.completed >= 0.6 ? 'bg-amber-100 text-amber-700'
                                  : 'bg-red-100 text-red-700'
                                  : 'bg-gray-100 text-gray-600')}>
                                {e.completed ? `${Math.round((e.onTime / e.completed) * 100)}%` : '—'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button onClick={() => saveReport.mutate()} disabled={saveReport.isPending}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                    <Sym name="download" size={13} />
                    {saveReport.isPending ? 'Saving…' : 'Save Report'}
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}

        {/* ── Pending Payments tab ── */}
        {activeTab === 'payments' && (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Sym name="payments" size={14} className="text-muted-foreground" />
              <h3 className="text-sm font-semibold text-brand-950">Pending Payments</h3>
              <span className="text-[11px] text-muted-foreground ml-auto">{pendingPays.length} projects</span>
            </div>
            {pendingPays.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">No pending payments — all clear!</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F8FAFC]">
                    <tr>
                      {['Project','Client','Executive','Quoted','Received','Pending','Completed','Status'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pendingPays.map((p: any) => {
                      const pend = (p.quoted_amount ?? 0) - (p.paid_amount ?? 0)
                      const isOD = p.completed_date && new Date(p.completed_date) < new Date()
                      return (
                        <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className={cn('cursor-pointer hover:bg-[#F8FAFC]', isOD && 'bg-red-50/60')}>
                          <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{p.project_code}</td>
                          <td className="px-4 py-3 font-medium text-brand-950 max-w-[140px] truncate">{(p as any).clients?.company_name ?? '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground">{(p as any).profiles_assigned?.name ?? '—'}</td>
                          <td className="px-4 py-3 font-mono">{formatRupees(p.quoted_amount)}</td>
                          <td className="px-4 py-3 font-mono text-green-700">{formatRupees(p.paid_amount ?? 0)}</td>
                          <td className="px-4 py-3 font-mono font-semibold text-red-700">{formatRupees(pend)}</td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{p.completed_date ? formatDate(p.completed_date) : '—'}</td>
                          <td className="px-4 py-3">
                            {isOD
                              ? <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">OVERDUE</span>
                              : <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">PENDING</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Queries Report tab ── */}
        {activeTab === 'queries' && (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-brand-950">Queries Report</h3>
            </div>
            {queries.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">No queries recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F8FAFC]">
                    <tr>
                      {['Project','Client','Query','Status','Received','Resolved'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {queries.map((q: any) => (
                      <tr key={q.id} className="hover:bg-[#F8FAFC] cursor-pointer" onClick={() => q.projects?.id && navigate(`/projects/${q.projects.id}`)}>
                        <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{q.projects?.project_code ?? '—'}</td>
                        <td className="px-4 py-3 font-medium text-brand-950 max-w-[120px] truncate">{q.projects?.clients?.company_name ?? '—'}</td>
                        <td className="px-4 py-3 max-w-[200px] truncate">{q.query_text ?? q.title ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
                            q.status === 'resolved' ? 'bg-green-100 text-green-700'
                              : q.status === 'pending' ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-600')}>
                            {q.status ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{q.received_date ? formatDate(q.received_date) : '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{q.resolved_date ? formatDate(q.resolved_date) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Referrals tab ── */}
        {activeTab === 'referrals' && (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-brand-950">Referrals</h3>
            </div>
            {referrals.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">No referrals recorded.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F8FAFC]">
                    <tr>
                      {['Client','Referred By','Status','Referral Fee','Date'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {referrals.map((r: any) => (
                      <tr key={r.id} className="hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3 font-medium text-brand-950">{r.clients?.company_name ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.profiles?.name ?? r.referrer_name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
                            r.status === 'converted' ? 'bg-green-100 text-green-700'
                              : r.status === 'pending' ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-600')}>
                            {r.status ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">{r.referral_fee ? formatRupees(r.referral_fee) : '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{r.created_at ? formatDate(r.created_at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function KPI({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2">
        <Sym name={icon} size={13} className={color} />
        <p className="stat-label">{label}</p>
      </div>
      <p className={cn('stat-value', color)}>{value}</p>
    </div>
  )
}

function ClockCard({ emoji, label, pct, color }: { emoji: string; label: string; pct: number; color: string }) {
  return (
    <div className="border border-border rounded-xl p-4 text-center">
      <p className="text-lg mb-1">{emoji}</p>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold font-mono text-brand-950 mt-1">{pct}%</p>
      <div className="mt-2 h-1.5 bg-[#F8FAFC] rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Remove Queries Report from Sidebar**

In `src/components/layout/Sidebar.tsx`, in the `NAV` array, remove the entry:
```ts
{ href: '/reports/queries', label: 'Queries Report', icon: 'fact_check', roles: [...] },
```

- [ ] **Step 3: Build check**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms && npm run build 2>&1 | tail -10
```
Fix TypeScript errors. Common ones: the `authority_queries` table fields may differ — adjust `q.query_text ?? q.title ?? q.description` to match the actual column name. If unsure, check `src/types/database.ts` for the `authority_queries` table row type. Similarly for `referrals` table.

- [ ] **Step 4: Commit**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms
git add src/pages/reports/PerformancePage.tsx src/components/layout/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat: reports overhaul - tabs for performance/payments/queries/referrals, employee filter, fixed clock cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final Push — Deploy

- [ ] **Step 1: Full build**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms && npm run build 2>&1
```
Must complete with no errors.

- [ ] **Step 2: Push to main (triggers GitHub Actions deploy)**

```bash
cd /Users/tarunsingh/Documents/Projects/tps-oms && git push origin main
```

- [ ] **Step 3: Monitor deployment**

Watch GitHub Actions at the repo's Actions tab. The deploy workflow pushes to `portal.tpsxpert.com`. Wait for green checkmark.

- [ ] **Step 4: Smoke test in incognito**

Open `https://portal.tpsxpert.com` in incognito. Check:
- [ ] Login works
- [ ] Clients page shows grid
- [ ] Tasks page defaults to "Open"
- [ ] Dashboard pie chart renders
- [ ] Dashboard chips navigate on click
- [ ] Payments tab shows summary cards + "Mark Complete" button
- [ ] Reports page shows 4 tabs
- [ ] Notifications sidebar page accessible at /notifications
- [ ] Bell icon pulses when unread

---

## Execution Notes

**Run Tasks 1, 2, 4 in parallel** (independent files, no shared state).

**Run Task 3 (DB migration) before Task 5 (themes)** — theme column must exist.

**Run Tasks 5, 6, 7, 8 after T3** — all touch the dashboard or auth profile.

**Run Task 9 last** — deploy only after all builds pass.

**If build errors on Task 6 (DashboardPage):** The `TaskModal` import path may differ — check `src/pages/tasks/TaskModal.tsx` exists and exports `TaskModal` as a named export. If `useProjects` and `useClients` have different import paths, adjust.

**If authority_queries columns differ:** Check `src/types/database.ts` around `authority_queries` table for exact column names (`query_text` vs `description`). Adjust Task 8's queries tab accordingly.
