import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesUpdate } from '@/types/database'

export function useAuthorityQueries(projectId: string) {
  return useQuery({
    queryKey: ['authority_queries', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('authority_queries')
        .select('*, profiles!authority_queries_created_by_fkey(name)')
        .eq('project_id', projectId)
        .order('received_date', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreateAuthorityQuery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: TablesInsert<'authority_queries'>) => {
      const { data, error } = await supabase.from('authority_queries').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ['authority_queries', d.project_id] }),
  })
}

export function useRespondToQuery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, response_note, responded_by }: {
      id: string; projectId: string; response_note: string; responded_by: string
    }) => {
      const payload: TablesUpdate<'authority_queries'> = {
        response_note,
        responded_by,
        responded_at: new Date().toISOString(),
      }
      const { data, error } = await supabase.from('authority_queries').update(payload).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['authority_queries', v.projectId] }),
  })
}

export function useSoiArchive(clientId: string) {
  return useQuery({
    queryKey: ['soi_archive', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('soi_archive')
        .select('*, profiles!soi_archive_created_by_fkey(name)')
        .eq('client_id', clientId)
        .order('soi_date', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreateSoi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: TablesInsert<'soi_archive'>) => {
      const { data, error } = await supabase.from('soi_archive').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ['soi_archive', d.client_id] }),
  })
}
