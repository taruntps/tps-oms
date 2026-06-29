/**
 * Import clients from Google Sheet → Supabase
 * Sheet: https://docs.google.com/spreadsheets/d/1u16hWg-go3HUIpoxZloF9i7ZOc4OVLet38KW9qd9pyQ
 * Tab: Clients
 *
 * Columns (A–J):
 *   A = Company Name
 *   B = GSTIN Available (Yes/No)
 *   C = GSTIN
 *   D = PAN
 *   E = Contact Person
 *   F = Phone
 *   G = WhatsApp Number
 *   H = Email
 *   I = Client State
 *   J = Client District
 *
 * Run: node scripts/import-from-sheets.mjs
 */

import fs from 'fs'
import https from 'https'
import crypto from 'crypto'

const SPREADSHEET_ID = '1u16hWg-go3HUIpoxZloF9i7ZOc4OVLet38KW9qd9pyQ'
const SHEET_RANGE    = 'Clients!A1:J200'
const SA_JSON_PATH   = '/Users/tarunsingh/Downloads/tps-xperts-34cea7bc5fd4.json'
const SUPABASE_URL   = 'https://muxwwvwmephtwghsrzbp.supabase.co'

// ── JWT for Google service account ────────────────────────────────────────────
function base64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function getGoogleToken(sa) {
  const now   = Math.floor(Date.now() / 1000)
  const claim = { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: sa.token_uri, iat: now, exp: now + 3600 }
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify(claim))
  const sig = base64url(crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key: sa.private_key, padding: crypto.constants.RSA_PKCS1_PADDING }))
  const jwt = `${header}.${payload}.${sig}`

  return new Promise((resolve, reject) => {
    const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    const url  = new URL(sa.token_uri)
    const r = https.request({ hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        const j = JSON.parse(d)
        if (j.access_token) resolve(j.access_token)
        else reject(new Error('Token error: ' + JSON.stringify(j)))
      })
    })
    r.on('error', reject)
    r.write(body)
    r.end()
  })
}

// ── Generic HTTP helper ────────────────────────────────────────────────────────
function httpGet(urlStr, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const r = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'GET', headers }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }))
    })
    r.on('error', reject)
    r.end()
  })
}

function httpPost(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const url  = new URL(urlStr)
    const data = JSON.stringify(body)
    const r = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }) }
        catch { resolve({ status: res.statusCode, body: d }) }
      })
    })
    r.on('error', reject)
    r.write(data)
    r.end()
  })
}

function httpDelete(urlStr, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const r = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'DELETE', headers }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    r.on('error', reject)
    r.end()
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function cleanPhone(p) {
  if (!p) return null
  const digits = p.replace(/\D/g, '').slice(-10)
  return digits.length >= 10 ? digits : null
}

const STATE_MAP = {
  'MAHARASTRA': 'Maharashtra', 'MAHARASHTRA': 'Maharashtra',
  'ANDHRA PRADESH': 'Andhra Pradesh', 'ANDHRA': 'Andhra Pradesh',
  'NTR': 'Andhra Pradesh',
  'KARNATAKA': 'Karnataka', 'KERALA': 'Kerala',
  'DELHI': 'Delhi', 'NEW DELHI': 'Delhi',
  'GUJARAT': 'Gujarat', 'HARYANA': 'Haryana',
  'HIMACHAL PRADESH': 'Himachal Pradesh', 'HIMACHAL': 'Himachal Pradesh',
  'PUNJAB': 'Punjab', 'RAJASTHAN': 'Rajasthan',
  'TELANGANA': 'Telangana', 'TAMIL NADU': 'Tamil Nadu',
  'UTTAR PRADESH': 'Uttar Pradesh', 'UTTARAKHAND': 'Uttarakhand',
  'ASSAM': 'Assam', 'WEST BENGAL': 'West Bengal',
  'ODISHA': 'Odisha', 'ORISSA': 'Odisha',
  'MADHYA PRADESH': 'Madhya Pradesh', 'MADHYA': 'Madhya Pradesh',
  'JAMMU & KASHMIR': 'Jammu & Kashmir', 'BIHAR': 'Bihar',
  'JHARKHAND': 'Jharkhand', 'GOA': 'Goa', 'CHANDIGARH': 'Chandigarh',
}
function normState(s) {
  if (!s || !s.trim()) return 'Others'
  const u = s.trim().toUpperCase()
  return STATE_MAP[u] || (s.trim().charAt(0).toUpperCase() + s.trim().slice(1).toLowerCase())
}

