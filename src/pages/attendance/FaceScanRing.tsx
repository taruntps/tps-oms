// src/pages/attendance/FaceScanRing.tsx
// Guided face enrollment: look straight (stores the reference), then move your
// head up/down/left/right to fill the ring. All matching runs server-side
// (attendance-enroll-face) — NO on-device face model, so it cannot freeze.
import { useEffect, useRef, useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { enrollFrame } from '@/hooks/useFaceVerify'

const DIRS = ['up', 'right', 'down', 'left'] as const
type Dir = typeof DIRS[number]

/** Downscale a video frame to <=480px and return JPEG base64 (~12KB). */
function grab(video: HTMLVideoElement): string {
  const max = 480
  const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(video.videoWidth * scale)
  c.height = Math.round(video.videoHeight * scale)
  c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.6).split(',')[1]
}

// Dot positions around the ring (percentages within the square).
const POS: Record<Dir, { top: string; left: string }> = {
  up:    { top: '-6%',  left: '50%' },
  down:  { top: '106%', left: '50%' },
  left:  { top: '50%',  left: '-6%' },
  right: { top: '50%',  left: '106%' },
}
const ARROW: Record<Dir, string> = { up: 'keyboard_arrow_up', down: 'keyboard_arrow_down', left: 'chevron_left', right: 'chevron_right' }

export function FaceScanRing({ onDone, onCancel, targetUserId }: {
  onDone: () => void; onCancel: () => void; targetUserId?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const busyRef = useRef(false)
  const doneRef = useRef(false)
  const [centerDone, setCenterDone] = useState(false)
  const [filled, setFilled] = useState<Set<Dir>>(new Set())
  const [hint, setHint] = useState('Look straight at the camera')

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: number | undefined

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(s => {
        stream = s
        if (videoRef.current) videoRef.current.srcObject = s
        timer = window.setInterval(tick, 850)
      })
      .catch(() => { toast.error('Camera blocked', 'Allow camera access, or ask a manager to register you.'); onCancel() })

    async function tick() {
      if (busyRef.current || doneRef.current) return
      const v = videoRef.current
      if (!v || !v.videoWidth) return
      busyRef.current = true
      try {
        const photo = grab(v)
        if (!centerDone) {
          const r = await enrollFrame(photo, 'center', targetUserId)
          if (r.matched && r.savedReference) { setCenterDone(true); setHint('Great — now slowly move your head around') }
          else if (r.reason) setHint(r.reason)
        } else {
          const r = await enrollFrame(photo, 'scan', targetUserId)
          const d = r.detected
          if (r.matched && d && (DIRS as readonly string[]).includes(d)) {
            setFilled(prev => {
              if (prev.has(d as Dir)) return prev
              const next = new Set(prev); next.add(d as Dir)
              if (next.size === DIRS.length) { doneRef.current = true; setHint('All done ✓'); window.setTimeout(onDone, 700) }
              else setHint(`Nice — ${DIRS.length - next.size} more direction${DIRS.length - next.size > 1 ? 's' : ''} to go`)
              return next
            })
          }
        }
      } catch { /* transient network/AWS blip — keep scanning */ }
      finally { busyRef.current = false }
    }

    return () => { if (timer) clearInterval(timer); stream?.getTracks().forEach(t => t.stop()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerDone])

  const progress = (centerDone ? 1 : 0) + filled.size   // out of 5

  return (
    <div className="space-y-4">
      <div className="relative mx-auto w-56 h-56 my-6">
        {/* Camera in a circle (mirrored like a selfie) */}
        <div className={`absolute inset-0 rounded-full overflow-hidden bg-black ring-4 transition-colors ${centerDone ? 'ring-green-500' : 'ring-brand-400'}`}>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
        </div>
        {/* Direction dots */}
        {DIRS.map(d => {
          const on = filled.has(d)
          return (
            <div key={d} style={{ top: POS[d].top, left: POS[d].left }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all
                ${on ? 'bg-green-500 border-green-500 text-white scale-110'
                     : centerDone ? 'bg-white border-brand-300 text-brand-500 animate-pulse'
                     : 'bg-white/70 border-gray-200 text-gray-300'}`}>
              <Sym name={on ? 'check' : ARROW[d]} size={18} />
            </div>
          )
        })}
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-brand-950">{hint}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{progress}/5 captured</p>
      </div>

      <div className="flex justify-center">
        <button onClick={onCancel}
          className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
      </div>
    </div>
  )
}
