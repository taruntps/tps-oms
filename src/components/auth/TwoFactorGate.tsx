// Login 2FA gate — shown after password sign-in for users with twofa_enabled.
// Sends an SMS OTP via the two-factor edge function (2Factor.in) and verifies it
// before any app content renders. Blocks nothing for users without 2FA.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Sym } from '@/components/shared/Sym'

export function TwoFactorGate({ onVerified }: { onVerified: () => void }) {
  const { signOut } = useAuth()
  const [phase, setPhase] = useState<'sending' | 'ready' | 'verifying'>('sending')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [dest, setDest] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const sentOnce = useRef(false)

  const send = async () => {
    setError(null); setPhase('sending')
    const { data, error } = await supabase.functions.invoke('two-factor', {
      body: { action: 'send', purpose: 'login_2fa' },
    })
    if (error || !data?.challengeId) {
      const code = (data as any)?.error
      const detail = code === 'no_contact' || code === 'no_phone'
        ? 'No reachable mobile or email is on your account. Please ask your admin to add a valid number.'
        : code === 'send_failed'
        ? "Couldn't deliver the code (check your mobile number with admin). Try Resend, or ask admin to sign you in."
        : (data as any)?.detail || error?.message || 'Could not send the code. Try Resend.'
      setError(String(detail)); setPhase('ready'); return
    }
    setChallengeId(data.challengeId)
    const to = [data.sms && data.masked ? `SMS to ${data.masked}` : '', data.mail && data.maskedEmail ? `email ${data.maskedEmail}` : '']
      .filter(Boolean).join(' and ')
    setDest(to); setPhase('ready')
  }

  useEffect(() => {
    if (sentOnce.current) return
    sentOnce.current = true
    send()
  }, [])

  const verify = async () => {
    if (code.trim().length < 4 || !challengeId) return
    setPhase('verifying'); setError(null)
    const { data } = await supabase.functions.invoke('two-factor', {
      body: { action: 'verify', challengeId, code: code.trim() },
    })
    if (data?.ok) { onVerified(); return }
    setError((data as any)?.error === 'expired' ? 'This code has expired. Resend a new one.'
      : (data as any)?.error === 'too_many' ? 'Too many attempts. Resend a new code.'
      : 'Incorrect code. Please try again.')
    setPhase('ready')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center mx-auto mb-3">
          <Sym name="sms" size={24} />
        </div>
        <h1 className="text-lg font-display font-semibold text-brand-950 text-center">Two-factor verification</h1>
        <p className="text-xs text-muted-foreground text-center mt-1 mb-5">
          {phase === 'sending' ? 'Sending a one-time code…'
            : dest ? `Enter the code sent by ${dest}.`
            : 'Enter the code sent to your mobile / email.'}
        </p>

        <input
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={e => { if (e.key === 'Enter') verify() }}
          inputMode="numeric" autoFocus placeholder="••••••"
          className="w-full text-center tracking-[0.5em] text-xl font-mono px-3 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
        />

        {error && <p className="text-xs text-red-600 mt-2 text-center">{error}</p>}

        <button
          onClick={verify}
          disabled={code.length < 4 || phase === 'verifying' || phase === 'sending'}
          className="w-full mt-4 px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {phase === 'verifying' ? 'Verifying…' : 'Verify & continue'}
        </button>

        <div className="flex items-center justify-between mt-4 text-xs">
          <button onClick={send} disabled={phase === 'sending'}
            className="text-brand-600 hover:underline disabled:opacity-50">Resend code</button>
          <button onClick={() => signOut()} className="text-muted-foreground hover:text-foreground">Sign out</button>
        </div>
      </div>
    </div>
  )
}
