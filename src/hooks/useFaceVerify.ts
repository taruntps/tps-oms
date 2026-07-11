import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

async function invoke(fn: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) {
    let msg = error.message
    try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error } catch { /* ignore */ }
    throw new Error(msg)
  }
  if ((data as any)?.error) throw new Error((data as any).error)
  return data
}

/** Register / re-register the caller's reference face (one-time). */
export function useEnrollFace() {
  return useMutation({
    mutationFn: async ({ photo, targetUserId }: { photo: string; targetUserId?: string }) =>
      invoke('attendance-enroll-face', { photo, targetUserId }),
  })
}

/** Punch with server-side face verification (matching + recording happen in the edge fn). */
export function useVerifiedPunch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ photo, gps }: { photo: string; gps: { lat: number; lng: number; accuracy: number } }) =>
      invoke('attendance-verify-punch', { photo, gps }) as Promise<{ ok: boolean; status?: string; needs_enrollment?: boolean }>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance_today'] })
      qc.invalidateQueries({ queryKey: ['attendance_days'] })
    },
  })
}
