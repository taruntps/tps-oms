// HRMS — generic child-table CRUD hooks + lifecycle events.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchChildRows,
  insertChildRow,
  updateChildRow,
  deleteChildRow,
  fetchStatusEvents,
  type ChildTable,
} from '../api/childTables'

const childKey = (table: ChildTable, employeeId: string) => ['hrms', 'child', table, employeeId]

export function useChildRows(table: ChildTable, employeeId: string) {
  return useQuery({
    queryKey: childKey(table, employeeId),
    queryFn: () => fetchChildRows(table, employeeId),
    enabled: !!employeeId,
  })
}

export function useChildMutations(table: ChildTable, employeeId: string) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: childKey(table, employeeId) })

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => insertChildRow(table, employeeId, payload),
    onSuccess: () => { invalidate(); toast.success('Added') },
    onError: (e: Error) => toast.error('Save failed', e.message),
  })
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateChildRow(table, id, payload),
    onSuccess: () => { invalidate(); toast.success('Updated') },
    onError: (e: Error) => toast.error('Save failed', e.message),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteChildRow(table, id),
    onSuccess: () => { invalidate(); toast.success('Removed') },
    onError: (e: Error) => toast.error('Delete failed', e.message),
  })

  return { create, update, remove }
}

export function useStatusEvents(employeeId: string) {
  return useQuery({
    queryKey: ['hrms', 'status_events', employeeId],
    queryFn: () => fetchStatusEvents(employeeId),
    enabled: !!employeeId,
  })
}
