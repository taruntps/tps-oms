// Sales — Service catalogue React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchServices,
  createService,
  updateService,
  type ServiceInput,
} from '../api/services'

const SERVICES_KEY = ['sales', 'services']

export function useServices() {
  return useQuery({ queryKey: SERVICES_KEY, queryFn: fetchServices, staleTime: 5 * 60_000 })
}

export function useCreateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ServiceInput) => createService(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SERVICES_KEY })
      toast.success('Service added')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}

export function useUpdateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ServiceInput }) => updateService(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SERVICES_KEY })
      toast.success('Service updated')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}
