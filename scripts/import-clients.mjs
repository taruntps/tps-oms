// One-time client import script
// Run: node scripts/import-clients.mjs
import fs from 'fs'
import https from 'https'

const SUPABASE_URL = 'https://muxwwvwmephtwghsrzbp.supabase.co'
const CSV_PATH = '/Users/tarunsingh/Downloads/Client Data - Existing Client.csv'

// ── Minimal CSV parser (handles quoted fields with embedded newlines) ──────────
function parseCSV(text) {
  const rows = []
  let col = 0, inQuote = false, field = '', row = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuote) {
      if (ch === '"' && next === '"') { field += '"'; i++ }
      else if (ch === '"') { inQuote = false }
      else { field += ch }
    } else {
      if (ch === '"') { inQuote = true }
      else if (ch === ',') { row.push(field.trim()); field = ''; col++ }
      else if (ch === '\n') {
        row.push(field.trim()); field = ''; col = 0
        if (row.some(c => c)) rows.push(row)
        row = []
      } else { field += ch }
    }
  }
  if (field || row.length) { row.push(field.trim()); if (row.some(c => c)) rows.push(row) }
  return rows
}

// ── Parse date to YYYY-MM-DD ───────────────────────────────────────────────────
function toISO(d) {
  if (!d || !d.trim()) return null
  d = d.trim()
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  // DD-MM-YYYY or DD/MM/YYYY
  const m = d.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  return null
}

// ── Clean phone ────────────────────────────────────────────────────────────────
function cleanPhone(p) {
  if (!p) return null
  return p.replace(/\s+/g, '').replace(/[^0-9+]/g, '').slice(-10) || null
}

// ── State normalise ────────────────────────────────────────────────────────────
const stateMap = {
  'MAHARASTRA': 'Maharashtra', 'MAHARASHTRA': 'Maharashtra',
  'ANDHRA PRADESH': 'Andhra Pradesh', 'KARNATAKA': 'Karnataka',
  'KERALA': 'Kerala', 'DELHI': 'Delhi', 'GUJARAT': 'Gujarat',
  'HARYANA': 'Haryana', 'HIMACHAL PRADESH': 'Himachal Pradesh',
  'HIMACHAL': 'Himachal Pradesh', 'PUNJAB': 'Punjab',
  'RAJASTHAN': 'Rajasthan', 'TELANGANA': 'Telangana',
  'TAMIL NADU': 'Tamil Nadu', 'UTTAR PRADESH': 'Uttar Pradesh',
  'UTTARAKHAND': 'Uttarakhand', 'ASSAM': 'Assam',
  'WEST BENGAL': 'West Bengal', 'ODISHA': 'Odisha', 'ORISSA': 'Odisha',
  'MADHYA PRADESH': 'Madhya Pradesh', 'JAMMU & KASHMIR': 'Jammu & Kashmir',
  'BIHAR': 'Bihar', 'JHARKHAND': 'Jharkhand', 'GOA': 'Goa',
}
function normState(s) {
  if (!s) return 'Others'
  const u = s.trim().toUpperCase()
  return stateMap[u] || (s.trim().charAt(0).toUpperCase() + s.trim().slice(1).toLowerCase())
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path)
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search,
      method, headers: {
        'Content-Type': 'application/json',
        'apikey': token, 'Authorization': `Bearer ${token}`,
        'Prefer': 'return=representation',
      }
    }
    const r = https.request(opts, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    r.on('error', reject)
    if (body) r.write(JSON.stringify(body))
    r.end()
  })
}

