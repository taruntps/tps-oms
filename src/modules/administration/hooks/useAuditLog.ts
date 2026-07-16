// Administration — Audit Log React Query hooks.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchAuditLog, fetchUserNames, type AuditFilters } from '../api/audit'

export function useAuditLog(page: number, filters: AuditFilters) {
  const auditQuery = useQuery({
    queryKey: ['admin', 'audit', page, filters],
    queryFn: () => fetchAuditLog(page, filters),
    placeholderData: keepPreviousData,
  })

  const ids = (auditQuery.data?.rows ?? [])
    .map((r) => r.user_id)
    .filter((v): v is string => !!v)

  const namesQuery = useQuery({
    queryKey: ['admin', 'audit-user-names', [...new Set(ids)].sort()],
    queryFn: () => fetchUserNames(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  })

  return { auditQuery, names: namesQuery.data ?? {} }
}
