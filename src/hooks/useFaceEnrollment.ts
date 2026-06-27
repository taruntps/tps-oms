import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { FACE_MODEL } from '@/lib/faceEngine'

export interface FaceEnrollment { enrolled: boolean; enrolledAt: string | null; descriptor: number[] | null }

export function useFaceEnrollment(userId?: string) {
  return useQuery({
    queryKey: ['face_enrollment', userId],
    enabled: !!userId,
    queryFn: async (): Promise<FaceEnrollment> => {
      const { data, error } = await (supabase.from('profiles') as any)
        .select('face_descriptor, face_enrolled_at').eq('id', userId).single()
      if (error) throw error
      const d = data?.face_descriptor as number[] | null
      return { enrolled: !!d?.length, enrolledAt: data?.face_enrolled_at ?? null, descriptor: d ?? null }
    },
  })
}

export function useSaveFaceEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, descriptor }: { userId: string; descriptor: number[] }) => {
      const { error } = await (supabase.from('profiles') as any)
        .update({ face_descriptor: descriptor, face_enrolled_at: new Date().toISOString(), face_model: FACE_MODEL })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['face_enrollment', v.userId] }),
  })
}

// Admin clears a user's template so they re-enrol.
export function useResetFaceEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await (supabase.from('profiles') as any)
        .update({ face_descriptor: null, face_enrolled_at: null, face_model: null }).eq('id', userId)
      if (error) throw error
    },
    onSuccess: (_d, userId) => qc.invalidateQueries({ queryKey: ['face_enrollment', userId] }),
  })
}
