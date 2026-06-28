import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type Task = Tables<'tasks'>
export type TaskStatus   = 'pending' | 'done' | 'cancelled'
export type TaskPriority = Task['priority']

export type TaskWithRelations = Task & {
  assignee: { id: string; name: string } | null
  assigner: { id: string; name: string } | null
  project:  { id: string; project_code: string; project_name: string } | null
  client:   { id: string; company_name: string } | null
}

const SELECT = `
  *,
  assignee:profiles!tasks_assigned_to_fkey(id, name),
  assigner:profiles!tasks_assigned_by_fkey(id, name),
  project:projects(id, project_code, project_name),
  client:clients(id, company_name)
`

// RLS already limits rows to what the current user may see (assignee / assigner /
// manager+). The page filters the returned set into My / Assigned-by-me / All tabs.
export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(SELECT)
        .order('status', { ascending: true })          // pending first
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as TaskWithRelations[]
    },
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: TablesInsert<'tasks'>) => {
      const { error } = await supabase.from('tasks').insert(t)
      if (error) throw error
      // Fire the urgent-alerts function so the assignee/assigner get an email
      // immediately, rather than waiting for the hourly cron. Best-effort: never
      // block or fail task creation on the notification.
      supabase.functions.invoke('urgent-alerts', { body: {} }).catch(() => {})
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: TablesUpdate<'tasks'> & { id: string }) => {
      const { error } = await supabase.from('tasks').update(fields).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

// Fire-and-forget: ask the urgent-alerts function to email now (done / extension
// events) instead of waiting for the hourly cron. Never throws.
export function pokeAlerts() {
  supabase.functions.invoke('urgent-alerts', { body: {} }).catch(() => {})
}

export type TaskComment = Tables<'task_comments'> & { author: { name: string } | null }
export type TaskExtension = Tables<'task_extension_requests'> & { requester: { name: string } | null }

export function useTaskThread(taskId: string | null) {
  return useQuery({
    queryKey: ['task-thread', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const [c, e] = await Promise.all([
        supabase.from('task_comments')
          .select('*, author:profiles!task_comments_author_id_fkey(name)')
          .eq('task_id', taskId!).order('created_at', { ascending: true }),
        supabase.from('task_extension_requests')
          .select('*, requester:profiles!task_extension_requests_requested_by_fkey(name)')
          .eq('task_id', taskId!).order('created_at', { ascending: false }),
      ])
      if (c.error) throw c.error
      if (e.error) throw e.error
      return {
        comments: (c.data ?? []) as unknown as TaskComment[],
        extensions: (e.data ?? []) as unknown as TaskExtension[],
      }
    },
  })
}

export function useAddComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, body, me }: { taskId: string; body: string; me: string }) => {
      const { error } = await supabase.from('task_comments').insert({ task_id: taskId, author_id: me, body })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['task-thread', v.taskId] }),
  })
}

export function useRequestExtension() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, days, reason }: { taskId: string; days: number; reason: string }) => {
      const { error } = await (supabase.rpc as any)('request_task_extension', { p_task_id: taskId, p_days: days, p_reason: reason })
      if (error) throw error
      pokeAlerts()
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['task-thread', v.taskId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useDecideExtension() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, approve }: { requestId: string; approve: boolean; taskId: string }) => {
      const { error } = await (supabase.rpc as any)('decide_task_extension', { p_request_id: requestId, p_approve: approve })
      if (error) throw error
      pokeAlerts()
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['task-thread', v.taskId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
