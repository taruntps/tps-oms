// Edge (Deno) — billing-webhook: inbound provider events (GetSwipe).
// Server-side ONLY. Verifies X-Signature (HMAC via the adapter), dedupes on
// billing_webhook_events(provider,event_id), stores raw + signature_ok, and on
// valid payment/invoice events updates finance rows. Returns 200 fast even when
// deeper processing is deferred; returns 401 on bad signature.
//
// Conflict rule (design §7): provider WINS for statutory artifacts (irn/qr/pdf_url,
// serial, provider status); ERP wins for business data (amounts, party, lines).
// NO secrets in logs.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getProvider } from '../_shared/billing/factory.ts'
import { readBillingEnv } from '../_shared/billing/config.ts'
import type { WebhookEvent } from '../_shared/billing/interface.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature',
}

type Db = ReturnType<typeof createClient>

function headerMap(req: Request): Record<string, string> {
  const h: Record<string, string> = {}
  req.headers.forEach((v, k) => { h[k.toLowerCase()] = v })
  return h
}

/** Apply a verified event to the ERP finance rows (provider wins for statutory fields). */
async function applyEvent(db: Db, ev: WebhookEvent) {
  if (!ev.providerId) return
  const dbAny = db as any

  // Resolve the ERP invoice via the link table (provider_id → erp_id).
  const { data: link } = await dbAny
    .from('billing_provider_links')
    .select('erp_entity, erp_id')
    .eq('provider', ev.provider)
    .eq('provider_id', ev.providerId)
    .maybeSingle()

  if (!link) return // event for an entity we haven't linked yet — stored raw for later reconcile

  // Refresh the link's statutory artifacts (provider authoritative).
  const linkPatch: Record<string, unknown> = { last_synced_at: new Date().toISOString() }
  if (ev.providerSerial != null) linkPatch.provider_serial = ev.providerSerial
  if (ev.irn != null) linkPatch.irn = ev.irn
  if (ev.qr != null) linkPatch.qr = ev.qr
  if (ev.pdfUrl != null) linkPatch.pdf_url = ev.pdfUrl
  await dbAny
    .from('billing_provider_links')
    .update(linkPatch)
    .eq('provider', ev.provider)
    .eq('provider_id', ev.providerId)

  if (link.erp_entity === 'invoice') {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (ev.irn != null) patch.irn = ev.irn
    if (ev.qr != null) patch.qr_code = ev.qr
    if (ev.pdfUrl != null) patch.pdf_url = ev.pdfUrl
    if (ev.eventType === 'document.cancelled') patch.status = 'cancelled'
    else if (ev.paymentStatus === 'paid') patch.status = 'paid'
    else if (ev.paymentStatus === 'partial') patch.status = 'partially_paid'
    await dbAny.from('finance_invoices').update(patch).eq('id', link.erp_id)
  } else if (link.erp_entity === 'credit_note' && ev.eventType === 'document.cancelled') {
    await dbAny.from('finance_credit_notes').update({ status: 'cancelled' }).eq('id', link.erp_id)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors })

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const rawBody = await req.text()
  const headers = headerMap(req)

  const env = readBillingEnv()
  const provider = getProvider(env)

  // 1. Verify signature FIRST — reject bad signatures with 401.
  const signatureOk = provider.verifyWebhook(headers, rawBody)
  if (!signatureOk) {
    console.warn('[billing-webhook] rejected: bad or missing signature')
    return new Response(JSON.stringify({ error: 'invalid signature' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // 2. Parse to a normalized event.
  let ev: WebhookEvent
  try {
    ev = provider.parseWebhook(rawBody)
  } catch (err) {
    console.error('[billing-webhook] parse error', err instanceof Error ? err.message : String(err))
    // Signature was valid; ack 200 so the provider doesn't hammer retries on a parse issue.
    return json({ ok: true, note: 'unparseable' })
  }

  const dbAny = db as any

  // 3. Dedupe on (provider, event_id) — store raw + signature_ok.
  try {
    const { error: insErr } = await dbAny.from('billing_webhook_events').insert({
      provider: ev.provider,
      event_id: ev.eventId || crypto.randomUUID(),
      event_type: ev.eventType,
      signature_ok: true,
      raw: ev.raw ?? null,
    })
    if (insErr) {
      // Unique violation → already processed; ack fast.
      if (insErr.code === '23505') return json({ ok: true, deduped: true })
      console.error('[billing-webhook] store error', insErr.message)
      // Still ack 200 to avoid retry storms; row-less events surface in logs.
      return json({ ok: true, note: 'store_failed' })
    }
  } catch (err) {
    console.error('[billing-webhook] store exception', err instanceof Error ? err.message : String(err))
    return json({ ok: true, note: 'store_exception' })
  }

  // 4. Apply to finance rows (best-effort; return 200 regardless so provider is happy).
  try {
    await applyEvent(db, ev)
    await dbAny
      .from('billing_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('provider', ev.provider)
      .eq('event_id', ev.eventId || '')
  } catch (err) {
    console.error('[billing-webhook] apply error', err instanceof Error ? err.message : String(err))
    // Deferred: stored raw remains for a reconcile sweep.
  }

  return json({ ok: true })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
