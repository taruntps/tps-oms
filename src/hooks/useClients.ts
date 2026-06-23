import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type Client = Tables<'clients'>
export type ClientInsert = TablesInsert<'clients'>
export type ClientUpdate = TablesUpdate<'clients'>

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('company_name')
      if (error) throw error
      return data
    },
  })
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*, licenses(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useCreateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ClientInsert) => {
      const { data, error } = await supabase.from('clients').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}

export function useUpdateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: ClientUpdate & { id: string }) => {
      const { data, error } = await supabase.from('clients').update(payload).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['clients', v.id] })
    },
  })
}

/**
 * Returns true if the current user may edit client records.
 * super_admin always can; others need can_edit_clients = true on their profile.
 */
export function useCanEditClient(): boolean {
  const { profile } = useAuth()
  if (!profile) return false
  return profile.role === 'super_admin' || profile.can_edit_clients === true
}
