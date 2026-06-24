# Arctic Precision Theme — Design Spec

**Goal:** Re-skin the TPS-OMS portal to the "Arctic Precision" glassmorphism theme (from the Google Stitch mockup). **Design only** — no routes, hooks, Supabase, RLS, data, or settings change.

**Scope:** ~27 files use `lucide-react`; ~34 files use brand/surface styling. This is a full visual re-skin, executed in phases.

## Decisions (confirmed with user)
- **Hybrid glass:** full glass + mesh-gradient on the shell, dashboards, KPI cards, headers. Forms, dropdowns, date-pickers and dense tables stay on **readable surfaces** (lighter glass / solid fields with dark text) for contrast.
- **Icons:** switch from lucide to **Material Symbols Outlined** via a `<Sym name="…" />` wrapper, swapped per-file during each phase.
- **Replace** the old light theme entirely (no toggle).
- **Same fonts/colors as the attached DESIGN.md.**

## Theme tokens

**Fonts** (Google Fonts, loaded in `index.html`):
- Headlines/display → **Manrope** (600/700/800)
- Body/UI → **Inter** (400/500/600)
- Labels/IDs/currency/timestamps → **JetBrains Mono** (500)

**Core colors** (from DESIGN.md):
- `primary` #004c6e · `primary-container` #006591 · `on-primary-container` #b5deff · `primary-fixed` #c8e6ff · `primary-fixed-dim` #89ceff
- `success-emerald` #10B981 · `warning-amber` #EAB308 · `indigo-insight` #6366F1 · `error` #ba1a1a
- Surfaces (for readable/light areas): `surface` #faf8ff, `surface-container` #eaedff, `on-surface` #131b2e, `outline` #70787f, `outline-variant` #c0c7cf

**Mesh gradient** (global app background):
```css
background-color:#004c6e;
background-image:
  radial-gradient(at 0% 0%, #006591 0, transparent 50%),
  radial-gradient(at 100% 0%, #10B981 0, transparent 50%),
  radial-gradient(at 100% 100%, #004c6e 0, transparent 50%),
  radial-gradient(at 0% 100%, #6366F1 0, transparent 50%);
```

**Glass utilities** (added to `index.css`):
- `.glass-panel` — `bg-white/12`, `backdrop-blur-[20px]`, `border border-white/15`, subtle shadow.
- `.glass-panel-heavy` — `bg-white/18`, `backdrop-blur-[24px]`, `border-white/20`.
- `.glass-readable` — for forms/tables: near-solid light surface (`bg-surface/95` or white/90) with `on-surface` dark text, for contrast.

## Hybrid surface rules
| Area | Treatment | Text |
|------|-----------|------|
| Body background | mesh gradient | — |
| Sidebar, TopBar, KPI cards, dashboard panels, activity feeds | `glass-panel` / `glass-panel-heavy` | white |
| Status badges | translucent tinted (`bg-<accent>/20 text-<accent> border-<accent>/30`) | accent |
| Forms, inputs, dropdowns, date pickers, modals body | `glass-readable` (light/solid) | dark `on-surface` |
| Dense data tables | light glass rows, dark text, accent status pills | dark |
| Primary buttons | `bg-primary-container text-on-primary-container` | — |

## Icon strategy
- New component `src/components/shared/Sym.tsx`: renders `<span class="material-symbols-outlined">{name}</span>` with size/fill/weight props mapping to `font-variation-settings` + `text-[Npx]`.
- Per file: replace lucide imports/usages with `<Sym name="…" size=… />`. Mapping examples: LayoutDashboard→`dashboard`, Users→`groups`, FolderKanban→`assignment`, FileText→`description`, Settings→`settings`, Bell→`notifications`, Plus→`add`, Pencil→`edit`, X→`close`, Eye→`visibility`, EyeOff→`visibility_off`, Trash2→`delete`, Check→`check`, AlertTriangle→`warning`, ArrowLeftRight→`swap_horiz`, Lock→`lock`, Download→`download`, Upload→`upload`, Search→`search`, Phone→`call`, Mail→`mail`, MapPin→`location_on`, Hash→`tag`, Clock→`schedule`, CheckCircle2→`check_circle`.

## Phased plan
1. **Foundation** — fonts + Material Symbols link in `index.html`; mesh-gradient body + glass utilities in `index.css`; remap `tailwind.config` colors (brand→navy scale, add accents/surfaces) + fonts (display→Manrope, sans→Inter). Add `Sym` component.
2. **App shell** — `AppShell`, `Sidebar`, `TopBar`, `NotificationPanel` → glass + mesh, white text, Material Symbols. Login page → glass card on mesh.
3. **Shared primitives** — buttons, status/expiry badges, `ClockBadge`, Toast, cards; the `Field`/`ic()` input helpers → `glass-readable`.
4. **Pages** — Dashboard (match mockup) → Clients → Projects/detail/tabs → Operations/Director/Reports → Admin/Settings/User-Mgmt. Each: glass shell surfaces + readable forms/tables, icon swap, verify.

## Guardrails
- No changes to `*.ts(x)` logic, hooks, RPC calls, RLS, migrations, routes, or data.
- Each phase: `tsc + build` clean; verify visually where reachable (login + shell at minimum) before commit.
- Keep accessibility: maintain readable contrast on all text (esp. forms/tables) — the reason for the hybrid approach.
