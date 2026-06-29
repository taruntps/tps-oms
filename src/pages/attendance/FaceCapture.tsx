import { useRef, useEffect, useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { getDescriptor, averageDescriptors, type DescriptorResult } from '@/lib/faceEngine'

const REASON_MSG: Record<string, string> = {
  no_face: 'No face detected — center your face and retry.',
  multiple_faces: 'More than one face in frame — only you should be visible.',
  low_quality: 'Face unclear — move to better light and retry.',
  engine: 'Face engine failed to load — check your connection and retry.',
}

interface Props {
  title: string
  actionLabel: string
  busy?: boolean
  autoCapture?: boolean
  /**
   * Number of good frames to collect and average before calling onCapture.
   * Default = 1 (single frame, existing behaviour for punch/enrol).
   * Set to 3 for login — prevents a single lucky frame from passing.
   */
  captureFrames?: number
  onCapture: (result: { canvas: HTMLCanvasElement; descriptor: number[] }) => void | Promise<void>
  onCancel: () => void
}

export function FaceCapture({
  title, actionLabel, busy, autoCapture,
  captureFrames = 1,
  onCapture, onCancel,
}: Props) {
  const videoRef       = useRef<HTMLVideoElement>(null)
  const streamRef      = useRef<MediaStream | null>(null)
  const collectedRef   = useRef<number[][]>([])   // accumulated frame descriptors
  const [ready,        setReady]        = useState(false)
  const [working,      setWorking]      = useState(false)
  const [frameCount,   setFrameCount]   = useState(0)  // how many frames captured so far

  // Start camera
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}) }
        setReady(true)
      } catch (e: any) {
        const msg = e?.name === 'NotAllowedError' ? 'Camera is blocked for this site. Re-enable it, then retry.'
          : e?.name === 'NotFoundError' ? 'No camera found on this device.'
          : e?.name === 'NotReadableError' ? 'Camera is busy in another app — close it and retry.'
          : e?.message ?? 'Could not open the camera'
        toast.error('Camera error', msg); onCancel()
      }
    })()
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }, [])

  // Auto-capture: poll every 350ms. Collect captureFrames consecutive good frames,
  // average them, then fire onCapture once with the averaged descriptor.
  useEffect(() => {
    if (!autoCapture || !ready) return
    collectedRef.current = []
    setFrameCount(0)

    let cancelled = false
    let timerId: number
    const startMs = performance.now()
    const TIMEOUT = 12000   // 12s — more time because we now need 3 frames
    const POLL    = 350

    const poll = async () => {
      if (cancelled || working || busy) return
      if (performance.now() - startMs > TIMEOUT) {
        toast.error('Auto-scan timed out', 'Position your face clearly in good light and try again.')
        if (!cancelled) onCancel()
        return
      }
      const video = videoRef.current
      if (!video || !video.videoWidth) { timerId = window.setTimeout(poll, POLL); return }

      const canvas = snapshot(video)
      try {
        const res: DescriptorResult = await getDescriptor(canvas)
        if (cancelled) return

        if (res.ok) {
          collectedRef.current.push(res.descriptor)
          const collected = collectedRef.current.length
          setFrameCount(collected)

          if (collected < captureFrames) {
            // Need more frames — keep polling (250ms gap between frames so they're distinct)
            timerId = window.setTimeout(poll, 250)
            return
          }

          // All frames collected — average and fire
          const descriptor = captureFrames > 1
            ? averageDescriptors(collectedRef.current)
            : res.descriptor
          collectedRef.current = []
          setFrameCount(0)

          setWorking(true)
          try { await onCapture({ canvas, descriptor }) }
          catch (e: any) { toast.error('Capture failed', e.message); if (!cancelled) onCancel() }
          finally { setWorking(false) }
          return
        }
        // No/bad face detected — reset accumulated frames so we only accept N consecutive good ones
        if (collectedRef.current.length > 0) {
          collectedRef.current = []
          setFrameCount(0)
        }
      } catch { /* ignore detection error, retry */ }

      if (!cancelled) timerId = window.setTimeout(poll, POLL)
    }

    timerId = window.setTimeout(poll, 200)
    return () => { cancelled = true; clearTimeout(timerId) }
  }, [ready, autoCapture]) // eslint-disable-line react-hooks/exhaustive-deps

  const snapshot = (video: HTMLVideoElement): HTMLCanvasElement => {
    const max = 480
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(video.videoWidth * scale); c.height = Math.round(video.videoHeight * scale)
    c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height)
    return c
  }

  const onShoot = async () => {
    const video = videoRef.current
    if (!video || working || busy) return
    setWorking(true)
    try {
      const canvas = snapshot(video)
      const res: DescriptorResult = await getDescriptor(canvas)
      if (!res.ok) { toast.error('Try again', REASON_MSG[res.reason]); return }
      await onCapture({ canvas, descriptor: res.descriptor })
    } catch (e: any) {
      toast.error('Capture failed', e.message)
    } finally {
      setWorking(false)
    }
  }

  // Status text for the autoCapture bottom bar
  const statusText = (() => {
    if (working || busy) return 'Verifying…'
    if (captureFrames > 1 && frameCount > 0) return `Captured ${frameCount}/${captureFrames} — hold still…`
    return 'Scanning face…'
  })()

  return (
    <div className="fixed inset-0 bg-black/80 z-[70] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-black rounded-2xl overflow-hidden shadow-2xl">
        <div className="relative">
          <video ref={videoRef} playsInline muted className="w-full aspect-[3/4] object-cover bg-black" />
          {autoCapture && ready && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-48 h-48">
                <div className="absolute inset-0 rounded-full border-2 border-white/30 animate-ping" />
                <div className="absolute inset-2 rounded-full border-2 border-white/60" />
                {/* Progress dots when collecting multi-frame */}
                {captureFrames > 1 && (
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
                    {Array.from({ length: captureFrames }).map((_, i) => (
                      <span key={i}
                        className={`w-2 h-2 rounded-full transition-all duration-200 ${
                          i < frameCount ? 'bg-green-400 scale-125' : 'bg-white/30'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 p-4 bg-[#111]">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-white/20 text-white rounded-lg hover:bg-white/10">Cancel</button>
          {autoCapture ? (
            <div className="flex items-center gap-2.5">
              {(working || busy) ? (
                <Sym name="progress_activity" size={18} className="text-white animate-spin" />
              ) : (
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
              <span className="text-sm text-white font-medium">{statusText}</span>
            </div>
          ) : (
            <button onClick={onShoot} disabled={!ready || working || busy}
              className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {(working || busy) ? <Sym name="progress_activity" size={16} className="animate-spin" /> : <Sym name="photo_camera" size={16} />}
              {actionLabel}
            </button>
          )}
        </div>
      </div>
      <p className="text-white/60 text-xs mt-3">{title}</p>
    </div>
  )
}
