import { useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { NotificationPanel } from './NotificationPanel'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/shared/Toast'
import { Sym } from '@/components/shared/Sym'

interface TopBarProps {
  title: string
  subtitle?: string
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { profile, user, refreshProfile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const initials = profile?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const avatarUrl = (profile as any)?.avatar_url as string | null | undefined

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return }
    if (file.size > 3 * 1024 * 1024) { toast.error('Image must be under 3 MB'); return }
    try {
      setUploading(true)
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${user.id}/avatar_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const { error: updErr } = await supabase.from('profiles')
        .update({ avatar_url: pub.publicUrl } as any).eq('id', user.id)
      if (updErr) throw updErr
      await refreshProfile()
      toast.success('Profile photo updated')
    } catch (err: any) {
      toast.error('Photo upload failed', err.message)
    } finally {
      setUploading(false)
    }
  }

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
        {/* Avatar with photo upload (LinkedIn-style) */}
        <button
          onClick={() => fileRef.current?.click()}
          title="Change profile photo"
          className="relative w-9 h-9 rounded-full overflow-hidden border border-white/20 bg-white/15 flex items-center justify-center group shrink-0"
        >
          {avatarUrl
            ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            : <span className="text-white text-xs font-bold">{initials}</span>}
          <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Sym
              name={uploading ? 'progress_activity' : 'photo_camera'}
              size={15}
              className={`text-white ${uploading ? 'animate-spin' : ''}`}
            />
          </span>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
        </button>
      </div>
    </header>
  )
}
