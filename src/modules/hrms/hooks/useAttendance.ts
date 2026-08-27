// HRMS — Attendance (M2) React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import { supabase } from '@/lib/supabase'

// Fire-and-forget: push the just-created approval-request notifications out to
// WhatsApp/email now (the DB trigger already created the bell rows for approvers).
const kickNotify = () => { supabase.functions.invoke('notify-dispatch', { body: {} }).catch(() => {}) }
import {
  fetchMyAttendanceDays,
  fetchHrAttendanceDays,
  fetchAttendanceDaysRange,
  fetchHrAttendanceDaysRange,
  fetchMyRegularizations,
  fetchMyOutdoorDuty,
  fetchMyOvertime,
  createRegularization,
  createOutdoorDuty,
  createOvertime,
  fetchPendingApprovals,
  decideApproval,
  correctAttendanceDay,
  fetchAttendancePolicy,
  fetchEmployeePunches,
  fetchCorrectedDayKeys,
  adminAddPunch,
  adminEditPunch,
  adminDeletePunch,
  type RegularizationInput,
  type OutdoorDutyInput,
  type OvertimeInput,
  type DecisionInput,
  type HrDayCorrectionInput,
} from '../api/attendance'

const ATT = ['hrms', 'attendance'] as const

export function useAttendancePolicy(employeeId?: string | null) {
  return useQuery({
    queryKey: [...ATT, 'policy', employeeId ?? 'company'],
    queryFn: () => fetchAttendancePolicy(employeeId),
    staleTime: 5 * 60_000,
  })
}

// ── Self (My Attendance) ─────────────────────────────────────────────────────
export function useMyAttendanceDays(userId?: string, limit = 60) {
  return useQuery({
    queryKey: [...ATT, 'my-days', userId, limit],
    enabled: !!userId,
    queryFn: () => fetchMyAttendanceDays(userId!, limit),
  })
}

export function useMyHrDays(employeeId: string | undefined, fromDate: string, toDate: string) {
  return useQuery({
    queryKey: [...ATT, 'my-hr-days', employeeId, fromDate, toDate],
    enabled: !!employeeId,
    queryFn: () => fetchHrAttendanceDays(employeeId!, fromDate, toDate),
  })
}

export function useMyRegularizations(employeeId?: string) {
  return useQuery({
    queryKey: [...ATT, 'my-regs', employeeId],
    enabled: !!employeeId,
    queryFn: () => fetchMyRegularizations(employeeId!),
  })
}
export function useMyOutdoorDuty(employeeId?: string) {
  return useQuery({
    queryKey: [...ATT, 'my-od', employeeId],
    enabled: !!employeeId,
    queryFn: () => fetchMyOutdoorDuty(employeeId!),
  })
}
export function useMyOvertime(employeeId?: string) {
  return useQuery({
    queryKey: [...ATT, 'my-ot', employeeId],
    enabled: !!employeeId,
    queryFn: () => fetchMyOvertime(employeeId!),
  })
}

export function useCreateRegularization(employeeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RegularizationInput) => createRegularization(employeeId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...ATT, 'my-regs', employeeId] })
      kickNotify()
      toast.success('Regularization requested')
    },
    onError: (e: Error) => toast.error('Request failed', e.message),
  })
}
export function useCreateOutdoorDuty(employeeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: OutdoorDutyInput) => createOutdoorDuty(employeeId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...ATT, 'my-od', employeeId] })
      kickNotify()
      toast.success('Request submitted')
    },
    onError: (e: Error) => toast.error('Request failed', e.message),
  })
}
export function useCreateOvertime(employeeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: OvertimeInput) => createOvertime(employeeId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...ATT, 'my-ot', employeeId] })
      kickNotify()
      toast.success('Overtime requested')
    },
    onError: (e: Error) => toast.error('Request failed', e.message),
  })
}

// ── Team / muster ────────────────────────────────────────────────────────────
export function useAttendanceDaysRange(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: [...ATT, 'days-range', fromDate, toDate],
    queryFn: () => fetchAttendanceDaysRange(fromDate, toDate),
  })
}
export function useHrDaysRange(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: [...ATT, 'hr-days-range', fromDate, toDate],
    queryFn: () => fetchHrAttendanceDaysRange(fromDate, toDate),
  })
}

// ── Approvals ────────────────────────────────────────────────────────────────
export function usePendingApprovals() {
  return useQuery({
    queryKey: [...ATT, 'approvals'],
    queryFn: fetchPendingApprovals,
  })
}

export function useDecideApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: DecisionInput) => decideApproval(input),
    onSuccess: (_d, v) => {
      // Approving a regularization writes punches server-side → the day re-evaluates.
      // Refresh the whole HRMS tree (muster, calendar, eval, approvals) so it flips live.
      qc.invalidateQueries({ queryKey: ['hrms'] })
      toast.success(v.approve ? 'Approved' : 'Rejected')
    },
    onError: (e: Error) => toast.error('Decision failed', e.message),
  })
}

// ── HR correction ────────────────────────────────────────────────────────────
export function useCorrectAttendanceDay() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: HrDayCorrectionInput) => correctAttendanceDay(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...ATT, 'hr-days-range'] })
      qc.invalidateQueries({ queryKey: [...ATT, 'my-hr-days'] })
      toast.success('Attendance corrected')
    },
    onError: (e: Error) => toast.error('Correction failed', e.message),
  })
}

// ── Admin punch editing (raw In/Out timing) ───────────────────────────────────
/** Raw punches for one employee on a single day (for the correction editor). */
export function useEmployeeDayPunches(employeeId?: string, date?: string) {
  return useQuery({
    queryKey: [...ATT, 'day-punches', employeeId, date],
    enabled: !!employeeId && !!date,
    queryFn: () => fetchEmployeePunches(employeeId!, date!, date!),
  })
}

/** Keys (employee|date) with a recorded correction — drives the muster "edited" badge. */
export function useCorrectedDayKeys(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: [...ATT, 'corrected-keys', fromDate, toDate],
    queryFn: () => fetchCorrectedDayKeys(fromDate, toDate),
  })
}

/** Add / edit / delete a raw punch. All invalidate the attendance tree so the muster,
 *  calendar and (evaluate_attendance-backed) payroll views refresh. */
export function useAdminPunchEdit() {
  const qc = useQueryClient()
  const done = (msg: string) => { qc.invalidateQueries({ queryKey: ATT }); toast.success(msg) }
  const fail = (e: Error) => toast.error('Punch update failed', e.message)
  return {
    add: useMutation({
      mutationFn: (v: { employeeId: string; atISO: string; reason?: string | null }) => adminAddPunch(v.employeeId, v.atISO, v.reason),
      onSuccess: () => done('Punch added'), onError: fail,
    }),
    edit: useMutation({
      mutationFn: (v: { punchId: string; newTimeISO: string; reason?: string | null }) => adminEditPunch(v.punchId, v.newTimeISO, v.reason),
      onSuccess: () => done('Punch time updated'), onError: fail,
    }),
    remove: useMutation({
      mutationFn: (v: { punchId: string; reason?: string | null }) => adminDeletePunch(v.punchId, v.reason),
      onSuccess: () => done('Punch removed'), onError: fail,
    }),
  }
}