function cell(row, idx) {
  return (row[idx] || '').toString().trim()
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Load SA credentials
  const sa = JSON.parse(fs.readFileSync(SA_JSON_PATH, 'utf8'))
  console.log('🔑  Service account:', sa.client_email)

  // 2. Get Supabase service key (check multiple env files / variable names)
  let SUPA_KEY = null
  const envFiles = [
    '/Users/tarunsingh/Documents/Projects/tps-oms/.env.local',
    '/Users/tarunsingh/Documents/Projects/tps-oms/.env',
  ]
  for (const f of envFiles) {
    if (!fs.existsSync(f)) continue
    const env = fs.readFileSync(f, 'utf8')
    const m = env.match(/(?:SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_SERVICE_KEY)=(.+)/)
    if (m) { SUPA_KEY = m[1].trim(); break }
  }
  if (!SUPA_KEY) {
    // Prompt user to paste it
    console.error('❌  Service role key not found in .env.local')
    console.error('\n   Please add this line to .env.local:')
    console.error('   SUPABASE_SERVICE_ROLE_KEY=eyJ...')
    console.error('\n   Get it from: https://supabase.com/dashboard/project/muxwwvwmephtwghsrzbp/settings/api')
    console.error('   (Project Settings → API → service_role key)\n')
    process.exit(1)
  }
  const supaHeaders = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }

  // 3. Get Google access token
  console.log('🔐  Getting Google OAuth token...')
  const token = await getGoogleToken(sa)
  console.log('✅  Token obtained')

  // 4. Read sheet data
  const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}`
  console.log('\n📊  Reading Google Sheet...')
  const sheetRes = await httpGet(sheetsUrl, { Authorization: `Bearer ${token}` })
  if (sheetRes.status !== 200) {
    console.error('❌  Sheets API error:', JSON.stringify(sheetRes.body))
    console.error('\nMake sure you shared the sheet with the service account:')
    console.error('   ', sa.client_email)
    process.exit(1)
  }

  const rows = sheetRes.body.values || []
  console.log(`📄  Got ${rows.length} rows (including header)`)
  if (rows.length < 2) { console.error('❌  No data rows found'); process.exit(1) }

  const [header, ...dataRows] = rows
  console.log('   Columns:', header.join(' | '))

  // 5. Map columns — A=0 B=1 C=2 D=3 E=4 F=5 G=6 H=7 I=8 J=9
  const COL = { company: 0, gstinYN: 1, gstin: 2, pan: 3, person: 4, phone: 5, whatsapp: 6, email: 7, state: 8, district: 9 }

  const clients = []
  const skipped = []

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const company = cell(row, COL.company)
    if (!company) continue   // skip blank rows

    const gstinYN   = cell(row, COL.gstinYN).toLowerCase()
    const gstin     = cell(row, COL.gstin) || null
    const pan       = cell(row, COL.pan) || null
    const person    = cell(row, COL.person) || 'N/A'
    const phone     = cleanPhone(cell(row, COL.phone))
    const whatsapp  = cleanPhone(cell(row, COL.whatsapp))
    const rawEmail  = cell(row, COL.email)
    const email     = rawEmail ? rawEmail.toLowerCase() : null
    const state     = normState(cell(row, COL.state))
    const city      = cell(row, COL.district) || null

    const gstinAvailable = gstinYN === 'yes'

    clients.push({
      company_name:        company,
      contact_person:      person,
      contact_phone:       phone || '0000000000',
      contact_email:       email || null,
      whatsapp_number:     whatsapp || null,
      gstin:               gstin || null,
      gstin_is_placeholder: !gstinAvailable,
      pan:                 pan || null,
      state,
      city:                city || null,
      is_active:           true,
    })
  }

  console.log(`\n📋  ${clients.length} clients to import`)
  if (skipped.length) console.log(`⚠️   ${skipped.length} rows skipped (no company name)`)

  // Preview first 3
  console.log('\nPreview (first 3):')
  clients.slice(0, 3).forEach((c, i) =>
    console.log(`  ${i+1}. ${c.company_name} | ${c.state} | ${c.city} | GSTIN: ${c.gstin || '—'} | ${c.contact_phone}`)
  )

  // 6. Clear existing clients (cascade handles FK)
  console.log('\n🗑️  Clearing existing clients...')
  const delRes = await httpDelete(`${SUPABASE_URL}/rest/v1/clients?id=neq.00000000-0000-0000-0000-000000000000`, { ...supaHeaders, Prefer: '' })
  console.log(`   Cleared (HTTP ${delRes.status})`)

  // 7. Insert in batches
  console.log('\n⬆️   Inserting clients...')
  const BATCH = 50
  let totalInserted = 0
  for (let i = 0; i < clients.length; i += BATCH) {
    const batch = clients.slice(i, i + BATCH)
    const res = await httpPost(`${SUPABASE_URL}/rest/v1/clients`, supaHeaders, batch)
    if (res.status >= 300) {
      console.error(`❌  Batch ${i}-${i+BATCH} failed (HTTP ${res.status}):`, JSON.stringify(res.body).slice(0, 300))
    } else {
      const inserted = Array.isArray(res.body) ? res.body.length : batch.length
      totalInserted += inserted
      console.log(`   ✓ Inserted rows ${i + 1}–${Math.min(i + BATCH, clients.length)}`)
    }
  }

  console.log(`\n✅  Done! ${totalInserted} clients inserted into Supabase`)
  console.log('🎉  Refresh the portal to see them.')
}

main().catch(e => { console.error('Fatal:', e.message || e); process.exit(1) })
