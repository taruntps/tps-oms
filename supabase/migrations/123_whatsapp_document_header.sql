-- 123 — WhatsApp campaigns: support a PDF (document) header so campaigns can attach the
-- company brochure inline, alongside the existing image header. `header_type` selects which
-- header the worker sends. Additive + backward-compatible: existing rows default to 'image'
-- and keep sending header_image_url exactly as before.
alter table public.wa_campaigns
  add column if not exists header_type text not null default 'image'
    check (header_type in ('none', 'image', 'document')),
  add column if not exists header_doc_url text,
  add column if not exists header_doc_filename text;
