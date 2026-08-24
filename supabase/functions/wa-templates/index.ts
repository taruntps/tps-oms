// Lists the org's APPROVED WhatsApp message templates from Meta, with each template's
// exact structure (header type, body variable count, buttons). Powers the campaign
// template picker so admins never hand-match parameters. Token stays server-side.
// Resolves the WhatsApp Business Account id once (debug_token scopes → phone node →
// business-owned WABAs) and caches it in app_settings.whatsapp_waba_id.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const GV = 'v20.0'
const g = async (path: string, token: string) => { const r = await fetch(`https://graph.facebook.com/${GV}/${path}`, { headers: { Authorization: `Bearer ${token}` } }); return { ok: r.ok, body: await r.json() } }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const debug = new URL(req.url).searchParams.get('debug') === '1'
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: rows } = await admin.from('app_settings').select('key, value').in('key', ['whatsapp_api_key', 'whatsapp_phone_number_id', 'whatsapp_waba_id', 'whatsapp_business_id'])
  const cfg: Record<string, string> = Object.fromEntries((rows ?? []).map((r: any) => [r.key, r.value]))
  const token = cfg.whatsapp_api_key
  if (!token) return json({ error: 'No WhatsApp token configured' }, 400)

  let waba = cfg.whatsapp_waba_id
  const diag: any = {}
  if (!waba || debug) {
    try { const d = await (await fetch(`https://graph.facebook.com/${GV}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`)).json(); diag.debug_token = d; for (const s of (d?.data?.granular_scopes ?? [])) { if (Array.isArray(s.target_ids) && s.target_ids.length) { waba = waba || s.target_ids[0] } } } catch (e) { diag.debug_token_err = String(e) }
    if (cfg.whatsapp_phone_number_id) { const p = await g(`${cfg.whatsapp_phone_number_id}?fields=id,display_phone_number,verified_name,whatsapp_business_account`, token); diag.phone = p.body; const w = (p.body as any)?.whatsapp_business_account?.id; if (w) waba = waba || w }
    if (cfg.whatsapp_business_id) { const b = await g(`${cfg.whatsapp_business_id}/owned_whatsapp_business_accounts`, token); diag.owned = b.body; const w = (b.body as any)?.data?.[0]?.id; if (w) waba = waba || w }
    if (waba && waba !== cfg.whatsapp_waba_id) await admin.from('app_settings').upsert({ key: 'whatsapp_waba_id', value: waba }, { onConflict: 'key' })
  }
  if (debug) return json({ resolved_waba: waba ?? null, diag })
  if (!waba) return json({ error: 'Could not resolve WhatsApp Business Account id. Call ?debug=1 to inspect, or add whatsapp_waba_id to app_settings.' }, 400)

  const res = await g(`${waba}/message_templates?fields=name,language,status,category,components&limit=250`, token)
  if (!res.ok) return json({ error: (res.body as any)?.error?.message ?? 'Meta error', waba }, 400)
  const templates = ((res.body as any).data ?? []).map((t: any) => {
    const comps = t.components ?? []
    const body = comps.find((c: any) => c.type === 'BODY')
    const header = comps.find((c: any) => c.type === 'HEADER')
    const buttons = comps.find((c: any) => c.type === 'BUTTONS')
    const bodyText: string = body?.text ?? ''
    const idxs = [...bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]))
    return { name: t.name, language: t.language, status: t.status, category: t.category, headerType: header ? (header.format ?? 'TEXT') : null, bodyText, varCount: idxs.length ? Math.max(...idxs) : 0, hasButtons: !!buttons }
  })
  templates.sort((a: any, b: any) => a.name.localeCompare(b.name))
  return json({ waba, count: templates.length, templates })
})
