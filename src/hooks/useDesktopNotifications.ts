import { useCallback, useEffect, useRef, useState } from 'react'

// Browser-side desktop pop-up notifications, layered over the existing in-app feed.
// `useNotifications` fires a `tps:new-notification` window event on each new INSERT;
// the AppShell mounts this hook with { listen: true } to turn those into native
// desktop notifications. On by default: we auto-request permission once, and the
// only off-switch is an explicit per-device opt-out stored in localStorage.

const OFF_KEY = 'desktop_notif_off'

export interface NewNotifDetail {
  id: string
  title: string
  body?: string | null
}

function optedOut(): boolean {
  return localStorage.getItem(OFF_KEY) === '1'
}

export function useDesktopNotifications(opts?: {
  listen?: boolean
  onOpen?: (detail: NewNotifDetail) => void
}) {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied'
  )
  const [off, setOff] = useState<boolean>(optedOut())

  // Keep the latest onOpen without re-binding the window listener each render.
  const onOpenRef = useRef(opts?.onOpen)
  onOpenRef.current = opts?.onOpen

  const enabled = supported && permission === 'granted' && !off

  // Auto-request permission on first load (default-on), unless the user opted out
  // or the browser already answered. Only the listening instance requests, so the
  // settings toggle mounting the hook doesn't trigger a second prompt.
  useEffect(() => {
    if (!supported || !opts?.listen) return
    if (Notification.permission === 'default' && !optedOut()) {
      Notification.requestPermission().then(setPermission).catch(() => {})
    }
  }, [supported, opts?.listen])

  const fire = useCallback((detail: NewNotifDetail) => {
    if (!supported || Notification.permission !== 'granted' || optedOut()) return
    if (document.visibilityState === 'visible' && location.pathname.endsWith('/notifications')) return
    try {
      const n = new Notification(detail.title || 'TPS Portal', {
        body: detail.body ?? undefined,
        icon: import.meta.env.BASE_URL + 'logo.png',
        tag: detail.id, // same id collapses duplicate events instead of stacking
      })
      n.onclick = () => {
        window.focus()
        onOpenRef.current?.(detail)
        n.close()
      }
    } catch { /* some browsers block construction; ignore */ }
  }, [supported])

  // Turn window events into desktop notifications (listening instance only).
  useEffect(() => {
    if (!opts?.listen) return
    const handler = (e: Event) => fire((e as CustomEvent<NewNotifDetail>).detail)
    window.addEventListener('tps:new-notification', handler as EventListener)
    return () => window.removeEventListener('tps:new-notification', handler as EventListener)
  }, [opts?.listen, fire])

  // Fire a sample pop-up so the user can confirm permission + rendering work.
  // Returns a status the caller can surface: 'sent' | 'blocked' | 'unsupported'.
  const test = useCallback(async (): Promise<'sent' | 'blocked' | 'unsupported'> => {
    if (!supported) return 'unsupported'
    let perm = Notification.permission
    if (perm === 'default') {
      perm = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission)
      setPermission(perm)
    }
    if (perm !== 'granted') return 'blocked'
    // A test explicitly opts back in (so it actually shows even if previously off).
    localStorage.removeItem(OFF_KEY)
    setOff(false)
    try {
      // No tag: each test creates a fresh pop-up (a repeated tag would silently
      // replace the previous one without re-alerting, looking like "nothing happened").
      const n = new Notification('TPS Portal — test', {
        body: 'Desktop notifications are working. You’ll get these for new alerts.',
        icon: import.meta.env.BASE_URL + 'logo.png',
      })
      n.onclick = () => { window.focus(); n.close() }
      return 'sent'
    } catch {
      return 'blocked'
    }
  }, [supported])

  // Toggle used by the settings UI. Turning on also (re)requests permission.
  const setEnabled = useCallback(async (want: boolean) => {
    if (want) {
      localStorage.removeItem(OFF_KEY)
      setOff(false)
      if (supported && Notification.permission === 'default') {
        const p = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission)
        setPermission(p)
      }
    } else {
      localStorage.setItem(OFF_KEY, '1')
      setOff(true)
    }
  }, [supported])

  return { supported, permission, enabled, setEnabled, test }
}
