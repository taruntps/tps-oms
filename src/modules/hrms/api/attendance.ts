// HRMS — Attendance (M2) data access.
// Reuses the immutable punch tables (attendance_punches raw / attendance_days VIEW rollup)
// read-only, and the HR-evaluated records in hr_attendance_days + the request tables
// (regularizations / OD-WFH / overtime / corrections). Migration 089 tables aren't in the
// generated Database types yet, so `from(...)`/`rpc(...)` are cast to `any`.
import { supabase } from '@/lib/supabase'

const db = supabase as any

// ── Punch-derived rollup (read-only VIEW) ────────────────────────────────────
export interface AttendanceDay {
  user_id: string | null
  work_date: string | null
  first_in: string | null
  last_out: string | null
  punch_count: number | null
  worked_minutes: number | null
}

// ── HR-evaluated daily record ────────────────────────────────────────────────
export type AttendanceStatus =
  | 'present' | 'absent' | 'half_day' | 'on_leave' | 'holiday'
  | 'weekly_off' | 'od' | 'wfh' | 'pending'

export interface HrAttendanceDay {
  id: string
  employee_id: string
  work_date: string
  shift_id: string | null
  day_type: string | null
  status: AttendanceStatus | null
  first_in: string | null
  last_out: string | null
  worked_minutes: number | null
  late_minutes: number
  early_out_minutes: number
  ot_minutes: number
  is_regularized: boolean
  remarks: string | null
}

// ── Request tables ───────────────────────────────────────────────────────────
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface Regularization {
  id: string
  employee_id: string
  work_date: string
  kind: 'missed_punch' | 'wrong_punch' | 'forgot' | 'other'
  requested_in: string | null
  requested_out: string | null
  reason: string | null
  status: RequestStatus
  approver_id: string | null
  decided_at: string | null
  decision_note: string | null
}
export interface RegularizationInput {
  work_date: string
  kind: Regularization['kind']
  requested_in?: string | null
  requested_out?: string | null
  reason?: string | null
}

export interface OutdoorDuty {
  id: string
  employee_id: string
  mode: 'od' | 'wfh'
  from_date: string
  to_date: string
  purpose: string | null
  location: string | null
  status: RequestStatus
  approver_id: string | null
  decided_at: string | null
}
export interface OutdoorDutyInput {
  mode: 'od' | 'wfh'
  from_date: string
  to_date: string
  purpose?: string | null
  location?: string | null
}

export interface Overtime {
  id: string
  employee_id: string
  work_date: string
  minutes: number
  reason: string | null
  status: RequestStatus
  compensation: 'paid' | 'comp_off' | null
  approver_id: string | null
  decided_at: string | null
}
export interface OvertimeInput {
  work_date: string
  minutes: number
  reason?: string | null
  compensation?: 'paid' | 'comp_off' | null
}

export interface CorrectionInput {
  employee_id: string
  work_date: string
  field: string
  old_value?: string | null
  new_value?: string | null
  reason?: string | null
}

// ── Policy helper (never hardcode rules; resolve via get_hr_policy) ───────────
/** Resolve a single HR policy value (most-specific-wins) for an employee (or company default). */
export async function fetchHrPolicy(key: string, employeeId?: string | null): Promise<unknown> {
  const { data, error } = await db.rpc('get_hr_policy', {
    p_key: key,
    p_employee_id: employeeId ?? null,
  })
  if (error) throw error
  return data ?? null
}

const ATTENDANCE_POLICY_KEYS = [
  'attendance.late_to_halfday',
  'attendance.regularization_cap',
  'attendance.awol_alert_days',
  'attendance.ot_enabled',
  'attendance.wfh_enabled',
  'attendance.od_enabled',
] as const

export type AttendancePolicy = Record<string, unknown>

/** Resolve all attendance policy keys at once (for the current employee, or company defaults). */
export async function fetchAttendancePolicy(employeeId?: string | null): Promise<AttendancePolicy> {
  const entries = await Promise.all(
    ATTENDANCE_POLICY_KEYS.map(async k => [k, await fetchHrPolicy(k, employeeId)] as const),
  )
  return Object.fromEntries(entries)
}

