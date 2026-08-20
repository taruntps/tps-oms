// Self-service password reset by OTP (SMS + email) via the two-factor edge function.
// Step 1: identify (email / employee code) → send OTP. Step 2: enter OTP + new password.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Sym } from '@/components/shared/Sym'

const ic = 'w-full px-3 py-2.5 rounded-lg border border-border bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600'

export function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'id' | 'reset' | 'done'>('id')
  const [identifier, setIdentifier] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [dest, setDest] = useState('')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sendCode = async () => {
    if (!identifier.trim()) return
    setBusy(true); setError('')
    const { data, error } = await supabase.functions.invoke('two-factor', {
      body: { action: 'send', purpose: 'password_reset', identifier: identifier.trim() },
    })
    setBusy(false)
    if (error || !data?.challengeId) {
      setError((data as any)?.error === 'not_found' ? 'No account found for that email / User ID.'
        : (data as any)?.error === 'no_contact' ? 'That account has no mobile or email on file. Contact your admin.'
        : 'Could not send the code. Please try again.')
      return
    }
    setChallengeId(data.challengeId)
    setDest([data.sms && data.masked ? `SMS to ${data.masked}` : '', data.mail && data.maskedEmail ? `email ${data.maskedEmail}` : '']
      .filter(Boolean).join(' and '))
    setStep('reset')
  }

  const reset = async () => {
    if (code.trim().length < 4 || pw.length < 6 || !challengeId) return
    setBusy(true); setError('')
    const { data } = await supabase.functions.invoke('two-factor', {
      body: { action: 'verify', challengeId, code: code.trim(), newPassword: pw },
    })
    setBusy(false)
    if (data?.ok) { setStep('done'); return }
    setError((data as any)?.error === 'expired' ? 'This code has expired — start again.'
      : (data as any)?.error === 'too_many' ? 'Too many attempts — start again.'
      : (data as any)?.error === 'weak_password' ? 'Password must be at least 6 characters.'
      : 'Incorrect code. Please try again.')
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display font-semibold text-brand-950">Reset your password</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>

        {step === 'id' && (
          <>
            <p className="text-xs text-muted-foreground mb-4">Enter your User ID or email — we'll send a one-time code by SMS and email.</p>
            <input className={ic} autoFocus value={identifier} onChange={e => setIdentifier(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendCode() }} placeholder="Email or Employee Code (e.g. T002)" />
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            <button onClick={sendCode} disabled={busy || !identifier.trim()}
              className="w-full mt-4 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-50">
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </>
        )}

        {step === 'reset' && (
          <>
            <p className="text-xs text-muted-foreground mb-4">Enter the code sent by {dest || 'SMS / email'} and choose a new password.</p>
            <label className="block text-xs font-medium text-brand-950 mb-1">Code</label>
            <input className={`${ic} tracking-[0.3em] font-mono text-center`} inputMode="numeric"
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••" />
            <label className="block text-xs font-medium text-brand-950 mb-1 mt-3">New password</label>
            <input className={ic} type="text" value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 6 characters" />
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            <button onClick={reset} disabled={busy || code.length < 4 || pw.length < 6}
              className="w-full mt-4 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-50">
              {busy ? 'Resetting…' : 'Reset password'}
            </button>
            <button onClick={sendCode} disabled={busy} className="w-full mt-2 text-xs text-brand-600 hover:underline disabled:opacity-50">Resend code</button>
          </>
        )}

        {step === 'done' && (
          <div className="text-center py-2">
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-3">
              <Sym name="check" size={24} />
            </div>
            <p className="text-sm text-brand-950 font-medium">Password updated</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">You can now sign in with your new password.</p>
            <button onClick={onClose} className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2.5 rounded-lg">Back to sign in</button>
          </div>
        )}
      </div>
    </div>
  )
}
