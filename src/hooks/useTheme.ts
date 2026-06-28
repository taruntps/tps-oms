import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type DashboardTheme = 'ocean' | 'slate' | 'sand' | 'forest' | 'white'

export const THEMES: { value: DashboardTheme; label: string; from: string; to: string }[] = [
  { value: 'ocean',  label: 'Ocean',   from: '#0F4C75', to: '#1B262C' },
  { value: 'slate',  label: 'Slate',   from: '#1e293b', to: '#0f172a' },
  { value: 'sand',   label: 'Sand',    from: '#78350f', to: '#292524' },
  { value: 'forest', label: 'Forest',  from: '#14532d', to: '#052e16' },
  { value: 'white',  label: 'Classic', from: '#475569', to: '#1e293b' },
]

function applyTheme(theme: DashboardTheme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('dashboard_theme', theme)
}

export function useTheme() {
  const { profile } = useAuth()

  useEffect(() => {
    const saved = ((profile as any)?.dashboard_theme as DashboardTheme | undefined)
      ?? (localStorage.getItem('dashboard_theme') as DashboardTheme | null)
      ?? 'ocean'
    applyTheme(saved)
  }, [profile])

  const setTheme = useCallback(async (theme: DashboardTheme) => {
    applyTheme(theme)
    if (profile?.id) {
      await supabase.from('profiles').update({ dashboard_theme: theme } as any).eq('id', profile.id)
    }
  }, [profile?.id])

  const current = (typeof document !== 'undefined'
    ? (document.documentElement.getAttribute('data-theme') as DashboardTheme | null)
    : null) ?? 'ocean'

  return { current, setTheme, THEMES }
}
