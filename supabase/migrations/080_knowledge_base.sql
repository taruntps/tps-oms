-- Migration 080 — Knowledge Base (Wave 1, EXPAND). Additive over existing knowledge_base
-- (already has category text + tags[] + is_published — all kept). Adds structured categories,
-- version history, review metadata, and feedback.
create table if not exists public.kb_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null, slug text unique not null,
  parent_id uuid references public.kb_categories(id) on delete set null,
  sort_order int not null default 100, created_at timestamptz not null default now()
);
alter table public.knowledge_base add column if not exists category_id uuid references public.kb_categories(id);
alter table public.knowledge_base add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.knowledge_base add column if not exists published_at timestamptz;
alter table public.knowledge_base add column if not exists client_visible boolean not null default false;
create table if not exists public.kb_article_versions (
  id uuid primary key default uuid_generate_v4(),
  article_id uuid not null references public.knowledge_base(id) on delete cascade,
  version int not null, title text, content text,
  edited_by uuid references public.profiles(id), edited_at timestamptz not null default now(),
  unique (article_id, version)
);
create index if not exists kb_article_versions_idx on public.kb_article_versions(article_id);
create table if not exists public.kb_article_feedback (
  id uuid primary key default uuid_generate_v4(),
  article_id uuid not null references public.knowledge_base(id) on delete cascade,
  user_id uuid references public.profiles(id), helpful boolean, comment text,
  created_at timestamptz not null default now()
);
create index if not exists kb_article_feedback_idx on public.kb_article_feedback(article_id);
alter table public.kb_categories enable row level security;
alter table public.kb_article_versions enable row level security;
alter table public.kb_article_feedback enable row level security;
drop policy if exists kb_categories_read on public.kb_categories;
create policy kb_categories_read on public.kb_categories for select to public using (auth.uid() is not null);
drop policy if exists kb_categories_write on public.kb_categories;
create policy kb_categories_write on public.kb_categories for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role]));
drop policy if exists kb_article_versions_read on public.kb_article_versions;
create policy kb_article_versions_read on public.kb_article_versions for select to public using (auth.uid() is not null);
drop policy if exists kb_article_versions_write on public.kb_article_versions;
create policy kb_article_versions_write on public.kb_article_versions for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role]));
drop policy if exists kb_article_feedback_read on public.kb_article_feedback;
create policy kb_article_feedback_read on public.kb_article_feedback for select to public using (auth.uid() is not null);
drop policy if exists kb_article_feedback_insert on public.kb_article_feedback;
create policy kb_article_feedback_insert on public.kb_article_feedback for insert to public with check (user_id = auth.uid());
