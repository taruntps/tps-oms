// src/pages/attendance/PlainCapture.tsx
import { useEffect, useRef, useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'

interface Props {
  onCapture: (jpegBase64: string) => void   // base64 WITHOUT the data: prefix
  onCancel: () => void
  busy?: boolean
  label?: string
}

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

export function PlainCapture({ onCapture, onCancel, busy, label = 'Capture' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(s => { stream = s; if (videoRef.current) { videoRef.current.srcObject = s; setReady(true) } })
      .catch(() => { toast.error('Camera blocked', 'Allow camera access, or use password / ask a manager.'); onCancel() })
    return () => { stream?.getTracks().forEach(t => t.stop()) }
  }, [onCancel])

  const shoot = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) { toast.error('Camera not ready', 'Wait a second and try again.'); return }
    onCapture(grab(v))
  }

  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] max-w-xs mx-auto">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      </div>
      <div className="flex gap-2 justify-center">
        <button onClick={onCancel} disabled={busy}
          className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
        <button onClick={shoot} disabled={!ready || busy}
          className="flex items-center gap-1.5 px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
          <Sym name="photo_camera" size={15} /> {busy ? 'Working…' : label}
        </button>
      </div>
    </div>
  )
}
