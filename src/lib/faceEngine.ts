// Face matching engine. Pure helpers here are unit-tested; the Human-backed
// descriptor extraction (browser-only, WebGL/WASM) is added in Task 3.

/** Cosine similarity in [0,1] (negative clamped to 0). 0 if shapes differ or empty. */
export function similarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (na === 0 || nb === 0) return 0
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb))
  return Math.max(0, cos)
}

/** True when the live descriptor matches the enrolled one at/above threshold. */
export function isMatch(live: number[], enrolled: number[], threshold: number): boolean {
  return similarity(live, enrolled) >= threshold
}

import type Human from '@vladmandic/human'

export const FACE_MODEL = 'human-faceres'

export type DescriptorResult =
  | { ok: true; descriptor: number[] }
  | { ok: false; reason: 'no_face' | 'multiple_faces' | 'low_quality' | 'engine' }

let _human: Human | null = null
let _loading: Promise<Human> | null = null

async function getHuman(): Promise<Human> {
  if (_human) return _human
  if (!_loading) {
    _loading = (async () => {
      const { Human } = await import('@vladmandic/human')
      const h = new (Human as any)({
        modelBasePath: '/models',
        cacheModels: true,
        // Only one face needed; lower minConfidence → faster first detection.
        face: {
          enabled: true,
          detector: { rotation: false, maxDetected: 1, minConfidence: 0.3, skipFrames: 0 },
          description: { enabled: true },
          mesh: { enabled: false }, iris: { enabled: false },
          emotion: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false },
        },
        body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false },
        // Tune for speed: smaller internal canvas.
        filter: { enabled: false },
      })
      await h.load()
      await h.warmup()
      return h
    })()
  }
  _human = await _loading
  return _human
}

/** Detect exactly one good face in the source and return its embedding. */
export async function getDescriptor(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
): Promise<DescriptorResult> {
  let h: Human
  try { h = await getHuman() } catch { return { ok: false, reason: 'engine' } }
  try {
    const res = await h.detect(source as any)
    const faces = res.face ?? []
    if (faces.length === 0) return { ok: false, reason: 'no_face' }
    if (faces.length > 1) return { ok: false, reason: 'multiple_faces' }
    const face = faces[0]
    const emb = face.embedding as number[] | undefined
    if (!emb || emb.length === 0 || (face.score ?? 0) < 0.5) return { ok: false, reason: 'low_quality' }
    return { ok: true, descriptor: Array.from(emb) }
  } catch { return { ok: false, reason: 'engine' } }
}

/**
 * Warm the engine in the background (load models + compile WebGL shaders) so the
 * first real capture is near-instant. Call on the Attendance page mount when
 * face-match is on. Safe to call repeatedly — getHuman() is cached.
 */
export function preloadFaceEngine(): void {
  void getHuman().catch(() => {})
}

/** Average several descriptors element-wise (used at enrolment for robustness). */
export function averageDescriptors(list: number[][]): number[] {
  if (list.length === 0) return []
  const n = list[0].length
  const out = new Array(n).fill(0)
  for (const d of list) for (let i = 0; i < n; i++) out[i] += d[i]
  return out.map(x => x / list.length)
}
