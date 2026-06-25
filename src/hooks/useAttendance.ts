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

export type OfficeLocation = Tables<'office_locations'>

export function useActiveOffice() {
  return useQuery({
    queryKey: ['office_location'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('office_locations').select('*').order('created_at').limit(1).maybeSingle()
      if (error) throw error
      return data as OfficeLocation | null
    },
  })
}

export function useUpdateAttendanceSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fields: Partial<AttendanceSettings>) => {
      const { error } = await supabase.from('attendance_settings')
        .update({ ...fields, updated_at: new Date().toISOString() } as any).eq('id', true)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance_settings'] }),
  })
}

export function useUpsertOffice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (o: { id?: string; name: string; latitude: number; longitude: number; radius_m: number }) => {
      if (o.id) {
        const { error } = await supabase.from('office_locations')
          .update({ name: o.name, latitude: o.latitude, longitude: o.longitude, radius_m: o.radius_m }).eq('id', o.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('office_locations')
          .insert({ name: o.name, latitude: o.latitude, longitude: o.longitude, radius_m: o.radius_m })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office_location'] }),
  })
}

// All staff punches today (managers/HR/admin see everyone via RLS).
export function useTeamToday() {
  return useQuery({
    queryKey: ['attendance_team_today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_punches')
        .select('id, user_id, punch_at, within_fence, is_field, distance_m, profiles!attendance_punches_user_id_fkey(name, employee_code)')
        .gte('punch_at', istMidnightUtcISO())
        .order('punch_at', { ascending: true })
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
