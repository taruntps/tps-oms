// CRM — activity timeline React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchActivities,
  logActivity,
  type ActivityEntity,
  type ActivityInput,
} from '../api/activities'

const key = (entityType: ActivityEntity, entityId: string) => ['crm', 'activities', entityType, entityId]

export function useActivities(entityType: ActivityEntity, entityId: string) {
  return useQuery({
    queryKey: key(entityType, entityId),
    queryFn: () => fetchActivities(entityType, entityId),
    enabled: !!entityId,
  })
}

export function useLogActivity() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: (input: ActivityInput) => logActivity(input, profile?.id),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: key(v.entity_type, v.entity_id) })
      toast.success('Activity logged')
    },
    onError: (e: Error) => toast.error('Failed to log activity', e.message),
  })
}
