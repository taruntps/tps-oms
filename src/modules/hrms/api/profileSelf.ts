// HRMS — Employee self-service profile change requests (migration 104).
// Employee submits a JSONB payload (personal / emergency / bank / statutory);
// admin approves via review_profile_change, which writes to the real tables.
// The 104 table/RPCs aren't in the generated Database types, so `supabase` is cast.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export interface PersonalDetails {
  date_of_birth: string; gender: string; marital_status: string; blood_group: string
  nationality: string; permanent_address: string; local_address: string
  personal_email: string; home_phone: string; father_name: string; mother_name: string
}
export interface EmergencyDetails { name: string; relation: string; phone: string }
export interface BankDetails { account_name: string; account_no: string; ifsc: string; bank_name: string; branch: string }
export interface StatutoryDetails { pan_no: string; aadhar_no: string; uan: string; esi_no: string; pf_no: string; pran: string }

export interface ProfilePayload {
  personal: PersonalDetails
  emergency: EmergencyDetails
  bank: BankDetails
  statutory: StatutoryDetails
}

export type RequestStatus = 'pending' | 'approved' | 'rejected'
export interface ProfileChangeRequest {
  id: string
  employee_id: string
  payload: ProfilePayload
  status: RequestStatus
  note: string | null
  submitted_at: string
  reviewed_at: string | null
  profiles?: { name: string | null; employee_code: string | null } | null
}

const s = (v: unknown) => (v == null ? '' : String(v))

export const emptyPayload = (): ProfilePayload => ({
  personal: { date_of_birth: '', gender: '', marital_status: '', blood_group: '', nationality: '',
    permanent_address: '', local_address: '', personal_email: '', home_phone: '', father_name: '', mother_name: '' },
  emergency: { name: '', relation: '', phone: '' },
  bank: { account_name: '', account_no: '', ifsc: '', bank_name: '', branch: '' },
  statutory: { pan_no: '', aadhar_no: '', uan: '', esi_no: '', pf_no: '', pran: '' },
})

/** Assemble the current on-file values for an employee (used to pre-fill the form). */
export async function fetchProfileCurrent(userId: string): Promise<ProfilePayload> {
  const p = emptyPayload()
  const [ed, emg, bank, stat] = await Promise.all([
    db.from('employee_details').select('*').eq('user_id', userId).maybeSingle(),
    db.from('hr_emergency_contacts').select('*').eq('employee_id', userId).eq('is_primary', true).maybeSingle(),
    db.from('hr_employee_bank').select('*').eq('employee_id', userId).eq('is_primary', true).maybeSingle(),
    db.from('hr_employee_statutory_ids').select('*').eq('employee_id', userId).maybeSingle(),
  ])
  const d = ed.data
  if (d) p.personal = {
    date_of_birth: s(d.date_of_birth), gender: s(d.gender), marital_status: s(d.marital_status),
    blood_group: s(d.blood_group), nationality: s(d.nationality), permanent_address: s(d.permanent_address),
    local_address: s(d.local_address), personal_email: s(d.personal_email), home_phone: s(d.home_phone),
    father_name: s(d.father_name), mother_name: s(d.mother_name),
  }
  if (emg.data) p.emergency = { name: s(emg.data.name), relation: s(emg.data.relation), phone: s(emg.data.phone) }
  if (bank.data) p.bank = { account_name: s(bank.data.account_name), account_no: s(bank.data.account_no),
    ifsc: s(bank.data.ifsc), bank_name: s(bank.data.bank_name), branch: s(bank.data.branch) }
  p.statutory.pan_no = s(d?.pan_no)
  p.statutory.aadhar_no = s(d?.aadhar_no)
  if (stat.data) { p.statutory.uan = s(stat.data.uan); p.statutory.esi_no = s(stat.data.esi_no)
    p.statutory.pf_no = s(stat.data.pf_no); p.statutory.pran = s(stat.data.pran) }
  return p
}

/** The employee's most recent request (null if they've never submitted). */
export async function fetchMyLatestRequest(userId: string): Promise<ProfileChangeRequest | null> {
  const { data, error } = await db.from('hr_profile_change_requests')
    .select('*').eq('employee_id', userId).order('submitted_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return (data as ProfileChangeRequest) ?? null
}

export async function submitProfileChange(payload: ProfilePayload): Promise<string> {
  const { data, error } = await db.rpc('submit_profile_change', { p_payload: payload })
  if (error) throw error
  return data as string
}

/** Admin — all pending submissions with the employee's name/code. */
export async function fetchPendingRequests(): Promise<ProfileChangeRequest[]> {
  const { data, error } = await db.from('hr_profile_change_requests')
    .select('*, profiles:employee_id(name, employee_code)')
    .eq('status', 'pending').order('submitted_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as ProfileChangeRequest[]
}

export async function reviewProfileChange(id: string, approve: boolean, note?: string | null): Promise<void> {
  const { error } = await db.rpc('review_profile_change', { p_id: id, p_approve: approve, p_note: note ?? null })
  if (error) throw error
}
