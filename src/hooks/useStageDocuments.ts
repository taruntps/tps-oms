import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const MAX_DOC_BYTES = 6 * 1024 * 1024 // 6 MB — a 5–6 page PDF/JPEG
export const ALLOWED_DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png']

export interface StageDocument {
  id: string; stage_id: string; project_id: string; version_no: number
  doc_type: string; file_name: string; storage_path: string
  file_size_bytes: number | null; mime_type: string | null
  uploaded_by: string | null; created_at: string
  profiles?: { name: string } | null
}

export function useStageDocuments(stageId: string) {
  return useQuery({
    queryKey: ['stage_documents', stageId],
    enabled: !!stageId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('stage_documents')
        .select('*, profiles!stage_documents_uploaded_by_fkey(name)')
        .eq('stage_id', stageId).order('version_no', { ascending: false })
      if (error) throw error
      return (data ?? []) as StageDocument[]
    },
  })
}

export function useUploadStageDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, stageId, projectId, docType, uploadedBy }: {
      file: File; stageId: string; projectId: string; docType: string; uploadedBy?: string
    }) => {
      if (file.size > MAX_DOC_BYTES) throw new Error('File exceeds 6 MB. Upload a smaller PDF or image.')
      if (!ALLOWED_DOC_MIME.includes(file.type)) throw new Error('Only PDF, JPG or PNG files are allowed.')

      const { data: existing } = await (supabase as any).from('stage_documents').select('version_no').eq('stage_id', stageId)
      const nextVersion = Math.max(0, ...((existing ?? []).map((r: any) => r.version_no ?? 0))) + 1
      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const path = `stages/${stageId}/v${nextVersion}_${Date.now()}_${safeName}`

      const { error: storageErr } = await supabase.storage.from('documents').upload(path, file, { upsert: false, contentType: file.type })
      if (storageErr) throw storageErr

      const { data, error } = await (supabase as any).from('stage_documents').insert({
        stage_id: stageId, project_id: projectId, version_no: nextVersion, doc_type: docType,
        file_name: file.name, storage_path: path, file_size_bytes: file.size, mime_type: file.type, uploaded_by: uploadedBy ?? null,
      }).select().single()
      if (error) { await supabase.storage.from('documents').remove([path]); throw error }
      return data
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['stage_documents', v.stageId] }),
  })
}

export function useStageDocumentUrl() {
  return async (storagePath: string, download = false) => {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(storagePath, 120, download ? { download: true } : undefined)
    if (error) throw error
    return data?.signedUrl ?? null
  }
}