// ── Effective shift resolver ─────────────────────────────────────────────────
export async function fetchEffectiveShift(employeeId: string, date: string): Promise<string | null> {
  const { data, error } = await db.rpc('get_effective_shift', {
    p_employee_id: employeeId,
    p_date: date,
  })
  if (error) throw error
  return (data as string) ?? null
}

// ── Self (My Attendance) ─────────────────────────────────────────────────────
/** Punch-derived days for one user (most recent first). */
export async function fetchMyAttendanceDays(userId: string, limit = 60): Promise<AttendanceDay[]> {
  const { data, error } = await db
    .from('attendance_days')
    .select('*')
    .eq('user_id', userId)
    .order('work_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AttendanceDay[]
}

// ── Rule-based evaluation (migration 106) ────────────────────────────────────
export interface EvaluatedDay {
  work_date: string
  status: string
  first_in: string | null
  last_out: string | null
  worked_minutes: number | null
  late_minutes: number
  early_minutes: number
  penalty: string | null
  worked_units: number
  lop_units: number
  covered: string | null
}

/** Per-day computed status/units for one employee over a range (in/out, late, half, LOP). */
export async function fetchAttendanceEvaluation(
  employeeId: string,
  fromDate: string,
  toDate: string,
): Promise<EvaluatedDay[]> {
  const { data, error } = await db.rpc('evaluate_attendance', {
    p_employee: employeeId, p_from: fromDate, p_to: toDate,
  })
  if (error) throw error
  return (data ?? []) as EvaluatedDay[]
}

export interface RawPunch { id: string; punch_at: string; within_fence: boolean; is_field: boolean }

/** Every raw punch for one employee across a date range (IST day bounds). */
export async function fetchEmployeePunches(
  employeeId: string,
  fromDate: string,
  toDate: string,
): Promise<RawPunch[]> {
  const { data, error } = await db
    .from('attendance_punches')
    .select('id, punch_at, within_fence, is_field')
    .eq('user_id', employeeId)
    .gte('punch_at', `${fromDate}T00:00:00+05:30`)
    .lte('punch_at', `${toDate}T23:59:59+05:30`)
    .order('punch_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as RawPunch[]
}

/** Punch-derived days for one employee within a date range (RLS scopes to self/admin). */
export async function fetchEmployeeAttendanceDays(
  employeeId: string,
  fromDate: string,
  toDate: string,
): Promise<AttendanceDay[]> {
  const { data, error } = await db
    .from('attendance_days')
    .select('*')
    .eq('user_id', employeeId)
    .gte('work_date', fromDate)
    .lte('work_date', toDate)
  if (error) throw error
  return (data ?? []) as AttendanceDay[]
}

/** HR-evaluated daily records for one employee within a date range. */
export async function fetchHrAttendanceDays(
  employeeId: string,
  fromDate: string,
  toDate: string,
): Promise<HrAttendanceDay[]> {
  const { data, error } = await db
    .from('hr_attendance_days')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('work_date', fromDate)
    .lte('work_date', toDate)
    .order('work_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as HrAttendanceDay[]
}

// ── Team / muster ────────────────────────────────────────────────────────────
export interface MusterProfile {
  id: string
  name: string | null
  employee_code: string | null
  department_id: string | null
}

/** All punch-derived days across employees within a range (RLS scopes to what caller may see). */
export async function fetchAttendanceDaysRange(
  fromDate: string,
  toDate: string,
): Promise<AttendanceDay[]> {
  const { data, error } = await db
    .from('attendance_days')
    .select('*')
    .gte('work_date', fromDate)
    .lte('work_date', toDate)
  if (error) throw error
  return (data ?? []) as AttendanceDay[]
}

/** All HR-evaluated days across employees within a range. */
export async function fetchHrAttendanceDaysRange(
  fromDate: string,
  toDate: string,
): Promise<HrAttendanceDay[]> {
  const { data, error } = await db
    .from('hr_attendance_days')
    .select('*')
    .gte('work_date', fromDate)
    .lte('work_date', toDate)
  if (error) throw error
  return (data ?? []) as HrAttendanceDay[]
}

// ── Requests: self reads + create ────────────────────────────────────────────
export async function fetchMyRegularizations(employeeId: string): Promise<Regularization[]> {
  const { data, error } = await db
    .from('hr_attendance_regularizations')
    .select('*')
    .eq('employee_id', employeeId)
    .order('work_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as Regularization[]
}
export async function fetchMyOutdoorDuty(employeeId: string): Promise<OutdoorDuty[]> {
  const { data, error } = await db
    .from('hr_outdoor_duty')
    .select('*')
    .eq('employee_id', employeeId)
    .order('from_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as OutdoorDuty[]
}
export async function fetchMyOvertime(employeeId: string): Promise<Overtime[]> {
  const { data, error } = await db
    .from('hr_overtime')
    .select('*')
    .eq('employee_id', employeeId)
    .order('work_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as Overtime[]
}

export async function createRegularization(employeeId: string, input: RegularizationInput): Promise<void> {
  const { error } = await db.from('hr_attendance_regularizations').insert({
    employee_id: employeeId,
    created_by: employeeId,
    ...input,
  })
  if (error) throw error
}
export async function createOutdoorDuty(employeeId: string, input: OutdoorDutyInput): Promise<void> {
  const { error } = await db.from('hr_outdoor_duty').insert({
    employee_id: employeeId,
    created_by: employeeId,
    ...input,
  })
  if (error) throw error
}
export async function createOvertime(employeeId: string, input: OvertimeInput): Promise<void> {
  const { error } = await db.from('hr_overtime').insert({
    employee_id: employeeId,
    created_by: employeeId,
    ...input,
  })
  if (error) throw error
}

// ── Approvals queue ──────────────────────────────────────────────────────────
export type ApprovalKind = 'regularization' | 'od' | 'overtime'

export interface ApprovalItem {
  id: string
  kind: ApprovalKind
  employee_id: string
  /** Human label for the primary date (single day or range). */
  when: string
  /** Short description of what's being requested. */
  detail: string
  reason: string | null
  status: RequestStatus
  /** work_date used to sync hr_attendance_days on regularization approval. */
  work_date: string | null
}

/** Pending regularizations + OD/WFH + OT unified into one approver queue. */
export async function fetchPendingApprovals(): Promise<ApprovalItem[]> {
  const [regs, ods, ots] = await Promise.all([
    db.from('hr_attendance_regularizations').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
    db.from('hr_outdoor_duty').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
    db.from('hr_overtime').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
  ])
  if (regs.error) throw regs.error
  if (ods.error) throw ods.error
  if (ots.error) throw ots.error

  const items: ApprovalItem[] = []
  for (const r of (regs.data ?? []) as Regularization[]) {
    items.push({
      id: r.id, kind: 'regularization', employee_id: r.employee_id, when: r.work_date,
      detail: `Regularization · ${r.kind.replace('_', ' ')}`, reason: r.reason, status: r.status, work_date: r.work_date,
    })
  }
  for (const o of (ods.data ?? []) as OutdoorDuty[]) {
    items.push({
      id: o.id, kind: 'od', employee_id: o.employee_id,
      when: o.from_date === o.to_date ? o.from_date : `${o.from_date} → ${o.to_date}`,
      detail: `${o.mode.toUpperCase()}${o.location ? ` · ${o.location}` : ''}`, reason: o.purpose, status: o.status, work_date: o.from_date,
    })
  }
  for (const t of (ots.data ?? []) as Overtime[]) {
    items.push({
      id: t.id, kind: 'overtime', employee_id: t.employee_id, when: t.work_date,
      detail: `Overtime · ${t.minutes} min${t.compensation ? ` · ${t.compensation}` : ''}`, reason: t.reason, status: t.status, work_date: t.work_date,
    })
  }
  return items
}

const KIND_TABLE: Record<ApprovalKind, string> = {
  regularization: 'hr_attendance_regularizations',
  od: 'hr_outdoor_duty',
  overtime: 'hr_overtime',
}

export interface DecisionInput {
  kind: ApprovalKind
  id: string
  approve: boolean
  approverId: string
  note?: string | null
  /** For regularizations: the employee + work_date to flag hr_attendance_days.is_regularized. */
  employeeId?: string
  workDate?: string | null
}

/** Set status/approver/decided_at (+ note where the table has one). On approving a
 *  regularization, best-effort flag the matching hr_attendance_days row as regularized. */
export async function decideApproval(input: DecisionInput): Promise<void> {
  const table = KIND_TABLE[input.kind]
  const patch: Record<string, unknown> = {
    status: input.approve ? 'approved' : 'rejected',
    approver_id: input.approverId,
    decided_at: new Date().toISOString(),
  }
  // Only the regularizations table carries a decision_note column.
  if (input.kind === 'regularization') patch.decision_note = input.note ?? null

  const { error } = await db.from(table).update(patch).eq('id', input.id)
  if (error) throw error

  if (input.approve && input.kind === 'regularization' && input.employeeId && input.workDate) {
    // Best-effort: mark the evaluated day regularized (upsert by employee_id + work_date).
    const { error: upErr } = await db
      .from('hr_attendance_days')
      .upsert(
        { employee_id: input.employeeId, work_date: input.workDate, is_regularized: true },
        { onConflict: 'employee_id,work_date' },
      )
    if (upErr) throw upErr
  }
}

// ── HR correction (writes audit row + updates evaluated day) ──────────────────
export interface HrDayCorrectionInput {
  employeeId: string
  workDate: string
  /** Field being corrected (e.g. 'status', 'first_in', 'remarks'). */
  field: string
  oldValue?: string | null
  newValue?: string | null
  reason?: string | null
  /** Patch applied to hr_attendance_days for this employee+day. */
  patch: Record<string, unknown>
  correctedBy: string
}

export async function correctAttendanceDay(input: HrDayCorrectionInput): Promise<void> {
  const { error: cErr } = await db.from('hr_attendance_corrections').insert({
    employee_id: input.employeeId,
    work_date: input.workDate,
    field: input.field,
    old_value: input.oldValue ?? null,
    new_value: input.newValue ?? null,
    reason: input.reason ?? null,
    corrected_by: input.correctedBy,
  })
  if (cErr) throw cErr

  const { error: uErr } = await db
    .from('hr_attendance_days')
    .upsert(
      { employee_id: input.employeeId, work_date: input.workDate, ...input.patch },
      { onConflict: 'employee_id,work_date' },
    )
  if (uErr) throw uErr
}

// ── Admin punch corrections (raw In/Out timing) ───────────────────────────────
// These call SECURITY DEFINER RPCs (migration admin_punch_corrections) that role-gate
// to super_admin/director/hr and write an audit row. evaluate_attendance recomputes
// status/late/half from the punches, so payroll follows automatically.

/** Build an IST timestamptz ISO string from a work date + "HH:MM" clock time. */
export function istTimestamp(workDate: string, hhmm: string): string {
  return new Date(`${workDate}T${hhmm}:00+05:30`).toISOString()
}

export async function adminAddPunch(employeeId: string, atISO: string, reason?: string | null): Promise<void> {
  const { error } = await db.rpc('admin_add_punch', { p_employee: employeeId, p_at: atISO, p_reason: reason ?? null })
  if (error) throw error
}
export async function adminEditPunch(punchId: string, newTimeISO: string, reason?: string | null): Promise<void> {
  const { error } = await db.rpc('admin_edit_punch', { p_punch_id: punchId, p_new_time: newTimeISO, p_reason: reason ?? null })
  if (error) throw error
}
export async function adminDeletePunch(punchId: string, reason?: string | null): Promise<void> {
  const { error } = await db.rpc('admin_delete_punch', { p_punch_id: punchId, p_reason: reason ?? null })
  if (error) throw error
}

/** employee_id|work_date keys that have at least one correction (for an "edited" badge). */
export async function fetchCorrectedDayKeys(fromDate: string, toDate: string): Promise<string[]> {
  const { data, error } = await db
    .from('hr_attendance_corrections')
    .select('employee_id, work_date')
    .gte('work_date', fromDate)
    .lte('work_date', toDate)
  if (error) throw error
  return (data ?? []).map((r: { employee_id: string; work_date: string }) => `${r.employee_id}|${r.work_date}`)
}
