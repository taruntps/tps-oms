import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Sym } from '@/components/shared/Sym'
import { cn } from '@/lib/utils'
import { FaceCapture } from '@/pages/attendance/FaceCapture'
import { preloadFaceEngine } from '@/lib/faceEngine'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  // Face-scan state
  const [faceScanOpen, setFaceScanOpen] = useState(false)
  const [faceScanBusy, setFaceScanBusy] = useState(false)

  // Request camera + location permissions on mount so they're remembered.
  // Also kick off face model loading so Face ID tap is near-instant.
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(s => { s.getTracks().forEach(t => t.stop()); preloadFaceEngine() })
      .catch(() => {})
    navigator.geolocation?.getCurrentPosition(() => {}, () => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    localStorage.setItem('tps_remember', String(remember))

    const identifier = email.trim()

    // Brute-force check: 5+ failures in 15 min → locked
    const { data: isLocked } = await (supabase.rpc as any)('check_login_locked', { p_identifier: identifier })
    if (isLocked) {
      setError('Too many failed attempts. Please wait 15 minutes before trying again.')
      setLoading(false)
      return
    }

    // Resolve employee code → email if needed
    let loginEmail = identifier
    if (!loginEmail.includes('@')) {
      const { data: resolved } = await (supabase.rpc as any)('resolve_login_email', { p_identifier: loginEmail })
      if (!resolved) {
        await (supabase.rpc as any)('record_login_attempt', { p_identifier: identifier, p_success: false })
        setError('Invalid user ID or password.')
        setLoading(false)
        return
      }
      loginEmail = resolved as string
    }

    const { error: authErr } = await supabase.auth.signInWithPassword({ email: loginEmail, password })
    setLoading(false)
    if (authErr) {
      await (supabase.rpc as any)('record_login_attempt', { p_identifier: identifier, p_success: false })
      setError('Invalid user ID or password.')
    } else {
      await (supabase.rpc as any)('record_login_attempt', { p_identifier: identifier, p_success: true })
      navigate('/dashboard')
    }
  }

  const handleFaceScan = () => {
    if (!email.trim()) return
    setError('')
    setFaceScanOpen(true)
  }

  const onFaceCapture = async ({ descriptor }: { canvas: HTMLCanvasElement; descriptor: number[] }) => {
    setFaceScanBusy(true)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('face-login', {
        body: { identifier: email.trim(), faceDescriptor: descriptor },
      })
      let errMsg: string | null = null
      if (fnErr) {
        try { const body = await (fnErr as any).context?.json?.(); errMsg = body?.error } catch { errMsg = fnErr.message }
        throw new Error(errMsg ?? fnErr.message)
      }
      if (data?.error) throw new Error(data.error)

      const { error: verifyErr } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'magiclink',
      })
      if (verifyErr) throw new Error(verifyErr.message)

      navigate('/dashboard')
    } catch (e: any) {
      setFaceScanOpen(false)
      const raw = e.message ?? ''
      setError(
        raw.includes('not recognized') ? 'Face not recognized — use password to sign in.' :
        raw.includes('No face enrolled') ? 'No face registered for this account — use password.' :
        raw.includes('not found') || raw.includes('User not found') ? 'User not found.' :
        `Face sign-in failed: ${raw}`
      )
    } finally {
      setFaceScanBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Soft glow accents over the mesh-gradient backdrop */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-white/10 blur-3xl glow-accent" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-indigo-insight/20 blur-3xl glow-accent" />
      </div>

      <div className="relative w-full max-w-[420px] animate-fade-up">
        {/* Card (readable glass) */}
        <div className="glass-readable rounded-2xl overflow-hidden">
          {/* Header strip */}
          <div className="bg-gradient-to-r from-brand-900 to-primary-container px-8 pt-8 pb-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center shadow-lg overflow-hidden p-1">
                <img src="/logo.png" alt="TPS Xperts Group" className="w-full h-full object-contain" />
              </div>
            </div>
            <h1 className="text-white font-display font-bold text-xl tracking-tight">TPS Portal</h1>
          </div>

          {/* Form */}
          <div className="px-8 py-6">
            <p className="text-sm text-muted-foreground text-center mb-6">
              Sign in to your account
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-brand-950 uppercase tracking-wide">
                  User ID
                </label>
                {/* Input + face scan icon */}
                <div className="relative">
                  <input
                    type="text"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email or Employee Code (e.g. T002)"
                    required
                    autoFocus
                    className="w-full px-3 py-2.5 pr-10 rounded-lg border border-border bg-[#F8FAFC] text-sm font-sans focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 transition-all"
                  />
                  <button
                    type="button"
                    title={email.trim() ? 'Sign in with Face ID' : 'Enter your User ID first'}
                    onClick={handleFaceScan}
                    className={cn(
                      'absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all',
                      email.trim()
                        ? 'text-brand-600 hover:bg-brand-50 cursor-pointer'
                        : 'text-muted-foreground/35 cursor-default'
                    )}
                  >
                    <Sym name="fingerprint" size={17} />
                  </button>
                </div>
                {email.trim() && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Sym name="fingerprint" size={10} />
                    Tap the icon to sign in with Face ID
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-brand-950 uppercase tracking-wide">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-[#F8FAFC] text-sm font-sans focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 transition-all"
                />
              </div>

              {/* Remember me */}
              <label className="flex items-center gap-2 text-xs text-brand-950 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-brand-600 focus:ring-brand-600/30"
                />
                Remember me on this device
              </label>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm mt-2 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : 'Sign In'}
              </button>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-6">
              Authorised users only
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-white/70 mt-4">
          TPS Xperts Group © {new Date().getFullYear()}
        </p>
      </div>

      {/* Face scan modal */}
      {faceScanOpen && (
        <FaceCapture
          title="Hold still — scanning 3 frames for secure verification"
          actionLabel="Scan"
          autoCapture={true}
          captureFrames={3}
          busy={faceScanBusy}
          onCapture={onFaceCapture}
          onCancel={() => { setFaceScanOpen(false); setFaceScanBusy(false) }}
        />
      )}
    </div>
  )
}
