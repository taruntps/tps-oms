import { useRef, useState, useEffect } from 'react'
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
  const { profile, user, refreshProfile, signOut } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [uploading, setUploading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  const initials = profile?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const avatarUrl = (profile as any)?.avatar_url as string | null | undefined

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

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

  const changePassword = async () => {
    if (newPw.length < 6) { toast.error('Password must be at least 6 characters'); return }
    try {
      setSavingPw(true)
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw error
      toast.success('Password changed', 'Use your new password next time you sign in.')
      setPwOpen(false); setNewPw('')
    } catch (e: any) {
      toast.error('Failed', e.message)
    } finally {
      setSavingPw(false)
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

        {/* Avatar menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            title="Account menu"
            className="relative w-9 h-9 rounded-full overflow-hidden border border-white/20 bg-white/15 flex items-center justify-center shrink-0"
          >
            {avatarUrl
              ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              : <span className="text-white text-xs font-bold">{initials}</span>}
            {uploading && (
              <span className="absolute inset-0 bg-black/45 flex items-center justify-center">
                <Sym name="progress_activity" size={15} className="text-white animate-spin" />
              </span>
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-11 w-52 bg-white rounded-xl shadow-xl border border-border z-50 overflow-hidden animate-fade-up">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-brand-950 truncate">{profile?.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{profile?.email}</p>
              </div>
              <button onClick={() => { setMenuOpen(false); fileRef.current?.click() }}
                className="w-full text-left px-4 py-2.5 text-sm text-brand-950 hover:bg-[#F8FAFC] flex items-center gap-2.5">
                <Sym name="photo_camera" size={15} className="text-muted-foreground" /> Change photo
              </button>
              <button onClick={() => { setMenuOpen(false); setPwOpen(true); setNewPw('') }}
                className="w-full text-left px-4 py-2.5 text-sm text-brand-950 hover:bg-[#F8FAFC] flex items-center gap-2.5">
                <Sym name="lock" size={15} className="text-muted-foreground" /> Change password
              </button>
              <button onClick={() => { setMenuOpen(false); signOut() }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5 border-t border-border">
                <Sym name="logout" size={15} /> Sign out
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
        </div>
      </div>

      {/* Change password modal */}
      {pwOpen && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h2 className="font-display font-semibold text-brand-950 mb-1">Change your password</h2>
            <p className="text-xs text-muted-foreground mb-4">Set a new password for your account.</p>
            <label className="block text-xs font-medium text-brand-950 mb-1">New password</label>
            <input
              type="text"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="At least 6 characters"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setPwOpen(false); setNewPw('') }}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={changePassword} disabled={newPw.length < 6 || savingPw}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {savingPw ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
