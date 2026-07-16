-- Migration 079 — Document Management (Wave 1, EXPAND). Additive over existing documents/
-- client_documents/stage_documents (all keep working; documents already has version/is_latest).
create table if not exists public.folders (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  parent_id uuid references public.folders(id) on delete cascade,
  entity_type text, entity_id uuid,
  drive_folder_id text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists folders_parent_idx on public.folders(parent_id);
create index if not exists folders_entity_idx on public.folders(entity_type, entity_id);
alter table public.documents add column if not exists folder_id uuid references public.folders(id);
create table if not exists public.document_versions (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version int not null, storage_path text, drive_file_id text, file_name text, size_bytes bigint,
  uploaded_by uuid references public.profiles(id), uploaded_at timestamptz not null default now(), note text,
  unique (document_id, version)
);
create index if not exists document_versions_doc_idx on public.document_versions(document_id);
create table if not exists public.document_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null, category text, storage_path text, body text,
  merge_fields jsonb not null default '[]'::jsonb, is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create or replace view public.v_all_documents with (security_invoker = true) as
  select d.id, 'documents'::text as source,
         case when d.project_id is not null then 'project' else 'client' end as entity_type,
         coalesce(d.project_id, d.client_id) as entity_id,
         d.folder_id, d.doc_type::text as doc_type, d.file_name, d.storage_path, d.file_size_bytes,
         d.version, d.is_latest as is_current, d.uploaded_by, d.created_at
  from public.documents d
  union all
  select cd.id, 'client_documents', 'client', cd.client_id, null::uuid, cd.category::text, cd.file_name, cd.storage_path, cd.file_size_bytes, 1, true, cd.uploaded_by, cd.created_at from public.client_documents cd
  union all
  select sd.id, 'stage_documents', 'stage', sd.stage_id, null::uuid, sd.doc_type::text, sd.file_name, sd.storage_path, sd.file_size_bytes, sd.version_no, true, sd.uploaded_by, sd.created_at from public.stage_documents sd;
alter table public.folders enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_templates enable row level security;
do $$ declare t text; begin
  foreach t in array array['folders','document_versions','document_templates'] loop
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select to public using (auth.uid() is not null)', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'executive'::user_role,'accounts'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'executive'::user_role,'accounts'::user_role,'hr'::user_role]))$p$, t||'_write', t);
  end loop; end $$;
