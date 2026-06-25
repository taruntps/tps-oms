import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'

const IDLE_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Signs the user out after 30 minutes of no interaction. Applies app-wide while
 * authenticated. Independent of "Remember me" (that only controls whether the next
 * visit needs a fresh login — idle logout always applies for security).
 */
export function useIdleLogout() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!session) return

    const reset = () => {
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(async () => {
        await signOut()
        toast.info('Signed out', 'You were signed out after 30 minutes of inactivity.')
        navigate('/login')
      }, IDLE_MS)
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      if (timer.current) window.clearTimeout(timer.current)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [session])
}
