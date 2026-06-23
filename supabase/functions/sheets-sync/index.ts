// Edge Function: sheets-sync
// Secure bridge between Google Sheets and Supabase.
// The sheet sends a simple SYNC_TOKEN — the service role key never leaves Supabase.
//
// Actions:
//   GET  ?action=pull  → returns all clients as JSON
//   POST ?action=push  → imports client rows from the sheet

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SYNC_TOKEN        = Deno.env.get('SHEETS_SYNC_TOKEN')!  // set via Supabase secrets

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Auth: check x-sync-token header
  const token = req.headers.get('x-sync-token')
  if (!SYNC_TOKEN || token !== SYNC_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized — check your SYNC_TOKEN' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const action = new URL(req.url).searchParams.get('action')

  try {
    // ── PULL: return all clients with full FSSAI licence details ───────────
    if (req.method === 'GET' && action === 'pull') {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          company_name, gstin, gstin_is_placeholder,
          pan, contact_person, contact_phone, whatsapp_number, contact_email,
          state, city, notes,
          licenses(
            license_type, license_number, status, credential_username,
            categories, state_name, city, authorised_premises,
            issue_date, expiry_date
          )
        `)
        .order('company_name')
      if (error) throw error

      // Attach primary licence fields (active first, else first available)
      const enriched = (data ?? []).map((c: any) => {
        const lics: any[] = c.licenses ?? []
        const primary = lics.find((l: any) => l.status === 'active') ?? lics[0] ?? null
        return {
          ...c,
          lic_type:       primary?.license_type ?? '',
          lic_number:     primary?.license_number ?? '',
          lic_status:     primary?.status ?? '',
          lic_username:   primary?.credential_username ?? '',
          lic_categories: primary?.categories ? (Array.isArray(primary.categories) ? primary.categories.join(', ') : primary.categories) : '',
          lic_state:      primary?.state_name ?? '',
          lic_city:       primary?.city ?? '',
          lic_premises:   primary?.authorised_premises ?? '',
          lic_issue_date: primary?.issue_date ?? '',
          lic_expiry_date:primary?.expiry_date ?? '',
        }
      })

      return new Response(JSON.stringify(enriched), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── PUSH: import client rows from sheet ─────────────────────────────────
    if (req.method === 'POST' && action === 'push') {
      const rows: any[] = await req.json()
      const results = { imported: 0, skipped: 0, errors: [] as string[] }

      for (const row of rows) {
        const { error } = await supabase
          .from('clients')
          .upsert(row, { onConflict: 'gstin', ignoreDuplicates: true })
        if (error) {
          if (error.message.includes('idx_clients_gstin')) {
            results.skipped++
          } else {
            results.errors.push(error.message)
          }
        } else {
          results.imported++
        }
      }

      return new Response(JSON.stringify(results), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use ?action=pull or ?action=push' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
