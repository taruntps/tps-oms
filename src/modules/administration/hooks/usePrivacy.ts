// Administration — Privacy / DPDP React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  createDataSubjectRequest,
  fetchConsentRecords,
  fetchDataSubjectRequests,
  type NewDsrInput,
} from '../api/privacy'

const CONSENT_KEY = ['admin', 'consent-records']
const DSR_KEY = ['admin', 'data-subject-requests']

export function useConsentRecords() {
  return useQuery({ queryKey: CONSENT_KEY, queryFn: fetchConsentRecords })
}

export function useDataSubjectRequests() {
  return useQuery({ queryKey: DSR_KEY, queryFn: fetchDataSubjectRequests })
}

export function useCreateDsr() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewDsrInput) => createDataSubjectRequest(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DSR_KEY })
      toast.success('Request logged')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}
