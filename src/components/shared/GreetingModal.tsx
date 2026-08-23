import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { greetWord, thoughtOfTheDay, warmLine } from '@/data/dailyThoughts'
import { Sym } from '@/components/shared/Sym'

// Shown once per login session: a warm greeting + the day's rotating thought.
// The flag lives in sessionStorage so it does NOT re-open on internal navigation,
// but a fresh login (new session) shows it again. AuthContext.signOut clears the
// flag so the next sign-in re-greets. Exported for that cleanup.
export const GREETED_KEY = 'greeted_session'

const GREETING_ICON: Record<string, string> = {
  morning: 'wb_twilight',
  afternoon: 'wb_sunny',
  evening: 'nights_stay',
}

export function GreetingModal() {
  const { profile } = useAuth()
  const [show, setShow] = useState(false)

  // Open once, only after the profile (name) is available, and only if this
  // session hasn't been greeted yet.
  useEffect(() => {
    if (!profile) return
    if (sessionStorage.getItem(GREETED_KEY) === '1') return
    setShow(true)
  }, [profile])

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show])

  function dismiss() {
    sessionStorage.setItem(GREETED_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  const word = greetWord()
  const firstName = profile?.name?.split(' ')[0] ?? 'there'
  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B1526]/60 backdrop-blur-sm animate-fade-up"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Daily greeting"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
      >
        {/* Navy header band */}
        <div className="relative px-6 pt-7 pb-6 bg-gradient-to-br from-[#1E3A5F] to-[#12233B] text-white">
          <button
            onClick={dismiss}
            aria-label="Close"
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Sym name="close" size={18} />
          </button>
          <div className="flex items-center gap-2 text-[#8FB6FF]">
            <Sym name={GREETING_ICON[word] ?? 'wb_sunny'} size={22} fill />
            <span className="text-xs font-medium uppercase tracking-wider">Good {word}</span>
          </div>
          <h2 className="mt-2 text-2xl font-display font-bold leading-tight">
            {firstName} 👋
          </h2>
          <p className="mt-1 text-sm text-white/70">{dateStr}</p>
          <p className="mt-2 text-sm text-white/90">{warmLine()}</p>
        </div>

        {/* Thought of the day */}
        <div className="px-6 py-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6B7F] mb-2">
            Thought for the day
          </p>
          <p className="text-[15px] leading-relaxed text-[#22324A]">
            “{thoughtOfTheDay()}”
          </p>

          <button
            onClick={dismiss}
            className="mt-6 w-full py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#12233B] text-white text-sm font-semibold transition-colors"
          >
            Let’s get to work
          </button>
        </div>
      </div>
    </div>
  )
}
