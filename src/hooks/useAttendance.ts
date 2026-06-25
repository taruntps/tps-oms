import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export type AttendancePunch = Tables<'attendance_punches'>
export type AttendanceSettings = Tables<'attendance_settings'>

// UTC instant of "today 00:00" in IST (Asia/Kolkata, UTC+5:30).
export function istMidnightUtcISO(): string {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000)
  ist.setUTCHours(0, 0, 0, 0)
  return new Date(ist.getTime() - 5.5 * 3600 * 1000).toISOString()
}

export function useAttendanceSettings() {
  return useQuery({
    queryKey: ['attendance_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('attendance_settings').select('*').maybeSingle()
      if (error) throw error
      return data as AttendanceSettings | null
    },
  })
}

export function useTodayPunches(userId?: string) {
  return useQuery({
    queryKey: ['attendance_today', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_punches')
        .select('*')
        .eq('user_id', userId!)
        .gte('punch_at', istMidnightUtcISO())
        .order('punch_at', { ascending: true })
      if (error) throw error
      return data as AttendancePunch[]
    },
  })
}

export function useMyAttendanceDays(userId?: string) {
  return useQuery({
    queryKey: ['attendance_days', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_days')
        .select('*')
        .eq('user_id', userId!)
        .order('work_date', { ascending: false })
        .limit(60)
      if (error) throw error
      return data as any[]
    },
  })
}

export function usePunch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ lat, lng, accuracy, selfiePath, device }: {
      lat: number; lng: number; accuracy: number; selfiePath?: string | null; device?: string
    }) => {
      const { data, error } = await supabase.rpc('punch_attendance', {
        p_lat: lat, p_lng: lng, p_accuracy: accuracy,
        p_selfie_path: selfiePath ?? undefined, p_device: device ?? undefined,
      })
      if (error) throw error
      return data as { id: string; within_fence: boolean; distance_m: number; is_field: boolean }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance_today'] })
      qc.invalidateQueries({ queryKey: ['attendance_days'] })
    },
  })
}
