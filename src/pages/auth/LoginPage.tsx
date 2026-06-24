import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError('Invalid email or password.')
    } else {
      navigate('/dashboard')
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
              <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-lg overflow-hidden p-2.5">
                <img src="/logo.png" alt="TPS Xperts Group" className="max-w-full max-h-full object-contain" />
              </div>
            </div>
            <h1 className="text-white font-display font-bold text-xl tracking-tight">TPS Portal</h1>
            <p className="text-brand-200 text-sm mt-1">portal.tpsxpert.com</p>
          </div>

          {/* Form */}
          <div className="px-8 py-6">
            <p className="text-sm text-muted-foreground text-center mb-6">
              Sign in to your account
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-brand-950 uppercase tracking-wide">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@tpsxperts.com"
                  required
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-[#F8FAFC] text-sm font-sans focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 transition-all"
                />
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
    </div>
  )
}
