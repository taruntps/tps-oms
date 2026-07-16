// Documents module — React Query hooks for `document_templates`.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchTemplates,
  createTemplate,
  updateTemplate,
  type DocumentTemplate,
  type TemplateInput,
} from '../api/templates'

export type { DocumentTemplate, TemplateInput }

const KEY = ['document-templates']

export function useTemplates() {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchTemplates,
    staleTime: 60_000,
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ input, createdBy }: { input: TemplateInput; createdBy?: string | null }) =>
      createTemplate(input, createdBy),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TemplateInput }) => updateTemplate(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
