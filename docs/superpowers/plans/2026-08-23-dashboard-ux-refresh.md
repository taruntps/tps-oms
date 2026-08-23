# Dashboard & UX Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Declutter the dashboard with a new Clean Light theme, add default-on desktop pop-up notifications, and show a per-login greeting popup with a daily-rotating thought.

**Architecture:** All front-end (React 18 + Vite + TS). Desktop notifications are a browser-side layer over the existing realtime `notifications` feed (no backend). The greeting is a modal gated by a session flag. Clean Light is a new `data-theme` value plus a rebuilt, light-styled dashboard; the dark sidebar rail stays.

**Tech Stack:** React, TanStack Query, Supabase JS (realtime), Tailwind, Web Notifications API. Spec: `docs/superpowers/specs/2026-08-23-dashboard-ux-refresh-design.md`.

**Verification for every task (this repo has no unit suite for UI):**
- Typecheck: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit` (expect: no output).
- Build gate: `npm run build` (expect: `✓ built`).
- Browser: `preview_start {name}` then check `read_console_messages` (no errors) and `read_page`/screenshot.
- Branch: work on `staging`; commit per task; promote (`main` ff + push) only on explicit user go.

**File structure (created / modified):**
- `src/hooks/useDesktopNotifications.ts` (create) — permission + enabled state + `notify()`.
- `src/hooks/useNotifications.ts` (modify) — fire desktop notification on new INSERT.
- `src/components/layout/AppShell.tsx` (modify) — mount greeting + kick off permission request.
- `src/data/dailyThoughts.ts` (create) — ~80 mixed thoughts + `thoughtOfTheDay()`.
- `src/components/shared/GreetingModal.tsx` (create) — greeting + daily thought, session-gated.
- `src/pages/settings/SettingsPage.tsx` (modify) — "Desktop notifications" toggle.
- `src/hooks/useTheme.ts` (modify) — add `clean-light` theme.
- theme CSS file (modify) — `:root[data-theme="clean-light"]` tokens (locate via grep).
- `src/pages/dashboard/DashboardPage.tsx` (modify) — rebuilt decluttered light layout.

---

## Phase A — Desktop pop-up notifications (default on)

### Task A1: `useDesktopNotifications` hook

**Files:** Create `src/hooks/useDesktopNotifications.ts`

- [ ] **Step 1: Create the hook**
```ts
import { useCallback, useEffect, useState } from 'react'

const OFF_KEY = 'desktop_notify_off'   // per-device opt-out
const supported = typeof window !== 'undefined' && 'Notification' in window

