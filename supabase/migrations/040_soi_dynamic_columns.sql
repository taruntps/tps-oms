-- 040 — SOI archive redesign: two formats (domestic / export), dynamic columns,
-- per-row jsonb payload, per-project version numbering.
--
-- The previous soi_products shape (hsn_code/quantity/uom/brand_name…) never matched
-- the code that inserts into it, so every save failed ("brand_name not found") and the
-- table holds 0 rows. Safe to drop and rebuild around a flexible jsonb payload that
-- supports BOTH the domestic SOI table and the export SOI table, plus column trimming.

-- ── soi_archive: snapshot header ────────────────────────────────────────────
alter table public.soi_archive
  add column if not exists soi_type   text  not null default 'domestic'
    check (soi_type in ('domestic','export')),
  add column if not exists columns    jsonb not null default '[]'::jsonb,  -- ordered [{key,label}] kept
  add column if not exists version_no integer;

-- ── soi_products: one row per product, fields held in jsonb ──────────────────
drop table if exists public.soi_products cascade;

create table public.soi_products (
  id         uuid primary key default gen_random_uuid(),
  soi_id     uuid not null references public.soi_archive(id) on delete cascade,
  sr_no      integer not null,
  data       jsonb   not null default '{}'::jsonb,   -- only the kept column keys
  created_at timestamptz not null default now()
);

create index soi_products_soi_id_idx on public.soi_products(soi_id);

alter table public.soi_products enable row level security;

create policy "auth read soi_products"  on public.soi_products for select using (true);
create policy "auth write soi_products" on public.soi_products for all    using (true) with check (true);
