import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type Project = Tables<'projects'>
export type Stage   = Tables<'stages'>
export type BlockRequest = Tables<'block_requests'>
export type StageTimeline = Tables<'stage_timeline'>

export type ProjectWithRelations = Project & {
  clients: { company_name: string; contact_phone: string }
  profiles_assigned: { name: string } | null
  profiles_manager:  { name: string } | null
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          clients(company_name, contact_phone),
          profiles_assigned:profiles!projects_assigned_to_fkey(name),
          profiles_manager:profiles!projects_manager_id_fkey(name)
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ProjectWithRelations[]
    },
  })
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          clients(company_name, contact_phone, contact_email),
          profiles_assigned:profiles!projects_assigned_to_fkey(id, name),
          profiles_manager:profiles!projects_manager_id_fkey(id, name),
          stages(*),
          stage_timeline(*)
        `)
        .eq('id', id)
        .order('stage_order', { referencedTable: 'stages' })
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: TablesInsert<'projects'>) => {
      const { data, error } = await supabase.from('projects').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: TablesUpdate<'projects'> & { id: string }) => {
      const { data, error } = await supabase.from('projects').update(payload).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['projects', v.id] })
    },
  })
}

export function useUpdateStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId, ...payload }: TablesUpdate<'stages'> & { id: string; projectId: string }) => {
      const { data, error } = await supabase.from('stages').update(payload).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['projects', v.projectId] }),
  })
}

export function useSubmitBlockRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: TablesInsert<'block_requests'>) => {
      const { data, error } = await supabase.from('block_requests').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['projects', v.project_id] }),
  })
}

export function useApproveBlockRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, approved, note }: { requestId: string; approved: boolean; note?: string; projectId: string }) => {
      const { error } = await supabase.rpc('approve_block_request', {
        p_request_id: requestId,
        p_approved: approved,
        p_note: note,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['projects', v.projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useUnblockProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.rpc('unblock_project', { p_project_id: projectId })
      if (error) throw error
    },
    onSuccess: (_d, projectId) => {
      qc.invalidateQueries({ queryKey: ['projects', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function usePendingBlockRequests() {
  return useQuery({
    queryKey: ['block_requests', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('block_requests')
        .select('*, projects(project_code, project_name), profiles!block_requests_requested_by_fkey(name)')
        .is('approved', null)
        .order('requested_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => {
      // delete_project RPC: admin-only, removes all children then the project.
      const { error } = await (supabase.rpc as any)('delete_project', { p_project_id: projectId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
