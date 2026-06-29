// Supabase Edge Function: invite-user
// Supports two modes:
//   mode: 'invite' (default) — sends email magic-link invite
//   mode: 'create'           — creates user immediately with a password (no email sent)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_URL             = Deno.env.get('SITE_URL') ?? 'https://portal.tpsxpert.com'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { email, name, role, phone, whatsapp_number, mode, password } = await req.json()

    if (!email || !name || !role) {
      return new Response(JSON.stringify({ error: 'email, name and role are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const createMode = mode === 'create'

    if (createMode && (!password || password.length < 6)) {
      return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Authorization gate ──────────────────────────────────────────────────
    // verify_jwt only rejects requests with NO token — the public anon key is a
    // valid JWT, so we MUST verify the caller is a real, admin-role user here.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: { user: caller }, error: callerErr } = await supabase.auth.getUser(token)
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', caller.id).single()
    const callerRole = callerProfile?.role ?? ''
    if (!['super_admin', 'director', 'hr'].includes(callerRole)) {
      return new Response(JSON.stringify({ error: 'Forbidden — only an admin can create users' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    // Privilege-escalation guard: only a super_admin may mint another super_admin.
    if (role === 'super_admin' && callerRole !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Only a super_admin can assign the super_admin role' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    let userId: string

    if (createMode) {
      // Create user directly with password — no invite email sent
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,   // mark email as verified immediately
        user_metadata: { name, role },
      })
      if (error) throw error
      if (!data.user?.id) throw new Error('No user ID returned from createUser')
      userId = data.user.id
      console.log(`Created user directly: ${email} (${userId})`)
    } else {
      // Invite user — generates magic-link email via Supabase Auth
      const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${SITE_URL}/login`,
        data: { name, role },
      })
      if (inviteErr) throw inviteErr
      if (!inviteData.user?.id) throw new Error('No user ID returned from invite')
      userId = inviteData.user.id
      console.log(`Invited user: ${email} (${userId})`)
    }

    // Upsert profile row (sets role/name/phone immediately)
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id:               userId,
      email,                          // required NOT NULL column
      name,
      role,
      phone:            phone || null,
      whatsapp_number:  whatsapp_number || null,
      is_active:        true,
    }, { onConflict: 'id' })

    if (profileErr) {
      console.error('Profile upsert error (non-fatal):', profileErr.message)
    }

    return new Response(
      JSON.stringify({ success: true, userId, mode: createMode ? 'created' : 'invited' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('invite-user error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
