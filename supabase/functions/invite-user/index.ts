// Supabase Edge Function: invite-user
// Called from UserManagementPage when admin invites a new staff member.
// Uses service role key to create the auth user and upsert profile.

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
    const { email, name, role, phone, whatsapp_number } = await req.json()

    if (!email || !name || !role) {
      return new Response(JSON.stringify({ error: 'email, name and role are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Invite user — generates magic-link email via Supabase Auth
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${SITE_URL}/login`,
      data: { name, role },
    })

    if (inviteErr) throw inviteErr

    const userId = inviteData.user?.id
    if (!userId) throw new Error('No user ID returned from invite')

    // Upsert profile row (will be created by trigger too, but set role/name/phone immediately)
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id:               userId,
      name,
      role,
      phone:            phone || null,
      whatsapp_number:  whatsapp_number || null,
      is_active:        true,
    }, { onConflict: 'id' })

    if (profileErr) {
      console.error('Profile upsert error (non-fatal):', profileErr.message)
    }

    console.log(`Invited user: ${email} (${userId})`)

    return new Response(
      JSON.stringify({ success: true, userId }),
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
