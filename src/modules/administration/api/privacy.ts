// Administration — Privacy / DPDP data access (thin supabase wrappers).
// Tables: consent_records, data_subject_requests (migration 078). Not in the generated
// Database types yet, so the client is cast to `any` (same pattern as useStageDocuments).
import { supabase } from '@/lib/supabase'

const db = supabase as any

export interface ConsentRecord {
  id: string
  subject_type: string
  subject_id: string | null
  purpose: string
  basis: string
  granted: boolean
  granted_at: string | null
  revoked_at: string | null
}

export interface DataSubjectRequest {
  id: string
  subject_type: string
  subject_id: string | null
  kind: string          // access | erasure | rectification | portability
  status: string        // open | in_progress | fulfilled | rejected
  detail: string | null
  requested_at: string | null
}

export interface NewDsrInput {
  subject_type: string
  subject_id?: string | null
  kind: string
  detail?: string
}

export async function fetchConsentRecords(): Promise<ConsentRecord[]> {
  const { data, error } = await db
    .from('consent_records')
    .select('id, subject_type, subject_id, purpose, basis, granted, granted_at, revoked_at')
    .order('granted_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as ConsentRecord[]
}

export async function fetchDataSubjectRequests(): Promise<DataSubjectRequest[]> {
  const { data, error } = await db
    .from('data_subject_requests')
    .select('id, subject_type, subject_id, kind, status, detail, requested_at')
    .order('requested_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as DataSubjectRequest[]
}

export async function createDataSubjectRequest(input: NewDsrInput): Promise<void> {
  const { error } = await db.from('data_subject_requests').insert({
    subject_type: input.subject_type,
    subject_id: input.subject_id || null,
    kind: input.kind,
    detail: input.detail || null,
    status: 'open',
  })
  if (error) throw error
}
