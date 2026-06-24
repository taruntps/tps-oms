import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export type ClientDocument = Tables<'client_documents'> & {
  profiles?: { name: string } | null
}

export type ClientDocCategory = 'gst' | 'pan' | 'fssai' | 'other'

export const CLIENT_DOC_CATEGORIES: { value: ClientDocCategory; label: string }[] = [
  { value: 'gst',   label: 'GST Certificate' },
  { value: 'pan',   label: 'PAN Card' },
  { value: 'fssai', label: 'FSSAI Licence' },
  { value: 'other', label: 'Other' },
]

// Frontend upload limits (bucket also capped at 10 MB server-side).
export const MAX_DOC_BYTES = 6 * 1024 * 1024 // 6 MB — enough for a 5–6 page PDF/JPEG
export const ALLOWED_DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png']

export function useClientDocuments(clientId: string) {
  return useQuery({
    queryKey: ['client_documents', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_documents')
        .select('*, profiles!client_documents_uploaded_by_fkey(name)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ClientDocument[]
    },
  })
}

export function useUploadClientDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      file,
      clientId,
      category,
      uploadedBy,
    }: {
      file: File
      clientId: string
      category: ClientDocCategory
      uploadedBy?: string
    }) => {
      if (file.size > MAX_DOC_BYTES) {
        throw new Error('File exceeds 6 MB. Please upload a smaller PDF or image.')
      }
      if (!ALLOWED_DOC_MIME.includes(file.type)) {
        throw new Error('Only PDF, JPG or PNG files are allowed.')
      }

      // Sanitise the filename and keep it under a per-client folder so Storage RLS
      // can recognise it as a client document (path starts with "clients/").
      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const path = `clients/${clientId}/${category}_${Date.now()}_${safeName}`

      const { error: storageErr } = await supabase.storage
        .from('documents')
        .upload(path, file, { upsert: false, contentType: file.type })
      if (storageErr) throw storageErr

      const { data, error } = await supabase
        .from('client_documents')
        .insert({
          client_id:       clientId,
          category,
          file_name:       file.name,
          storage_path:    path,
          file_size_bytes: file.size,
          mime_type:       file.type,
          uploaded_by:     uploadedBy ?? null,
        })
        .select()
        .single()
      if (error) {
        // Roll back the orphaned storage object if the row insert fails.
        await supabase.storage.from('documents').remove([path])
        throw error
      }
      return data
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ['client_documents', d.client_id] }),
  })
}

export function useDeleteClientDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (doc: ClientDocument) => {
      const { error: storageErr } = await supabase.storage
        .from('documents')
        .remove([doc.storage_path])
      if (storageErr) throw storageErr
      const { error } = await supabase.from('client_documents').delete().eq('id', doc.id)
      if (error) throw error
      return doc
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ['client_documents', d.client_id] }),
  })
}

// Short-lived signed URL for viewing/downloading a private document.
export function useClientDocumentUrl() {
  return async (storagePath: string, download = false) => {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 120, download ? { download: true } : undefined)
    if (error) throw error
    return data?.signedUrl ?? null
  }
}
