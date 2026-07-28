// Phase 2 — Storage migration: Blue (prod) -> Green (staging)
// Copies all objects in every bucket. Idempotent (upsert). Prod is READ-ONLY (download only).
//
// Run from the repo root:
//   BLUE_SERVICE_KEY=... GREEN_SERVICE_KEY=... node scripts/migrate-storage.mjs
//
// Get service-role keys:
//   Blue :  https://supabase.com/dashboard/project/muxwwvwmephtwghsrzbp/settings/api-keys
//   Green:  https://supabase.com/dashboard/project/gytscakgtsbxgdkbqhbx/settings/api-keys
// (Copy the `service_role` secret from each — NOT the anon key.)

import { createClient } from '@supabase/supabase-js'

const BLUE_URL = 'https://muxwwvwmephtwghsrzbp.supabase.co'
const GREEN_URL = 'https://gytscakgtsbxgdkbqhbx.supabase.co'
const BLUE_KEY = process.env.BLUE_SERVICE_KEY
const GREEN_KEY = process.env.GREEN_SERVICE_KEY

if (!BLUE_KEY || !GREEN_KEY) {
  console.error('ERROR: set BLUE_SERVICE_KEY and GREEN_SERVICE_KEY env vars (service_role secrets).')
  process.exit(1)
}

const blue = createClient(BLUE_URL, BLUE_KEY, { auth: { persistSession: false } })
const green = createClient(GREEN_URL, GREEN_KEY, { auth: { persistSession: false } })

async function listAll(client, bucket, prefix = '') {
  const out = []
  let offset = 0
  const limit = 100
  for (;;) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit, offset, sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`)
    if (!data || data.length === 0) break
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (!item.id) {
        out.push(...await listAll(client, bucket, path)) // folder -> recurse
      } else {
        out.push(path)
      }
    }
    if (data.length < limit) break
    offset += limit
  }
  return out
}

const { data: buckets, error: bErr } = await blue.storage.listBuckets()
if (bErr) { console.error('listBuckets (blue):', bErr.message); process.exit(1) }

let total = 0, copied = 0, failed = 0
for (const b of buckets) {
  // ensure bucket exists on Green
  const { data: gb } = await green.storage.getBucket(b.name)
  if (!gb) {
    const { error } = await green.storage.createBucket(b.name, { public: b.public })
    if (error) console.error(`createBucket ${b.name}:`, error.message)
    else console.log(`created bucket ${b.name} (public=${b.public})`)
  }
  const paths = await listAll(blue, b.name)
  console.log(`\n[${b.name}] ${paths.length} objects`)
  for (const p of paths) {
    total++
    const { data: file, error: dErr } = await blue.storage.from(b.name).download(p)
    if (dErr) { failed++; console.error(`  download FAIL ${b.name}/${p}: ${dErr.message}`); continue }
    const buf = Buffer.from(await file.arrayBuffer())
    const { error: uErr } = await green.storage.from(b.name).upload(p, buf, {
      upsert: true, contentType: file.type || undefined,
    })
    if (uErr) { failed++; console.error(`  upload FAIL ${b.name}/${p}: ${uErr.message}`); continue }
    copied++
    console.log(`  ok ${b.name}/${p}`)
  }
}
console.log(`\nDONE. total=${total} copied=${copied} failed=${failed}`)
process.exit(failed ? 1 : 0)
