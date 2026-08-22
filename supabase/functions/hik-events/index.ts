// Hikvision face-terminal event ingest. Logs EVERY incoming request to hik_raw_events
// (diagnostics), maps the Employee No. to a portal user and inserts a punch (source=device).
// The terminal fires several events per scan, so punches are deduped two ways:
//   1) device_event_id = 'hik:'+serialNo (exact event replay)
//   2) one device punch per employee per MINUTE (pre-check + DB unique guard
//      uq_device_punch_minute; a race that slips past the pre-check is caught as 23505).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function firstMatch(body: string, keys: string[]): string | null {
  for (const k of keys) {
    const j = body.match(new RegExp('"' + k + '"\\s*:\\s*"?([^",}]+)"?'))
    if (j && j[1]) return j[1].trim()
    const x = body.match(new RegExp('<' + k + '>([^<]+)</' + k + '>'))
    if (x && x[1]) return x[1].trim()
  }
  return null
}
function toIso(dt: string | null): string {
  if (!dt) return new Date().toISOString()
  const hasTz = /[+-]\d{2}:?\d{2}$/.test(dt) || /Z$/.test(dt)
  const d = new Date(hasTz ? dt : dt.replace(' ', 'T') + '+05:30')
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

Deno.serve(async (req) => {
  const admin = createClient(SB_URL, SERVICE)
  const url = new URL(req.url)
  const ct = req.headers.get('content-type') ?? ''
  const body = await req.text().catch(() => '')

  let matched = false
  let note = req.method + ' ' + url.pathname + (url.search || '')
  try {
    const { data: sec } = await admin.from('app_settings').select('value').eq('key', 'hik_push_secret').maybeSingle()
    const secret = (sec as any)?.value
    const provided = url.searchParams.get('s') || url.searchParams.get('key') || req.headers.get('x-hik-secret') || url.pathname.split('/').pop()
    if (secret && provided === secret) {
      const emp = firstMatch(body, ['employeeNoString', 'employeeNo'])
      const dt = firstMatch(body, ['dateTime', 'time'])
      const serial = firstMatch(body, ['serialNo'])
      if (!emp) {
        note += ' | no_employee'
      } else {
        let prof: any = null
        const byHik = await admin.from('profiles').select('id').eq('hik_employee_no', emp).limit(1).maybeSingle()
        prof = byHik.data
        if (!prof) { const byCode = await admin.from('profiles').select('id').ilike('employee_code', emp).limit(1).maybeSingle(); prof = byCode.data }
        if (!prof) {
          note += ' | no_match:' + emp
        } else {
          const eventId = 'hik:' + (serial ?? (emp + ':' + (dt ?? '')))
          const iso = toIso(dt)
          const dup = await admin.from('attendance_punches').select('id').eq('device_event_id', eventId).maybeSingle()
          if (dup.data) { note += ' | dup' }
          else {
            // Same-minute dedup: keep one device punch per employee per minute.
            const at = new Date(iso)
            const mStart = new Date(at); mStart.setUTCSeconds(0, 0)
            const mEnd = new Date(mStart.getTime() + 60000)
            const sameMin = await admin.from('attendance_punches').select('id')
              .eq('user_id', prof.id).eq('source', 'device')
              .gte('punch_at', mStart.toISOString()).lt('punch_at', mEnd.toISOString())
              .limit(1).maybeSingle()
            if (sameMin.data) { note += ' | dup_minute' }
            else {
              const { error } = await admin.from('attendance_punches').insert({
                user_id: prof.id, punch_at: iso, within_fence: true, is_field: false,
                source: 'device', device_event_id: eventId, device_info: 'Hikvision terminal',
              })
              if (error) {
                // Unique guard (uq_device_punch_minute / device_event_id) caught a concurrent burst.
                if ((error as any).code === '23505') note += ' | dup_minute'
                else note += ' | insert_err:' + error.message
              } else { matched = true; note += ' | ok:' + emp }
            }
          }
        }
      }
    } else {
      note += ' | bad_secret(' + (provided ?? 'none') + ')'
    }
  } catch (e) { note += ' | err:' + String(e) }

  await admin.from('hik_raw_events').insert({ content_type: ct, body: body.slice(0, 4000), matched, note })
  return new Response('OK', { status: 200 })
})
