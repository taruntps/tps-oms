import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TablesInsert } from '@/types/database'

export function useDocuments(projectId: string) {
  return useQuery({
    queryKey: ['documents', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*, profiles!documents_uploaded_by_fkey(name)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      file,
      projectId,
      clientId,
      docType,
      uploadedBy,
    }: {
      file: File
      projectId: string
      clientId: string
      docType: string
      uploadedBy: string
    }) => {
      const ext = file.name.split('.').pop()
      const path = `${projectId}/${Date.now()}_${file.name}`

      const { error: storageErr } = await supabase.storage
        .from('documents')
        .upload(path, file, { upsert: false })
      if (storageErr) throw storageErr

      const payload: TablesInsert<'documents'> = {
        project_id:      projectId,
        client_id:       clientId,
        doc_type:        docType as any,
        file_name:       file.name,
        file_size_bytes: file.size,
        mime_type:       file.type || `application/${ext}`,
        storage_path:    path,
        uploaded_by:     uploadedBy,
        is_latest:       true,
        version:         1,
      }
      const { data, error } = await supabase.from('documents').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ['documents', d.project_id] }),
  })
}

export function useDocumentUrl() {
  return async (storagePath: string) => {
    const { data } = await supabase.storage.from('documents').createSignedUrl(storagePath, 60)
    return data?.signedUrl ?? null
  }
}
