# Dashboard & UX Refresh — Design Spec

**Date:** 2026-08-23
**Author:** Tarun (with Claude)
**Status:** Approved for planning (awaiting implementation go-ahead)

## Goal

Three related improvements to the TPS-OMS portal experience:
1. Declutter the dashboard and give it a fresh **Clean Light** theme (a "my work" focus).
2. Turn the bell into **desktop pop-up notifications**, on by default.
3. Show a **greeting popup on every login** with a daily-rotating thought.

## Scope decisions

- **Theme B (Clean Light) is scoped to the dashboard** for this pass. The app shell (sidebar/top bar) stays as-is — a dark navy rail with a light content area is a clean, standard SaaS look and contains the change. Rolling Clean Light across every page (Clients, Projects, etc.) is a **noted future pass**, not part of this spec. *(Open for the reviewer to widen if desired.)*
- Existing theme mechanism is reused: `useTheme()` sets `data-theme` on `<html>` + saves `profiles.dashboard_theme`. We add a new `clean-light` theme value and make it the dashboard default.
- No external services for the daily thought (built-in list, no API) — reliable and free.

---

## Feature 1 — Dashboard revamp (Clean Light)

### Layout (role: all staff; "my work" focus)
Rebuild `src/pages/dashboard/DashboardPage.tsx`:

- **Greeting header** — "Good {morning/afternoon/evening}, {firstName}", today's date, and a one-line "N tasks due today / N overdue" summary. New Task button stays (top-right).
- **Overdue strip** — keep; only renders when `overdue.length > 0`.
- **Slim stats strip** — three compact cells: **My Projects**, **Overdue**, **Due this week**. (Drop "Blocked" from the strip; still reachable via `/projects?blocked=1`.)
- **My Active Projects** — the main focus; the existing list (clock chips, due colours) restyled for light.
- **Notifications** — compact rail (today/unread, up to 5), unchanged logic.

### Removed / moved
- **Remove: Pending Payments** — the right-rail list **and** the admin "Pending Payment" KPI number. (Still available in Projects → payments and Reports.) Drop the `usePendingPayments` call from the dashboard.
- **Move: Today's Punches** — off the dashboard; it lives on the Attendance page. Drop `useTodayPunches` from the dashboard.
- **Move: admin Business KPIs** (Total Active, Active Clients, Total Collected) — into a **collapsible "Business snapshot"** strip shown to admins only (default collapsed), so staff get a clean view. (Or omit here and rely on the Director page — reviewer's call.)

### Theme B — Clean Light palette
- Page/content bg `#EEF2F7`; cards `#FFFFFF` with `1px #E2E8F1` border + soft shadow, `12px` radius.
- Text: headings `#12233B`, body `#22324A`, muted `#5B6B7F`.
- Accents: brand navy `#1E3A5F`; positive/emerald `#0E9F6E`; warning amber `#C67A12`; danger red `#DC2626`.
- Implementation: add `clean-light` to `THEMES` in `useTheme.ts`; define its tokens in the theme CSS under `:root[data-theme="clean-light"]`. Rebuild the dashboard's markup to use light, theme-aware classes instead of the hardcoded `glass-panel` / `text-white` dark classes. Keep the dashboard readable if another (dark) theme is ever selected — but default the dashboard to `clean-light`.
- Sidebar/top bar: unchanged (dark navy rail).

### Success criteria
Dashboard shows greeting + slim stats + active projects + notifications only; no Pending Payments/Punches; Clean Light styling; loads without the removed hooks; no console errors.

---

## Feature 2 — Desktop pop-up notifications (default on)

### Behaviour
- On authenticated app load (`AppShell`), if `Notification.permission === 'default'` and the user hasn't opted out, **request permission** automatically (so it's effectively on by default).
- When a **new** in-app notification arrives, also fire a desktop `Notification(title, { body, icon: logo, tag: id })`. Clicking it focuses the tab and navigates to `/notifications`.
- A **settings toggle** ("Desktop notifications") lets any user turn it off; stored in `localStorage` (per device) — and optionally mirrored to the profile later.
- If permission is `denied` (browser-level), show a small one-time hint on how to re-enable; never nag.

### Data flow
- Reuse the existing realtime subscription in `src/hooks/useNotifications.ts` (it already subscribes to `notifications` INSERTs for the user). On each new INSERT while the tab is open, fire the desktop notification (dedupe by id; skip if the tab is focused and already on `/notifications`).
- No backend change — this is a browser-side layer over the existing feed.

### Success criteria
After allowing once, a new task/project/approval notification pops a desktop notification; clicking opens the portal; toggling off stops them.

---

## Feature 3 — Morning greeting popup (every login)

### Behaviour
- On **each login** (new authenticated session), show a dismissible welcome modal:
  - Time-of-day greeting: "Good morning" (<12:00), "Good afternoon" (12:00–17:00), "Good evening" (>17:00), IST.
  - "{firstName}", today's date.
  - A **daily-rotating thought** — chosen from a built-in array by day-of-year, so everyone sees the same one each day and it changes daily.
- "Every login" = show once per login session. Track with a `sessionStorage` flag (`greeted_session`) set when shown and cleared on sign-out, so it does not re-pop on internal navigation but does show again on the next fresh login.

### Content
- Built-in `dailyThoughts` array (~80 lines) — a **mix**: motivation, wellness/productivity tips, and the occasional TPS value or light regulatory nugget. Curated, non-repeating within the set. Index = `dayOfYear % thoughts.length`.

### Components
- New `src/components/shared/GreetingModal.tsx` + a small `dailyThoughts.ts` data file. Mounted in `AppShell`, shown when the session flag is unset after login.

### Success criteria
On login, the greeting shows once with the correct time-of-day text and that day's thought; dismiss closes it; navigating around does not reopen it; a fresh login re-shows it (with the next day's thought if the day changed).

---

## Out of scope (future)
- Rolling Clean Light across all pages/app shell.
- Per-user choice of thought category; admin-managed thought list.
- Push notifications when the tab is closed (would need a service worker + web push).
