// Settings — Security: admin global two-factor login switch (super_admin/director).
// Flips every user's twofa_enabled via set_twofa_required (migration 114); new users
// inherit it. OTP is delivered by SMS (2Factor) + email (ZeptoMail).
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { Sym } from '@/components/shared/Sym'

export function SecuritySection() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'director'
  const [on, setOn] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'twofa_required').maybeSingle()
      .then(({ data }) => setOn((data as any)?.value === 'true'))
  }, [])

  if (!isAdmin) return null

  const toggle = async () => {
    const next = !on
    if (next && !confirm('Turn ON two-factor login for ALL users?\n\nEveryone will need an OTP (SMS + email) after their password at every login. Each login uses 1 SMS credit. Make sure every employee has a valid mobile number.')) return
    try {
      setSaving(true)
      const { error } = await (supabase.rpc as any)('set_twofa_required', { p_on: next })
      if (error) throw error
      setOn(next)
      toast.success(next ? 'Two-factor login is now required for all users'
        : 'Two-factor login turned off for all users')
    } catch (e: any) {
      toast.error('Failed', e.message)
    } finally { setSaving(false) }
  }

  return (
    <section className="bg-white rounded-xl border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
          <Sym name="verified_user" size={14} className="text-brand-700" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-brand-950">Security</h2>
          <p className="text-[11px] text-muted-foreground">Two-factor login (SMS + email OTP)</p>
        </div>
      </div>
      <div className="p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-950">Require two-factor login for all users</p>
          <p className="text-[12px] text-muted-foreground mt-0.5 max-w-md">
            Every user enters an OTP (sent by SMS and email) after their password, at each login.
            Needs a valid mobile on each profile · uses 1 SMS per login.
          </p>
        </div>
        <button onClick={toggle} disabled={saving} aria-label="Toggle two-factor for all users"
          className={`shrink-0 w-14 h-7 rounded-full transition relative ${on ? 'bg-brand-600' : 'bg-slate-300'} disabled:opacity-50`}>
          <span className={`absolute top-0.5 ${on ? 'left-7' : 'left-0.5'} w-6 h-6 bg-white rounded-full shadow transition-all`} />
        </button>
      </div>
    </section>
  )
}
