// ── Role definitions ──────────────────────────────────────────────────────────
export type UserRole =
  | 'super_admin'
  | 'director'
  | 'manager'
  | 'executive'
  | 'accounts'
  | 'hr'
  | 'auditor'

export type ClockType = 'EMPLOYEE' | 'CLIENT' | 'AUTHORITY'
export type BlockType = 'CLIENT' | 'AUTHORITY'
export type BlockStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'LIFT_PENDING' | 'LIFTED'
export type StageStatus = 'PENDING' | 'IN_PROGRESS' | 'BLOCKED_CLIENT' | 'BLOCKED_AUTHORITY' | 'COMPLETED' | 'SKIPPED'
export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
export type LicenseStatus = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED'
export type LicenseType = 'STATE' | 'CENTRAL'
export type Category = 'MANUFACTURER' | 'TRADE_RETAIL' | 'RELABELLER'
export type CompanyType = 'PROPRIETOR' | 'PRIVATE_LIMITED' | 'PARTNERSHIP' | 'LLP' | 'OTHER'
export type AccountType = 'TRANSACTIONAL' | 'RETAINER'
export type PaymentStatus = 'ADVANCE_PENDING' | 'ADVANCE_RECEIVED' | 'PARTIAL' | 'FULL' | 'OVERDUE'
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

// ── Auth ─────────────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string
  name: string
  email: string
  role: UserRole
  is_active: boolean
  can_edit_clients: boolean
  department?: string
  phone?: string
  joining_date?: string
  created_at: string
}

// ── Role permission helpers ───────────────────────────────────────────────────
export const ROLES_WITH_PAYMENT_ACCESS: UserRole[] = ['super_admin', 'director', 'manager', 'accounts']
export const ROLES_WHO_CAN_CLOSE: UserRole[] = ['super_admin', 'director', 'manager']
export const ROLES_WITH_CREDENTIAL_ACCESS: UserRole[] = ['super_admin', 'director', 'manager']
export const ROLES_WHO_CAN_ASSIGN: UserRole[] = ['super_admin', 'director', 'manager']
export const ROLES_WHO_CAN_APPROVE_BLOCKS: UserRole[] = ['super_admin', 'director', 'manager']

// ── Timeline ─────────────────────────────────────────────────────────────────
export interface TimelineStage {
  id: string
  stage_number: number
  stage_name: string
  status: StageStatus
  current_clock: ClockType
  clock_switched_at: string
  employee_minutes: number
  client_minutes: number
  authority_minutes: number
  started_at: string
  completed_at: string | null
  completed_by_name?: string
  notes?: string
  // Live-calculated
  live_employee_minutes?: number
  live_client_minutes?: number
  live_authority_minutes?: number
  total_minutes?: number
}

export interface ProjectTimeline {
  stages: TimelineStage[]
  total_minutes: number
  total_employee_minutes: number
  total_client_minutes: number
  total_authority_minutes: number
}

// ── Notification ─────────────────────────────────────────────────────────────
export type NotificationType =
  | 'TASK_ASSIGNED' | 'STAGE_OVERDUE' | 'BLOCK_REQUEST'
  | 'BLOCK_APPROVED' | 'BLOCK_REJECTED' | 'BLOCK_LIFT_REQUEST'
  | 'DOCUMENT_PENDING' | 'PAYMENT_OUTSTANDING'
  | 'LICENSE_EXPIRY_90' | 'LICENSE_EXPIRY_60' | 'LICENSE_EXPIRY_30'
  | 'ANNUAL_RETURN_REMINDER' | 'QUERY_RECEIVED' | 'PROJECT_CLOSED'
