import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database'

export type QueryRound = Tables<'authority_queries'> & {
  points: Tables<'query_points'>[]
  creator: { name: string } | null
}

// 30 calendar days from a yyyy-mm-dd date
export function addCalendarDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// All query ROUNDS (deficiency letters) for a project, each with its points.
export function useAuthorityQueries(projectId: string) {
  return useQuery({
    queryKey: ['authority_queries', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('authority_queries')
        .select('*, points:query_points(*), creator:profiles!authority_queries_created_by_fkey(name)')
        .eq('project_id', projectId)
        .order('received_date', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => ({
        ...r,
        points: ((r as any).points ?? []).sort((a: any, b: any) => a.point_order - b.point_order),
      })) as unknown as QueryRound[]
    },
  })
}

// Create a round (one deficiency letter) with N query points.
export function useCreateQueryRound() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      projectId: string; received_date: string; query_type: TablesInsert<'authority_queries'>['query_type']
      subject: string; points: string[]; created_by: string
    }) => {
      // round_no + query_code (<project_code>-Q<n>) are stamped by the generate_query_code trigger.
      const { data: round, error } = await supabase.from('authority_queries').insert({
        project_id: args.projectId, received_date: args.received_date, query_type: args.query_type,
        subject: args.subject || 'Deficiency Letter',
        response_due: addCalendarDays(args.received_date, 30), created_by: args.created_by,
      } as any).select().single()
      if (error) throw error
      const rows = args.points.filter(p => p.trim()).map((p, i) => ({ query_id: round.id, point_order: i + 1, description: p.trim() }))
      if (rows.length) {
        const { error: e2 } = await supabase.from('query_points').insert(rows as any)
        if (e2) throw e2
      }
      return round
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['authority_queries', v.projectId] }),
  })
}

// Save responses for a round's points + the round's single response-submitted date.
export function useSaveRoundResponse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { roundId: string; projectId: string; responses: Record<string, string>; response_submitted_date: string; responded_by: string }) => {
      for (const [pid, text] of Object.entries(args.responses)) {
        const { error } = await supabase.from('query_points')
          .update({ response: text || null, responded_at: text ? new Date().toISOString() : null, responded_by: args.responded_by } as any)
          .eq('id', pid)
        if (error) throw error
      }
      const { error: e2 } = await supabase.from('authority_queries')
        .update({ response_submitted_date: args.response_submitted_date, responded_at: new Date().toISOString(), responded_by: args.responded_by } as any)
        .eq('id', args.roundId)
      if (e2) throw e2
      // Auto-flip the project's Status-at-FSSAI stage from 'Query Raised' back to
      // 'Document Scrutinisation' now that the response is filed.
      await (supabase.from('stages') as any)
        .update({ fssai_status: 'Document Scrutinisation' })
        .eq('project_id', args.projectId).eq('stage_kind', 'status_fssai').eq('fssai_status', 'Query Raised')
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['authority_queries', v.projectId] }),
  })
}

// ── SOI archive (unchanged) ──
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

export function useDeleteSoi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ soiId, clientId }: { soiId: string; clientId: string }) => {
      await (supabase as any).from('soi_products').delete().eq('soi_id', soiId)
      const { error } = await (supabase as any).from('soi_archive').delete().eq('id', soiId)
      if (error) throw error
      return clientId
    },
    onSuccess: (clientId) => qc.invalidateQueries({ queryKey: ['soi_archive', clientId] }),
  })
}
