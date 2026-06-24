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
const rememberStorage = {
  pick() {
    return localStorage.getItem('tps_remember') === 'false' ? sessionStorage : localStorage
  },
  getItem(k: string) {
    return sessionStorage.getItem(k) ?? localStorage.getItem(k)
  },
  setItem(k: string, v: string) {
    this.pick().setItem(k, v)
  },
  removeItem(k: string) {
    localStorage.removeItem(k)
    sessionStorage.removeItem(k)
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
