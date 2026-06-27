-- Migration 034: versioned stage attachments (Artwork revisions, DTM, etc.).
-- Reuses the private 'documents' storage bucket under a stages/<stage_id>/ prefix.
create table if not exists stage_documents (
  id              uuid primary key default uuid_generate_v4(),
  stage_id        uuid not null references stages(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  version_no      smallint not null,
  doc_type        text not null default 'revision',  -- revision | dtm | approved | other
  file_name       text not null,
  storage_path    text not null,
  file_size_bytes bigint,
  mime_type       text,
  uploaded_by     uuid references profiles(id),
  created_at      timestamptz not null default now()
);
create index if not exists stage_documents_stage_idx on stage_documents(stage_id);

alter table stage_documents enable row level security;
drop policy if exists stage_documents_select on stage_documents;
create policy stage_documents_select on stage_documents for select to authenticated using (true);
drop policy if exists stage_documents_write on stage_documents;
create policy stage_documents_write on stage_documents for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- Storage policies for the stages/ prefix in the documents bucket
drop policy if exists "stage docs read"   on storage.objects;
drop policy if exists "stage docs write"  on storage.objects;
drop policy if exists "stage docs delete" on storage.objects;
create policy "stage docs read"  on storage.objects for select to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'stages');
create policy "stage docs write" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (storage.foldername(name))[1] = 'stages');
create policy "stage docs delete" on storage.objects for delete to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'stages');
