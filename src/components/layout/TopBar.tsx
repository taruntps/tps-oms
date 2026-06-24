import { useAuth } from '@/contexts/AuthContext'
import { NotificationPanel } from './NotificationPanel'

interface TopBarProps {
  title: string
  subtitle?: string
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { profile } = useAuth()

  return (
    <header className="glass-panel border-x-0 border-t-0 border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      <div>
        <h1 className="text-lg font-display font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-xs text-white/60 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <NotificationPanel />
        <div className="text-right hidden sm:block">
          <p className="text-xs font-semibold text-white">{profile?.name}</p>
          <p className="text-[10px] text-white/55 capitalize">{profile?.role?.replace(/_/g, ' ')}</p>
        </div>
      </div>
    </header>
  )
}
