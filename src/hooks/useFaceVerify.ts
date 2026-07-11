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

export type EnrollFrame = {
  ok: boolean
  matched: boolean
  detected?: 'center' | 'left' | 'right' | 'up' | 'down'
  savedReference?: boolean
  reason?: string
}

/**
 * Send one live frame to the enroll function.
 * - want:'center' validates a clean frontal face and STORES the reference.
 * - want:'scan'   just reports which direction the head is turned (fills the ring).
 * Called repeatedly by the guided scan, so it's a plain function, not a mutation.
 */
export async function enrollFrame(
  photo: string, want: 'center' | 'scan', targetUserId?: string,
): Promise<EnrollFrame> {
  return invoke('attendance-enroll-face', { photo, want, targetUserId }) as Promise<EnrollFrame>
}

/** Register / re-register a reference face in one shot (admin / legacy single photo). */
export function useEnrollFace() {
  return useMutation({
    mutationFn: async ({ photo, targetUserId }: { photo: string; targetUserId?: string }) =>
      invoke('attendance-enroll-face', { photo, targetUserId }),
  })
}

/** Clear a stored reference face — self (no arg) or another user (admin, targetUserId). */
export function useResetFace() {
  return useMutation({
    mutationFn: async ({ targetUserId }: { targetUserId?: string } = {}) =>
      invoke('attendance-enroll-face', { reset: true, targetUserId }) as Promise<{ ok: boolean; reset?: boolean }>,
  })
}

/** Punch with server-side face verification (matching + recording happen in the edge fn). */
export function useVerifiedPunch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ photo, gps }: { photo: string; gps: { lat: number; lng: number; accuracy: number } }) =>
      invoke('attendance-verify-punch', { photo, gps }) as
        Promise<{ ok: boolean; status?: string; needs_enrollment?: boolean; needs_retake?: boolean; reason?: string }>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance_today'] })
      qc.invalidateQueries({ queryKey: ['attendance_days'] })
    },
  })
}