export function useDesktopNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied'
  )
  const [optedOut, setOptedOut] = useState(() => localStorage.getItem(OFF_KEY) === '1')

  // Auto-request once per load if the user hasn't opted out and hasn't decided yet.
  useEffect(() => {
    if (!supported || optedOut) return
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(setPermission).catch(() => {})
    }
  }, [optedOut])

  const enabled = supported && !optedOut && permission === 'granted'

  const setEnabled = useCallback(async (on: boolean) => {
    if (on) {
      localStorage.removeItem(OFF_KEY); setOptedOut(false)
      if (supported && Notification.permission === 'default') {
        setPermission(await Notification.requestPermission())
      }
    } else {
      localStorage.setItem(OFF_KEY, '1'); setOptedOut(true)
    }
  }, [])

  const notify = useCallback((title: string, body?: string) => {
    if (!enabled) return
    try {
      const n = new Notification(title, { body: body ?? undefined, icon: '/logo.png', tag: title + (body ?? '') })
      n.onclick = () => { window.focus(); window.location.assign('/notifications'); n.close() }
    } catch { /* ignore */ }
  }, [enabled])

  return { supported, permission, enabled, setEnabled, notify }
}
```

- [ ] **Step 2: Typecheck** — `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit` → no output.
- [ ] **Step 3: Commit** — `git add src/hooks/useDesktopNotifications.ts && git commit -m "feat(notify): desktop notification hook (permission + toggle + notify)"`

### Task A2: Fire desktop notifications on new alerts

**Files:** Modify `src/hooks/useNotifications.ts`

- [ ] **Step 1:** Read the file. It subscribes to `notifications` INSERTs for the current user (postgres_changes). In the INSERT handler, after updating the query cache, call a passed-in `onNew(title, body)` callback OR import and use `useDesktopNotifications().notify`. Prefer: have `useNotifications` accept an optional `onInsert?: (n) => void` and call it; wire the desktop notify at the call site (AppShell) to avoid circular hook coupling. If the realtime handler is internal, add: within the INSERT callback, dispatch a `window.dispatchEvent(new CustomEvent('tps:new-notification', { detail: { title, body } }))`.
```ts
// inside the realtime INSERT handler, after cache update:
const row: any = payload.new
window.dispatchEvent(new CustomEvent('tps:new-notification', {
  detail: { title: row.title as string, body: (row.body ?? '') as string },
}))
```
- [ ] **Step 2: Typecheck + build** — tsc (no output), `npm run build` (`✓ built`).
- [ ] **Step 3: Commit** — `git add src/hooks/useNotifications.ts && git commit -m "feat(notify): emit tps:new-notification event on new alert"`

### Task A3: Wire desktop notify + auto-permission at app load

**Files:** Modify `src/components/layout/AppShell.tsx`

- [ ] **Step 1:** In `AppShell`, call `const { notify } = useDesktopNotifications()` (this also auto-requests permission on load). Add an effect that listens for the custom event and forwards to `notify`:
```ts
useEffect(() => {
  const h = (e: Event) => { const d = (e as CustomEvent).detail; notify(d.title, d.body) }
  window.addEventListener('tps:new-notification', h)
  return () => window.removeEventListener('tps:new-notification', h)
}, [notify])
```
- [ ] **Step 2: Typecheck + build.**
- [ ] **Step 3: Browser verify** — `preview_start`, log in, trigger a notification (e.g. self-assign a task in another tab or insert a test row); confirm a desktop notification appears and clicking opens `/notifications`. Check `read_console_messages` for errors.
- [ ] **Step 4: Commit** — `git add src/components/layout/AppShell.tsx && git commit -m "feat(notify): desktop pop-ups for new alerts, auto-request permission"`

### Task A4: Settings toggle

**Files:** Modify `src/pages/settings/SettingsPage.tsx`

- [ ] **Step 1:** Add a "Desktop notifications" row using `useDesktopNotifications()` — a toggle bound to `enabled`, calling `setEnabled(!enabled)`. When `permission === 'denied'`, show helper text: "Blocked in your browser — enable notifications for this site in browser settings." Match the page's existing setting-row styling.
- [ ] **Step 2: Typecheck + build.**
- [ ] **Step 3: Commit** — `git add src/pages/settings/SettingsPage.tsx && git commit -m "feat(notify): settings toggle for desktop notifications"`

---

## Phase B — Morning greeting popup (every login)

### Task B1: Daily thoughts data

**Files:** Create `src/data/dailyThoughts.ts`

- [ ] **Step 1: Create the file** with a mixed, curated array (fill to ~80 lines; sample shown — the implementer completes the list with the same tone: motivation, wellness, light TPS/regulatory). No duplicates.
```ts
// Mixed daily thoughts: motivation, wellness, and light TPS/regulatory nuggets.
export const dailyThoughts: string[] = [
  'Small, consistent effort beats occasional intensity.',
  'A clear label protects a consumer — precision is care.',
  'Drink water before your first coffee; your focus will thank you.',
  'Compliance done early is cheaper than compliance done twice.',
  'Progress, not perfection — ship the next honest step.',
  'Stand up and stretch every hour; the work will still be there.',
  'Quality is remembered long after the deadline is forgotten.',
  // … implementer: extend to ~80 with the same mix and tone.
]

