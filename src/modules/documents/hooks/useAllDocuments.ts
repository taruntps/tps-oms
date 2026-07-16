// Documents module — React Query hooks over the unified `v_all_documents` view.
import { useQuery } from '@tanstack/react-query'
import {
  fetchAllDocuments,
  getDocumentSignedUrl,
  type AllDocumentRow,
  type DocumentFilters,
} from '../api/documents'

export type { AllDocumentRow, DocumentFilters }

/** Unified documents list. Filtering by source/entity/type is pushed to the
 *  server; free-text search matches file_name (ILIKE). */
export function useAllDocuments(filters: DocumentFilters = {}) {
  return useQuery({
    queryKey: ['all-documents', filters.source ?? '', filters.entityType ?? '', filters.docType ?? '', filters.search ?? ''],
    queryFn: () => fetchAllDocuments(filters),
    staleTime: 30_000,
  })
}

/** Returns an async fn that mints a short-lived signed URL for a storage path. */
export function useDocumentDownload() {
  return (storagePath: string, download = true) => getDocumentSignedUrl(storagePath, download)
}
