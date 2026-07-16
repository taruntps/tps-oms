// Documents module — data access for `document_templates` (migration 079).
// Not yet in the generated Database types, so the client is cast to `any`
// (same pattern as other post-migration hooks).
import { supabase } from '@/lib/supabase'

export interface DocumentTemplate {
  id: string
  name: string
  category: string | null
  body: string | null
  merge_fields: unknown | null
  created_by: string | null
  created_at: string
  updated_at?: string | null
}

export interface TemplateInput {
  name: string
  category?: string | null
  body?: string | null
  merge_fields?: unknown | null
}

export async function fetchTemplates(): Promise<DocumentTemplate[]> {
  const { data, error } = await (supabase as any)
    .from('document_templates')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DocumentTemplate[]
}

export async function createTemplate(input: TemplateInput, createdBy?: string | null): Promise<DocumentTemplate> {
  const { data, error } = await (supabase as any)
    .from('document_templates')
    .insert({
      name:         input.name,
      category:     input.category ?? null,
      body:         input.body ?? null,
      merge_fields: input.merge_fields ?? null,
      created_by:   createdBy ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as DocumentTemplate
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<DocumentTemplate> {
  const { data, error } = await (supabase as any)
    .from('document_templates')
    .update({
      name:         input.name,
      category:     input.category ?? null,
      body:         input.body ?? null,
      merge_fields: input.merge_fields ?? null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as DocumentTemplate
}
