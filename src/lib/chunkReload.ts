// Recover from stale dynamic-import chunks after a new deploy.
// When a new build ships, hashed chunk filenames change; a tab still running the
// old build throws "Failed to fetch dynamically imported module" the first time it
// navigates to a not-yet-loaded lazy route. Instead of the ErrorBoundary showing a
// scary crash, we reload once to pick up the fresh build.

const KEY = 'chunk_reload_at'
const COOLDOWN_MS = 15_000 // guard against reload loops if the chunk is genuinely broken

/** True when an error looks like a failed dynamic import / stale chunk. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = (err && typeof err === 'object' && 'message' in err ? (err as any).message : String(err ?? '')) as string
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Failed to fetch dynamically/i.test(msg)
}

/** Reload once to fetch the new build. Returns false (and does nothing) if we
 *  already reloaded within the cooldown — so a truly broken chunk surfaces the
 *  error instead of looping. */
export function reloadOnceForChunkError(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || '0')
    if (Date.now() - last < COOLDOWN_MS) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // sessionStorage unavailable — fall through and reload once.
  }
  window.location.reload()
  return true
}
