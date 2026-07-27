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

// ── Project ↔ FSSAI license binding ──────────────────────────────────────────
// New application flow: a project exists first; once the App Ref No + portal
// password are known, we create a pending licence (no number yet, username =
// app ref no), store the password, and link it to the project.
export function useCreateProjectFssaiCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      { projectId, clientId, appRefNo, password, createdBy }:
      { projectId: string; clientId: string; appRefNo: string; password: string; createdBy?: string | null }
    ) => {
      const username = appRefNo.trim()
      if (!username) throw new Error('Enter the App Ref No (login ID) first.')
      if (!password.trim()) throw new Error('Enter the FSSAI portal password.')
      // 1. create the pending licence for this client
      const { data: lic, error: e1 } = await supabase
        .from('licenses')
        .insert({
          client_id: clientId,
          license_type: 'Central Licence',
          status: 'pending_approval',
          license_number: null,
          credential_username: username,
          created_by: createdBy ?? null,
        } as any)
        .select()
        .single()
      if (e1) throw e1
      // 2. store the password in the vault
      const { error: e2 } = await supabase.rpc('store_fssai_credential', {
        p_license_id: lic.id, p_username: username, p_password: password, p_reason: 'Set via project detail',
      })
      if (e2) throw e2
      // 3. link it to the project (mirror the app ref no)
      const { error: e3 } = await supabase
        .from('projects')
        .update({ license_id: lic.id, app_ref_no: username } as any)
        .eq('id', projectId)
      if (e3) throw e3
      return lic
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['licenses', v.clientId] })
      qc.invalidateQueries({ queryKey: ['projects', v.projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useLinkProjectLicense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, licenseId }: { projectId: string; licenseId: string | null }) => {
      const { error } = await supabase.from('projects').update({ license_id: licenseId } as any).eq('id', projectId)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['projects', v.projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