// Deterministic pick — same for everyone on a given day, changes daily (IST).
export function thoughtOfTheDay(d: Date = new Date()): string {
  const ist = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const start = new Date(ist.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((+ist - +start) / 86_400_000)
  return dailyThoughts[dayOfYear % dailyThoughts.length]
}
```
- [ ] **Step 2: Typecheck.**
- [ ] **Step 3: Commit** — `git add src/data/dailyThoughts.ts && git commit -m "feat(greeting): daily thoughts data + thoughtOfTheDay"`

### Task B2: GreetingModal component

**Files:** Create `src/components/shared/GreetingModal.tsx`

- [ ] **Step 1: Create the component.** Time-of-day greeting (IST), first name from `useAuth().profile`, today's date, `thoughtOfTheDay()`. Session-gated: on mount, if `sessionStorage.getItem('greeted_session')` is set, render nothing; otherwise show and set the flag. Dismiss on button/backdrop.
```tsx
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { thoughtOfTheDay } from '@/data/dailyThoughts'

const SESSION_KEY = 'greeted_session'
function greetWord(): string {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function GreetingModal() {
  const { profile } = useAuth()
  const [show, setShow] = useState(() => sessionStorage.getItem(SESSION_KEY) !== '1')
  if (!show || !profile) return null
  const dismiss = () => { sessionStorage.setItem(SESSION_KEY, '1'); setShow(false) }
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={dismiss}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-7 text-center" onClick={e => e.stopPropagation()}>
        <p className="text-xs text-muted-foreground">{date}</p>
        <h2 className="mt-1 text-2xl font-display font-bold text-brand-950">{greetWord()}, {profile.name?.split(' ')[0] ?? 'there'} 👋</h2>
        <p className="mt-4 text-sm text-brand-800 leading-relaxed border-t border-border pt-4">“{thoughtOfTheDay()}”</p>
        <button onClick={dismiss} className="mt-6 px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg">Start my day</button>
      </div>
    </div>
  )
}
```
- [ ] **Step 2:** On sign-out, clear the flag so the next login re-shows it. In `AuthContext.tsx` `signOut`, add `sessionStorage.removeItem('greeted_session')`.
- [ ] **Step 3: Typecheck + build.**
- [ ] **Step 4: Commit** — `git add src/components/shared/GreetingModal.tsx src/contexts/AuthContext.tsx && git commit -m "feat(greeting): per-login greeting modal with daily thought"`

### Task B3: Mount the greeting

**Files:** Modify `src/components/layout/AppShell.tsx`

- [ ] **Step 1:** Render `<GreetingModal />` inside `AppShell` (after the outlet/content).
- [ ] **Step 2: Browser verify** — log in → greeting shows once; navigate around → does not reopen; sign out + log in → shows again. `read_console_messages` clean.
- [ ] **Step 3: Commit** — `git add src/components/layout/AppShell.tsx && git commit -m "feat(greeting): mount GreetingModal in AppShell"`

---

## Phase C — Dashboard revamp (Clean Light)

### Task C1: Add the `clean-light` theme

**Files:** Modify `src/hooks/useTheme.ts`; modify theme CSS.

- [ ] **Step 1: Locate theme CSS** — `grep -rn 'data-theme' src --include=*.css`. It defines the gradient per theme.
- [ ] **Step 2:** In `useTheme.ts`, add to `THEMES`: `{ value: 'clean-light', label: 'Clean Light', from: '#EEF2F7', to: '#FFFFFF' }`, add `'clean-light'` to the `DashboardTheme` union, and change the default fallback from `'ocean'` to `'clean-light'` (both the effect default and `current` default).
- [ ] **Step 3:** In the theme CSS, add a block so the app background is light and expose light tokens for the dashboard:
```css
:root[data-theme="clean-light"] {
  --app-bg: #EEF2F7;
  --dash-card: #FFFFFF;
  --dash-border: #E2E8F1;
  --dash-ink: #12233B;
  --dash-ink-soft: #22324A;
  --dash-muted: #5B6B7F;
}
:root[data-theme="clean-light"] body { background: var(--app-bg); }
```
(Match the existing gradient block's structure; if themes set `background` on a specific element, mirror that.)
- [ ] **Step 4: Typecheck + build.**
- [ ] **Step 5: Commit** — `git add src/hooks/useTheme.ts <theme.css> && git commit -m "feat(theme): add Clean Light theme, default the dashboard to it"`

### Task C2: Rebuild the dashboard (declutter + light)

**Files:** Modify `src/pages/dashboard/DashboardPage.tsx`

- [ ] **Step 1: Remove clutter** — delete the Pending Payments block (lines ~261-295), the Today's Punches block (~225-259), and the `usePendingPayments` + `useTodayPunches` imports/calls. Remove the admin "Pending Payment" KPI from the KPI grid.
- [ ] **Step 2: Restyle to Clean Light** — replace `glass-panel` / `text-white` / `bg-white/…` classes in the dashboard with light equivalents: cards → `bg-white border border-[#E2E8F1] rounded-xl shadow-sm`; headings → `text-[#12233B]`; body → `text-[#22324A]`; muted → `text-[#5B6B7F]`. Keep the same component structure (StatCell, SectionHeader, project rows, notifications).
- [ ] **Step 3: Greeting header** — change the TopBar/hero to "Good {morning/afternoon/evening}, {firstName}" + date + "{overdue} overdue · {dueThisWeek} due this week" summary line.
- [ ] **Step 4: Slim stats strip** — three cells (My Projects, Overdue, Due this week); keep click-throughs; drop the Blocked cell.
- [ ] **Step 5: Admin Business snapshot** — wrap the admin KPIs (Total Active, Active Clients, Total Collected) in a collapsible `<details>` labelled "Business snapshot", default collapsed, admin-only. (Pending Payment KPI already removed.)
- [ ] **Step 6: Typecheck + build.**
- [ ] **Step 7: Browser verify** — dashboard shows greeting + slim stats + active projects + notifications; no Pending Payments / Punches; Clean Light styling; `read_console_messages` clean; screenshot for the user.
- [ ] **Step 8: Commit** — `git add src/pages/dashboard/DashboardPage.tsx && git commit -m "feat(dashboard): declutter + Clean Light 'my work' layout"`

### Task C3: Final review + promote

- [ ] **Step 1:** Full `npm run build` green.
- [ ] **Step 2:** Push `staging`; on user go-ahead, `git checkout main && git merge --ff-only staging`, then `git push origin main` (standalone), watch `gh run watch`, verify portal 200, `git checkout staging`.

---

## Self-review (done)
- **Spec coverage:** declutter ✓ (C2), remove Pending Payments ✓ (C2), Clean Light ✓ (C1/C2), desktop notifications default-on ✓ (A1-A4), greeting every login + daily thought ✓ (B1-B3). Scope note (Clean Light dashboard-only, dark sidebar kept) honored.
- **Placeholders:** the only "fill in" is the `dailyThoughts` list body (inherently content to author, ~80 lines) — acceptable and explicit.
- **Type consistency:** `useDesktopNotifications` returns `{ supported, permission, enabled, setEnabled, notify }` used consistently in A3/A4; `thoughtOfTheDay()` / `greetWord()` consistent across B1/B2; theme value `clean-light` consistent across C1/C2.
