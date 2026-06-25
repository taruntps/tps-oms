import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type Task = Tables<'tasks'>
export type TaskStatus   = Task['status']
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
        .order('status', { ascending: true })          // open first
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
