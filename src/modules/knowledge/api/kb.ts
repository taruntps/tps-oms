// Knowledge module — data access layer.
// Thin wrappers over Supabase for the enhanced KB surface. The generated
// Database types (src/types/database.ts) predate migration 080, so the new
// tables/columns aren't in the schema type yet — we access them through a
// loosely-typed client handle and map rows onto the domain types below.
// RLS remains the authoritative access boundary; this file only shapes queries.
import { supabase } from '@/lib/supabase'

// Loosely-typed handle for tables/columns not yet in the generated schema types.
const db = supabase as unknown as {
  from: (table: string) => any
}

// ── Domain types ────────────────────────────────────────────────────────────
export interface KbArticle {
  id: string
  title: string
  category: string
  content: string
  tags: string[] | null
  is_published: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  category_id: string | null
  reviewed_by: string | null
  published_at: string | null
  client_visible: boolean | null
}

export interface KbCategory {
  id: string
  name: string
  slug: string
  parent_id: string | null
  sort_order: number | null
}

export interface KbFeedback {
  id: string
  article_id: string
  user_id: string | null
  helpful: boolean
  comment: string | null
}

export interface CategoryInput {
  name: string
  slug: string
  parent_id?: string | null
  sort_order?: number | null
}

// ── Articles ─────────────────────────────────────────────────────────────────
/** All articles (RLS + the `publishedOnly` flag decide what's actually returned). */
export async function fetchArticles(publishedOnly: boolean): Promise<KbArticle[]> {
  let query = db
    .from('knowledge_base')
    .select('*')
    .order('updated_at', { ascending: false })
  if (publishedOnly) query = query.eq('is_published', true)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as KbArticle[]
}

/** A single article by id. */
export async function fetchArticle(id: string): Promise<KbArticle | null> {
  const { data, error } = await db
    .from('knowledge_base')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as KbArticle | null
}

// ── Categories ───────────────────────────────────────────────────────────────
export async function fetchCategories(): Promise<KbCategory[]> {
  const { data, error } = await db
    .from('kb_categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as KbCategory[]
}

export async function createCategory(input: CategoryInput): Promise<void> {
  const { error } = await db.from('kb_categories').insert({
    name: input.name,
    slug: input.slug,
    parent_id: input.parent_id ?? null,
    sort_order: input.sort_order ?? 0,
  })
  if (error) throw error
}

export async function updateCategory(id: string, input: CategoryInput): Promise<void> {
  const { error } = await db
    .from('kb_categories')
    .update({
      name: input.name,
      slug: input.slug,
      parent_id: input.parent_id ?? null,
      sort_order: input.sort_order ?? 0,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await db.from('kb_categories').delete().eq('id', id)
  if (error) throw error
}

// ── Feedback ─────────────────────────────────────────────────────────────────
/** The current user's existing feedback for an article, if any. */
export async function fetchMyFeedback(
  articleId: string,
  userId: string
): Promise<KbFeedback | null> {
  const { data, error } = await db
    .from('kb_article_feedback')
    .select('*')
    .eq('article_id', articleId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as KbFeedback | null
}

/** Upsert the current user's helpful/not-helpful vote for an article. */
export async function submitFeedback(params: {
  articleId: string
  userId: string
  helpful: boolean
  comment?: string | null
}): Promise<void> {
  const existing = await fetchMyFeedback(params.articleId, params.userId)
  if (existing) {
    const { error } = await db
      .from('kb_article_feedback')
      .update({ helpful: params.helpful, comment: params.comment ?? null })
      .eq('id', existing.id)
    if (error) throw error
    return
  }
  const { error } = await db.from('kb_article_feedback').insert({
    article_id: params.articleId,
    user_id: params.userId,
    helpful: params.helpful,
    comment: params.comment ?? null,
  })
  if (error) throw error
}

// ── Versions ─────────────────────────────────────────────────────────────────
/** Number of stored revisions for an article. */
export async function fetchVersionCount(articleId: string): Promise<number> {
  const { count, error } = await db
    .from('kb_article_versions')
    .select('*', { count: 'exact', head: true })
    .eq('article_id', articleId)
  if (error) throw error
  return count ?? 0
}
