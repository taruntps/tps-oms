// HRMS — Leave/attendance configuration React Query hooks (M3).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchAllLeaveTypes,
  upsertLeaveType,
  deactivateLeaveType,
  fetchHolidays,
  fetchRestrictedHolidays,
  upsertHoliday,
  deactivateHoliday,
  fetchAttendanceStatuses,
  upsertAttendanceStatus,
  deactivateAttendanceStatus,
  fetchDayTypes,
  upsertDayType,
  deactivateDayType,
  type LeaveTypeInput,
  type HolidayInput,
  type AttendanceStatusInput,
  type DayTypeInput,
} from '../api/leaveConfig'

const CFG = ['hrms', 'leave-config'] as const
const LEAVE_TYPES_KEY = [...CFG, 'leave-types']
const HOLIDAYS_KEY = [...CFG, 'holidays']
const STATUSES_KEY = [...CFG, 'attendance-statuses']
const DAY_TYPES_KEY = [...CFG, 'day-types']

// ── Leave types ────────────────────────────────────────────────────────────────
export function useAllLeaveTypes() {
  return useQuery({ queryKey: LEAVE_TYPES_KEY, queryFn: fetchAllLeaveTypes, staleTime: 60_000 })
}

export function useUpsertLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LeaveTypeInput & { id?: string }) => upsertLeaveType(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: LEAVE_TYPES_KEY })
      qc.invalidateQueries({ queryKey: ['hrms', 'leave', 'types'] })
      toast.success(v.id ? 'Leave type updated' : 'Leave type added')
    },
    onError: (e: Error) => toast.error('Save failed', e.message),
  })
}

export function useDeactivateLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deactivateLeaveType(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LEAVE_TYPES_KEY })
      qc.invalidateQueries({ queryKey: ['hrms', 'leave', 'types'] })
      toast.success('Leave type deactivated')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}

// ── Holidays ────────────────────────────────────────────────────────────────────
export function useHolidays(year?: number | null) {
  return useQuery({
    queryKey: [...HOLIDAYS_KEY, year ?? 'all'],
    queryFn: () => fetchHolidays(year),
    staleTime: 60_000,
  })
}

export function useRestrictedHolidays(year: number) {
  return useQuery({
    queryKey: [...HOLIDAYS_KEY, 'restricted', year],
    queryFn: () => fetchRestrictedHolidays(year),
    staleTime: 60_000,
  })
}

export function useUpsertHoliday() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: HolidayInput & { id?: string }) => upsertHoliday(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: HOLIDAYS_KEY })
      toast.success(v.id ? 'Holiday updated' : 'Holiday added')
    },
    onError: (e: Error) => toast.error('Save failed', e.message),
  })
}

export function useDeactivateHoliday() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deactivateHoliday(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOLIDAYS_KEY })
      toast.success('Holiday deactivated')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}

// ── Attendance status master ──────────────────────────────────────────────────────
export function useAttendanceStatuses() {
  return useQuery({ queryKey: STATUSES_KEY, queryFn: fetchAttendanceStatuses, staleTime: 60_000 })
}

export function useUpsertAttendanceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AttendanceStatusInput & { id?: string }) => upsertAttendanceStatus(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: STATUSES_KEY })
      toast.success(v.id ? 'Status updated' : 'Status added')
    },
    onError: (e: Error) => toast.error('Save failed', e.message),
  })
}

export function useDeactivateAttendanceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deactivateAttendanceStatus(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STATUSES_KEY })
      toast.success('Status deactivated')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}

// ── Day type master ────────────────────────────────────────────────────────────────
export function useDayTypes() {
  return useQuery({ queryKey: DAY_TYPES_KEY, queryFn: fetchDayTypes, staleTime: 60_000 })
}

export function useUpsertDayType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: DayTypeInput & { id?: string }) => upsertDayType(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: DAY_TYPES_KEY })
      toast.success(v.id ? 'Day type updated' : 'Day type added')
    },
    onError: (e: Error) => toast.error('Save failed', e.message),
  })
}

export function useDeactivateDayType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deactivateDayType(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DAY_TYPES_KEY })
      toast.success('Day type deactivated')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}
