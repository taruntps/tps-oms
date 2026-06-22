import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TablesInsert } from '@/types/database'

export function usePayments(projectId: string) {
  return useQuery({
    queryKey: ['payments', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, profiles!payments_recorded_by_fkey(name)')
        .eq('project_id', projectId)
        .order('payment_date', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreatePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: TablesInsert<'payments'>) => {
      const { data, error } = await supabase.from('payments').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['payments', v.project_id] })
      qc.invalidateQueries({ queryKey: ['projects', v.project_id] })
    },
  })
}
