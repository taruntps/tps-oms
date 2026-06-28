import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/hooks/useNotifications'
import { formatDate } from '@/lib/utils'
import { Sym } from '@/components/shared/Sym'

const TYPE_COLOR: Record<string, string> = {
  stage_overdue:    'bg-red-100 text-red-700',
  expiry_warning:   'bg-amber-100 text-amber-700',
  license_expiring: 'bg-amber-100 text-amber-700',
  block_request:    'bg-blue-100 text-blue-700',
  block_approved:   'bg-green-100 text-green-700',
  payment_overdue:  'bg-red-100 text-red-700',
  query_received:   'bg-purple-100 text-purple-700',
  project_assigned: 'bg-brand-100 text-brand-700',
}

export function NotificationPanel() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { notifications, unreadCount, loading, markAllRead, markRead } = useNotifications()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'relative w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 transition-colors',
          unreadCount > 0 && 'animate-pulse-bell'
        )}
        aria-label="Notifications"
      >
        <Sym name="notifications" size={18} className="text-white/85" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-arctic-error text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-xl border border-border z-50 overflow-hidden animate-fade-up">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-brand-950">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] text-brand-600 hover:text-brand-700 flex items-center gap-1"
                >
                  <Sym name="done_all" size={12} />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => { setOpen(false); navigate('/notifications') }}
                className="text-[11px] text-brand-600 hover:text-brand-700"
              >
                View all
              </button>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <Sym name="close" size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No notifications yet</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={cn(
                    'px-4 py-3 cursor-pointer hover:bg-[#F8FAFC] transition-colors',
                    !n.is_read && 'bg-brand-50/40'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5', TYPE_COLOR[n.type] ?? 'bg-gray-100 text-gray-600')}>
                      {n.type.replace(/_/g, ' ')}
                    </span>
                    {!n.is_read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-600 shrink-0 mt-1.5" />
                    )}
                    {n.is_read && (
                      <Sym name="check" size={12} className="text-green-500 shrink-0 mt-1" />
                    )}
                  </div>
                  <p className="text-xs font-medium text-brand-950 mt-1.5 leading-snug">{n.title}</p>
                  {n.body && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
                    {formatDate(n.created_at)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
