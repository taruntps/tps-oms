// Documents module — data access over the unified `v_all_documents` view
// (migration 079). The view is not yet in the generated Database types, so the
// supabase client is cast to `any` for these reads — the same pattern used by
// other post-migration hooks (see src/hooks/useStageDocuments.ts).
import { supabase } from '@/lib/supabase'

/** One row of the `v_all_documents` unified read view. */
export interface AllDocumentRow {
  id: string
  source: string            // 'documents' | 'client_documents' | 'stage_documents'
  entity_type: string | null
  entity_id: string | null
  folder_id: string | null
  doc_type: string | null
  file_name: string
  storage_path: string | null
  file_size_bytes: number | null
  version: number | null
  is_current: boolean | null
  uploaded_by: string | null
  created_at: string
  /** Resolved uploader display name (joined client-side from `profiles`). */
  uploaded_by_name?: string | null
}

export interface DocumentFilters {
  search?: string
  source?: string
  entityType?: string
  docType?: string
}

/**
 * Fetch documents from the unified view, newest first. Uploader names are
 * resolved in a second query (the view carries no FK relationship metadata,
 * so a PostgREST embed is not available).
 */
export async function fetchAllDocuments(filters: DocumentFilters = {}): Promise<AllDocumentRow[]> {
  let query = (supabase as any)
    .from('v_all_documents')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters.source)     query = query.eq('source', filters.source)
  if (filters.entityType) query = query.eq('entity_type', filters.entityType)
  if (filters.docType)    query = query.eq('doc_type', filters.docType)
  if (filters.search)     query = query.ilike('file_name', `%${filters.search}%`)

  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as AllDocumentRow[]

  // Resolve uploader names in one batched lookup.
  const ids = [...new Set(rows.map(r => r.uploaded_by).filter(Boolean))] as string[]
  if (ids.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', ids)
    const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.name]))
    for (const r of rows) r.uploaded_by_name = r.uploaded_by ? nameById.get(r.uploaded_by) ?? null : null
  }
  return rows
}

/**
 * Short-lived signed URL for a private object in the `documents` bucket.
 * Used to download rows that carry a `storage_path` (all Supabase-Storage
 * backed sources). Pass `download` to force a save dialog.
 */
export async function getDocumentSignedUrl(storagePath: string, download = false): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, 120, download ? { download: true } : undefined)
  if (error) throw error
  return data?.signedUrl ?? null
}
