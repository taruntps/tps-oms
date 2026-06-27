-- Migration 036: allow parallel per-product stage tracks (Artwork multi-product).
-- The old unique (project_id, stage_order) prevented two products sharing stage_order.
-- Replace with a product-aware unique index (null product treated as a fixed key,
-- so single-track projects keep their per-project uniqueness).
alter table stages drop constraint if exists stages_project_id_stage_order_key;
create unique index if not exists stages_order_uniq
  on stages (project_id, coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid), stage_order);
