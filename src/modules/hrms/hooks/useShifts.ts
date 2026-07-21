// HRMS — Attendance (M2): shift + allocation React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchShifts,
  upsertShift,
  deactivateShift,
  fetchShiftAllocations,
  createShiftAllocation,
  deleteShiftAllocation,
  type ShiftInput,
  type ShiftAllocationInput,
} from '../api/shifts'

const SHIFTS_KEY = ['hrms', 'shifts'] as const
const ALLOCS_KEY = ['hrms', 'shift_allocations'] as const

export function useShifts() {
  return useQuery({ queryKey: SHIFTS_KEY, queryFn: fetchShifts, staleTime: 5 * 60_000 })
}

export function useUpsertShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ShiftInput & { id?: string }) => upsertShift(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: SHIFTS_KEY })
      toast.success(v.id ? 'Shift updated' : 'Shift added')
    },
    onError: (e: Error) => toast.error('Save failed', e.message),
  })
}

export function useDeactivateShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deactivateShift(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SHIFTS_KEY })
      toast.success('Shift deactivated')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}

export function useShiftAllocations() {
  return useQuery({ queryKey: ALLOCS_KEY, queryFn: fetchShiftAllocations })
}

export function useCreateShiftAllocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ShiftAllocationInput) => createShiftAllocation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ALLOCS_KEY })
      toast.success('Shift allocated')
    },
    onError: (e: Error) => toast.error('Allocation failed', e.message),
  })
}

export function useDeleteShiftAllocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteShiftAllocation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ALLOCS_KEY })
      toast.success('Allocation removed')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}
