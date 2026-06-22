import { useAuth } from '@/contexts/AuthContext'
import { NotificationPanel } from './NotificationPanel'

interface TopBarProps {
  title: string
  subtitle?: string
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { profile } = useAuth()

  return (
    <header className="bg-white border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      <div>
        <h1 className="text-lg font-display font-semibold text-brand-950">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <NotificationPanel />
        <div className="text-right hidden sm:block">
          <p className="text-xs font-semibold text-brand-950">{profile?.name}</p>
          <p className="text-[10px] text-muted-foreground capitalize">{profile?.role?.replace(/_/g, ' ')}</p>
        </div>
      </div>
    </header>
  )
}
