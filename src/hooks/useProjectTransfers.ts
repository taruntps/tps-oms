import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// Pending transfers awaiting MY acceptance (incoming).
export function useIncomingTransfers() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['project_transfers', 'incoming', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_transfers')
        .select(`
          id, project_id, reason, created_at, forced,
          projects(project_code, project_name),
          from_profile:profiles!project_transfers_from_user_fkey(name),
          initiator:profiles!project_transfers_initiated_by_fkey(name)
        `)
        .eq('to_user', profile!.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// Pending transfer (if any) for a specific project — shown as a badge.
export function useProjectPendingTransfer(projectId: string) {
  return useQuery({
    queryKey: ['project_transfers', 'project', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_transfers')
        .select('id, to_user, reason, initiated_by, to_profile:profiles!project_transfers_to_user_fkey(name)')
        .eq('project_id', projectId)
        .eq('status', 'pending')
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useInitiateTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, toUser, reason }: { projectId: string; toUser: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('initiate_project_transfer', {
        p_project_id: projectId,
        p_to_user:    toUser,
        p_reason:     reason || undefined,
      })
      if (error) throw error
      return data as string // 'pending' | 'forced'
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project_transfers'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export function useRespondTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ transferId, accept }: { transferId: string; accept: boolean }) => {
      const { data, error } = await supabase.rpc('respond_project_transfer', {
        p_transfer_id: transferId,
        p_accept:      accept,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project_transfers'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useCancelTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (transferId: string) => {
      const { error } = await supabase.rpc('cancel_project_transfer', { p_transfer_id: transferId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project_transfers'] }),
  })
}