async function main() {
  // ── Get service role key from env ──────────────────────────────────────────
  const envFile = fs.readFileSync('/Users/tarunsingh/Documents/Projects/tps-oms/.env.local', 'utf8')
  const srMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)
  if (!srMatch) {
    console.error('❌  SUPABASE_SERVICE_ROLE_KEY not found in .env.local')
    console.error('   Add it: SUPABASE_SERVICE_ROLE_KEY=eyJ...')
    process.exit(1)
  }
  const SERVICE_KEY = srMatch[1].trim()

  // ── Read & parse CSV ───────────────────────────────────────────────────────
  const raw = fs.readFileSync(CSV_PATH, 'utf8').replace(/\r/g, '')
  const rows = parseCSV(raw)
  const [header, ...dataRows] = rows
  console.log(`📄  Parsed ${dataRows.length} rows from CSV`)
  console.log('   Columns:', header)

  // Column indices
  const CI = {
    date: 0, company: 1, licNo: 2, validTill: 3,
    address: 4, state: 5, person: 6, phone: 7, email: 8, category: 9
  }

  // ── Delete existing test clients ───────────────────────────────────────────
  console.log('\n🗑️  Deleting existing test clients...')
  const delRes = await req('DELETE', '/rest/v1/clients?select=id', null, SERVICE_KEY)
  console.log(`   Deleted all existing clients (status: ${delRes.status})`)

  // ── Build client records (deduplicate by company_name) ─────────────────────
  const seen = new Set()
  const clients = []
  const licenseMap = [] // { companyName, licNo, validTill, issueDate, category }

  for (const row of dataRows) {
    const company = (row[CI.company] || '').trim().replace(/\n/g, ' ')
    if (!company) continue

    const email = (row[CI.email] || '').trim().replace(/\s+/g, '').toLowerCase()
    const phone = cleanPhone(row[CI.phone])
    const person = (row[CI.person] || '').trim().replace(/\n/g, ' ')
    const state = normState(row[CI.state])
    const address = (row[CI.address] || '').trim().replace(/\n/g, ' ')
    const licNo = (row[CI.licNo] || '').trim()
    const validTill = toISO(row[CI.validTill])
    const issueDate = toISO(row[CI.date])
    const category = (row[CI.category] || '').trim()

    // Always record license
    if (licNo) {
      licenseMap.push({ companyName: company, licNo, validTill, issueDate, category })
    }

    // Deduplicate clients (first occurrence wins)
    if (seen.has(company)) continue
    seen.add(company)

    clients.push({
      company_name: company,
      contact_person: person || 'N/A',
      contact_phone: phone || '0000000000',
      contact_email: email || null,
      state,
      city: '',
      notes: address,
      is_active: true,
    })
  }

  console.log(`\n📋  ${clients.length} unique clients to insert`)
  console.log(`📋  ${licenseMap.length} license records to insert`)

  // ── Insert clients in batches of 50 ───────────────────────────────────────
  const inserted = []
  const BATCH = 50
  for (let i = 0; i < clients.length; i += BATCH) {
    const batch = clients.slice(i, i + BATCH)
    const res = await req('POST', '/rest/v1/clients', batch, SERVICE_KEY)
    if (res.status >= 300) {
      console.error(`❌  Client batch ${i}-${i+BATCH} failed:`, JSON.stringify(res.body).slice(0, 200))
    } else {
      inserted.push(...(Array.isArray(res.body) ? res.body : []))
      process.stdout.write(`   Inserted clients ${i + 1}–${Math.min(i + BATCH, clients.length)}\r`)
    }
  }
  console.log(`\n✅  ${inserted.length} clients inserted`)

  // Build name → id map
  const nameToId = {}
  for (const c of inserted) nameToId[c.company_name] = c.id

  // ── Insert licenses ────────────────────────────────────────────────────────
  const licenses = []
  for (const { companyName, licNo, validTill, issueDate, category } of licenseMap) {
    const clientId = nameToId[companyName]
    if (!clientId) { console.warn(`   ⚠️  No client ID for: ${companyName}`); continue }

    const isExpired = validTill && new Date(validTill) < new Date()
    licenses.push({
      client_id: clientId,
      license_number: licNo,
      license_type: category || 'FSSAI License',
      issue_date: issueDate || null,
      expiry_date: validTill || null,
      status: isExpired ? 'expired' : 'active',
      authority_office: null,
    })
  }

  for (let i = 0; i < licenses.length; i += BATCH) {
    const batch = licenses.slice(i, i + BATCH)
    const res = await req('POST', '/rest/v1/licenses', batch, SERVICE_KEY)
    if (res.status >= 300) {
      console.error(`❌  License batch ${i}-${i+BATCH} failed:`, JSON.stringify(res.body).slice(0, 200))
    } else {
      process.stdout.write(`   Inserted licenses ${i + 1}–${Math.min(i + BATCH, licenses.length)}\r`)
    }
  }
  console.log(`\n✅  ${licenses.length} licenses inserted`)
  console.log('\n🎉  Import complete!')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
