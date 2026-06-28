import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useNotifications } from '@/hooks/useNotifications'
import { formatDate, cn } from '@/lib/utils'

const TYPE_COLOR: Record<string, string> = {
  stage_overdue:   'bg-red-100 text-red-700',
  expiry_warning:  'bg-amber-100 text-amber-700',
  block_request:   'bg-blue-100 text-blue-700',
  block_approved:  'bg-green-100 text-green-700',
  payment_overdue: 'bg-red-100 text-red-700',
}

type Filter = 'all' | 'unread' | 'read'

export default function NotificationsPage() {
  const { notifications, unreadCount, loading, markAllRead, markRead } = useNotifications()
  const [filter, setFilter] = useState<Filter>('all')

  const visible = notifications.filter(n => {
    if (filter === 'unread') return !n.is_read
    if (filter === 'read')   return n.is_read
    return true
  })

  return (
    <div>
      <TopBar title="Notifications" subtitle={`${unreadCount} unread`} />

      <div className="p-6 animate-fade-up">
        {/* Filter tabs + Mark all read */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-1 glass-panel rounded-xl p-1">
            {(['all', 'unread', 'read'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize',
                  filter === f ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'
                )}
              >
                {f}
                {f === 'unread' && unreadCount > 0 && (
                  <span className="ml-1.5 text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5">{unreadCount}</span>
                )}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white border border-white/20 px-3 py-1.5 rounded-xl transition-all"
            >
              <Sym name="done_all" size={14} /> Mark all read
            </button>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1,2,3,4,5].map(i => <div key={i} className="h-20 glass-panel rounded-xl" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="notifications_off" size={32} className="mx-auto text-white/30 mb-3" />
            <p className="text-sm text-white/60">
              {filter === 'unread' ? 'All caught up! No unread notifications.' : 'No notifications yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(n => (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                className={cn(
                  'glass-panel rounded-xl px-5 py-4 transition-all',
                  !n.is_read ? '!bg-white/[0.18] !border-white/30 cursor-pointer hover:bg-white/[0.22]' : 'opacity-75'
                )}
              >
                <div className="flex items-start gap-3">
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0 mt-1.5" />}
                  <div className={cn('flex-1', n.is_read && 'ml-5')}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', TYPE_COLOR[(n as any).type] ?? 'bg-gray-100 text-gray-600')}>
                        {((n as any).type ?? '').replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] text-white/40 font-mono">{formatDate(n.created_at)}</span>
                    </div>
                    <p className="text-sm font-medium text-white">{(n as any).title ?? 'Notification'}</p>
                    {(n as any).body && <p className="text-xs text-white/60 mt-0.5 leading-snug">{(n as any).body}</p>}
                  </div>
                  {!n.is_read && (
                    <button
                      onClick={e => { e.stopPropagation(); markRead(n.id) }}
                      className="text-white/40 hover:text-white transition-colors shrink-0 ml-auto"
                      title="Mark as read"
                    >
                      <Sym name="check" size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
