import fs from 'fs'

const CSV_PATH = '/Users/tarunsingh/Downloads/Client Data - Existing Client.csv'

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = []
  let inQuote = false, field = '', row = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i+1]
    if (inQuote) {
      if (ch === '"' && next === '"') { field += '"'; i++ }
      else if (ch === '"') { inQuote = false }
      else { field += (ch === '\n' ? ' ' : ch) }
    } else {
      if (ch === '"') { inQuote = true }
      else if (ch === ',') { row.push(field.trim()); field = '' }
      else if (ch === '\n') {
        row.push(field.trim()); field = ''
        if (row.some(c => c)) rows.push(row)
        row = []
      } else { field += ch }
    }
  }
  if (row.length) { row.push(field.trim()); if (row.some(c => c)) rows.push(row) }
  return rows
}

function toISO(d) {
  if (!d || !d.trim()) return null
  d = d.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  const m = d.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  return null
}

function cleanPhone(p) {
  if (!p) return '0000000000'
  const c = p.replace(/\s+/g,'').replace(/[^0-9]/g,'')
  return c.slice(-10).padStart(10,'0') || '0000000000'
}

const stateMap = {
  'MAHARASTRA':'Maharashtra','MAHARASHTRA':'Maharashtra',
  'ANDHRA PRADESH':'Andhra Pradesh','KARNATAKA':'Karnataka',
  'KERALA':'Kerala','DELHI':'Delhi','GUJARAT':'Gujarat',
  'HARYANA':'Haryana','HIMACHAL PRADESH':'Himachal Pradesh',
  'HIMACHAL':'Himachal Pradesh','PUNJAB':'Punjab',
  'RAJASTHAN':'Rajasthan','TELANGANA':'Telangana',
  'TAMIL NADU':'Tamil Nadu','UTTAR PRADESH':'Uttar Pradesh',
  'UTTARAKHAND':'Uttarakhand','ASSAM':'Assam',
  'WEST BENGAL':'West Bengal','ODISHA':'Odisha','ORISSA':'Odisha',
  'MADHYA PRADESH':'Madhya Pradesh','JAMMU & KASHMIR':'Jammu & Kashmir',
  'BIHAR':'Bihar','JHARKHAND':'Jharkhand','GOA':'Goa',
}
function normState(s) {
  if (!s) return 'Others'
  const u = s.trim().toUpperCase()
  return stateMap[u] || s.trim()
}

const q = s => s ? `'${s.replace(/'/g,"''").replace(/\s+/g,' ').trim()}'` : 'NULL'
const qd = d => d ? `'${d}'` : 'NULL'

const raw = fs.readFileSync(CSV_PATH, 'utf8').replace(/\r/g,'')
const [, ...dataRows] = parseCSV(raw)

const seen = new Set()
const clients = []
const licenses = []

for (const row of dataRows) {
  const company = (row[1]||'').replace(/\s+/g,' ').trim()
  if (!company) continue

  const licNo   = (row[2]||'').trim()
  const validTill = toISO(row[3])
  const address = (row[4]||'').replace(/\s+/g,' ').trim()
  const state   = normState(row[5])
  const person  = (row[6]||'').replace(/\s+/g,' ').trim() || 'N/A'
  const phone   = cleanPhone(row[7])
  const email   = (row[8]||'').replace(/\s+/g,'').toLowerCase() || null
  const category= (row[9]||'').trim()
  const issueDate = toISO(row[0])

  if (licNo) licenses.push({ company, licNo, validTill, issueDate, category })

  if (seen.has(company)) continue
  seen.add(company)
  clients.push({ company, person, phone, email, state, address })
}

// ── Generate SQL ──────────────────────────────────────────────────────────────
let sql = `-- Auto-generated import\nBEGIN;\n\n`
sql += `-- 1. Delete existing clients (cascades to licenses)\nDELETE FROM clients;\n\n`

// Clients INSERT
sql += `-- 2. Insert ${clients.length} clients\n`
sql += `INSERT INTO clients (company_name, contact_person, contact_phone, contact_email, state, city, notes, is_active) VALUES\n`
sql += clients.map(c =>
  `  (${q(c.company)}, ${q(c.person)}, '${c.phone}', ${q(c.email)}, ${q(c.state)}, '', ${q(c.address)}, true)`
).join(',\n')
sql += `;\n\n`

// Licenses INSERT using subselect for client_id
sql += `-- 3. Insert ${licenses.length} licenses\n`
for (const l of licenses) {
  const isExpired = l.validTill && new Date(l.validTill) < new Date()
  sql += `INSERT INTO licenses (client_id, license_number, license_type, issue_date, expiry_date, status)\n`
  sql += `  SELECT id, ${q(l.licNo)}, ${q(l.category||'FSSAI License')}, ${qd(l.issueDate)}, ${qd(l.validTill)}, '${isExpired?'expired':'active'}'\n`
  sql += `  FROM clients WHERE company_name = ${q(l.company)};\n`
}

sql += `\nCOMMIT;\n`

fs.writeFileSync('/tmp/import-clients.sql', sql)
console.log(`Generated SQL: ${clients.length} clients, ${licenses.length} licenses → /tmp/import-clients.sql`)
console.log(`SQL size: ${(sql.length/1024).toFixed(1)} KB`)
