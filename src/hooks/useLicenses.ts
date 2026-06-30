import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type License = Tables<'licenses'>
export type LicenseInsert = TablesInsert<'licenses'>
export type LicenseUpdate = TablesUpdate<'licenses'>

export function useLicenses(clientId: string) {
  return useQuery({
    queryKey: ['licenses', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!clientId,
  })
}

export function useCreateLicense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: LicenseInsert) => {
      const { data, error } = await supabase.from('licenses').insert(payload).select().single()
      if (error) {
        if (error.code === '23505') throw new Error('This FSSAI licence number is already registered. Search for the existing record and edit it instead.')
        throw error
      }
      return data
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ['licenses', d.client_id] }),
  })
}

export function useUpdateLicense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: LicenseUpdate & { id: string }) => {
      const { data, error } = await supabase.from('licenses').update(payload).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ['licenses', d.client_id] }),
  })
}

export function useStoreCredential() {
  return useMutation({
    mutationFn: async ({ licenseId, username, password }: { licenseId: string; username: string; password: string }) => {
      const { error } = await supabase.rpc('store_fssai_credential', {
        p_license_id: licenseId,
        p_username:   username,
        p_password:   password,
        p_reason:     'Set via portal',
      })
      if (error) throw error
    },
  })
}

export function useRevealCredential() {
  return useMutation({
    mutationFn: async ({ licenseId, reason }: { licenseId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('reveal_fssai_credential', {
        p_license_id: licenseId,
        p_reason: reason,
      })
      if (error) throw error
      return data as string
    },
  })
}
