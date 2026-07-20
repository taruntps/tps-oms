-- Migration 087 — prevent duplicate concurrent sync ops (review finding #1/#7). Applied to staging.
-- At most one ACTIVE (queued/processing) op per (entity, id, op): blocks a double-issue
-- race from enqueuing two create_invoice ops → two GetSwipe invoices. Terminal rows
-- (done/failed) are excluded so retries/re-issues after resolution still work.
create unique index if not exists billing_sync_queue_active_uq
  on public.billing_sync_queue (erp_entity, erp_id, op)
  where status in ('queued','processing');
