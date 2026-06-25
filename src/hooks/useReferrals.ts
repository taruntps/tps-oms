import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database'

export type Referral = Tables<'referrals'>

export function useReferrals() {
  return useQuery({
    queryKey: ['referrals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('referrals').select('*').order('name')
      if (error) throw error
      return data as Referral[]
    },
  })
}

export interface ReferralBreakdown extends Referral {
  clients: { id: string; company_name: string; received: number }[]
  total_received: number
}

// Each referral with its clients and the amount received (sum of payments) per client.
export function useReferralBreakdown() {
  return useQuery({
    queryKey: ['referrals', 'breakdown'],
    queryFn: async () => {
      const [refs, clients, payments] = await Promise.all([
        supabase.from('referrals').select('*').order('name'),
        supabase.from('clients').select('id, company_name, referral_id').not('referral_id', 'is', null),
        supabase.from('payments').select('client_id, amount'),
      ])
      if (refs.error) throw refs.error
      if (clients.error) throw clients.error
      if (payments.error) throw payments.error

      const paidByClient = new Map<string, number>()
      for (const p of payments.data ?? []) {
        paidByClient.set(p.client_id, (paidByClient.get(p.client_id) ?? 0) + (p.amount ?? 0))
      }

      return (refs.data ?? []).map(r => {
        const rc = (clients.data ?? []).filter(c => c.referral_id === r.id).map(c => ({
          id: c.id, company_name: c.company_name, received: paidByClient.get(c.id) ?? 0,
        }))
        return { ...r, clients: rc, total_received: rc.reduce((s, c) => s + c.received, 0) } as ReferralBreakdown
      })
    },
  })
}

export function useUpsertReferral() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: TablesInsert<'referrals'> & { id?: string }) => {
      if (r.id) {
        const { error } = await supabase.from('referrals').update(r).eq('id', r.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('referrals').insert(r)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['referrals'] }),
  })
}

export function useDeleteClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await (supabase.rpc as any)('delete_client', { p_client_id: clientId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}
