// Finance — dashboard summary hook.
import { useQuery } from '@tanstack/react-query'
import { fetchFinanceSummary } from '../api/dashboard'

export function useFinanceSummary() {
  return useQuery({
    queryKey: ['finance', 'summary'],
    queryFn: fetchFinanceSummary,
    staleTime: 60_000,
  })
}
