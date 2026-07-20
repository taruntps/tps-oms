// CRM — activity timeline data access.
// Table `crm_activities` (migration 082) is not in the generated Database types
// yet, so we cast `from(...)` to `any`.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type ActivityEntity = 'lead' | 'client'
export type ActivityType = 'call' | 'email' | 'meeting' | 'whatsapp' | 'note' | 'task'

export interface Activity {
  id: string
  entity_type: ActivityEntity
  entity_id: string
  type: ActivityType
  subject: string | null
  body: string | null
  activity_at: string
  created_by: string | null
}

export interface ActivityInput {
  entity_type: ActivityEntity
  entity_id: string
  type: ActivityType
  subject?: string | null
  body?: string | null
  activity_at?: string
}

export async function fetchActivities(entityType: ActivityEntity, entityId: string): Promise<Activity[]> {
  const { data, error } = await db
    .from('crm_activities')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('activity_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Activity[]
}

export async function logActivity(input: ActivityInput, createdBy?: string): Promise<Activity> {
  const payload = {
    activity_at: new Date().toISOString(),
    ...input,
    created_by: createdBy ?? null,
  }
  const { data, error } = await db.from('crm_activities').insert(payload).select().single()
  if (error) throw error
  return data as Activity
}
