import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error(
    'Missing Supabase credentials. Copy .env.example to .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

// "Remember me" storage: when the user opts out (tps_remember === 'false') the
// session lives in sessionStorage (cleared when the tab/browser closes); otherwise
// it persists in localStorage. The flag is set by the login form before sign-in.
// Access is guarded so this also works in non-browser environments (tests/SSR)
// where sessionStorage/localStorage are undefined — falling back to memory.
const memoryStore: Record<string, string> = {}
const ss = () => (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
const ls = () => (typeof localStorage !== 'undefined' ? localStorage : null)

const rememberStorage = {
  getItem(k: string) {
    return ss()?.getItem(k) ?? ls()?.getItem(k) ?? (k in memoryStore ? memoryStore[k] : null)
  },
  setItem(k: string, v: string) {
    const target = ls()?.getItem('tps_remember') === 'false' ? ss() : ls()
    if (target) target.setItem(k, v)
    else memoryStore[k] = v
  },
  removeItem(k: string) {
    ls()?.removeItem(k)
    ss()?.removeItem(k)
    delete memoryStore[k]
  },
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    storageKey: 'tps-oms-auth',
    autoRefreshToken: true,
    storage: rememberStorage,
  },
})

// ── Convenience: get current user's profile (role etc.) ─────────────────────
export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}
