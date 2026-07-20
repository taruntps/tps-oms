// CRM — leads React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchLeads,
  fetchLead,
  createLead,
  updateLead,
  moveLeadStage,
  convertLeadToClient,
  type Lead,
  type LeadInput,
} from '../api/leads'
import { fetchStages } from '../api/stages'
import { fetchProfiles } from '../api/profiles'

const LEADS_KEY = ['crm', 'leads']
const STAGES_KEY = ['crm', 'stages']
const PROFILES_KEY = ['crm', 'profiles']

export function useStages() {
  return useQuery({ queryKey: STAGES_KEY, queryFn: fetchStages, staleTime: 10 * 60_000 })
}

export function useCrmProfiles() {
  return useQuery({ queryKey: PROFILES_KEY, queryFn: fetchProfiles, staleTime: 10 * 60_000 })
}

export function useLeads() {
  return useQuery({ queryKey: LEADS_KEY, queryFn: fetchLeads })
}

export function useLead(id: string) {
  return useQuery({ queryKey: [...LEADS_KEY, id], queryFn: () => fetchLead(id), enabled: !!id })
}

export function useCreateLead() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: (input: LeadInput) => createLead(input, profile?.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LEADS_KEY })
      toast.success('Lead created')
    },
    onError: (e: Error) => toast.error('Failed to create lead', e.message),
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<LeadInput> & { id: string }) => updateLead(id, input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: LEADS_KEY })
      qc.invalidateQueries({ queryKey: [...LEADS_KEY, v.id] })
      toast.success('Lead updated')
    },
    onError: (e: Error) => toast.error('Failed to update lead', e.message),
  })
}

export function useMoveLeadStage() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: (args: { lead: Lead; toStage: string; isWon: boolean; isLost: boolean }) =>
      moveLeadStage({ ...args, changedBy: profile?.id }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: LEADS_KEY })
      qc.invalidateQueries({ queryKey: [...LEADS_KEY, v.lead.id] })
    },
    onError: (e: Error) => toast.error('Failed to move lead', e.message),
  })
}

export function useConvertLead() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: (lead: Lead) => convertLeadToClient(lead, profile?.id),
    onSuccess: (_d, lead) => {
      qc.invalidateQueries({ queryKey: LEADS_KEY })
      qc.invalidateQueries({ queryKey: [...LEADS_KEY, lead.id] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Lead converted to client')
    },
    onError: (e: Error) => toast.error('Failed to convert lead', e.message),
  })
}
