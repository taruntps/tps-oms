// ============================================================
// TPS OMS — Google Sheets ↔ Supabase Client Sync
//
// SETUP (one-time):
//   1. Open Google Sheet → Extensions → Apps Script
//   2. Paste this entire file → Save
//   3. Project Settings (gear) → Script Properties → Add:
//        SUPABASE_URL = https://muxwwvwmephtwghsrzbp.supabase.co
//        SUPABASE_KEY = <your Supabase service role key>
//   4. Run onOpen() once to grant permissions
//   5. Refresh your Sheet — "TPS Sync" menu appears
//
// SHEET STRUCTURE (Tab: "Clients"):
//   A  Company Name
//   B  GSTIN Available (Yes/No)
//   C  GSTIN
//   D  Contact Person
//   E  Phone
//   F  Email
//   G  State
//   H  District
//   I  FSSAI License No  (optional, 14 digits if filled)
//   J  FSSAI Valid Till  (optional, DD/MM/YYYY)
//   K  Notes
// ============================================================

const SHEET_NAME = 'Clients'
const LOG_SHEET  = 'Sync Log'

// ── Menu ──────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TPS Sync')
    .addItem('▶ Sync to Supabase', 'syncToSupabase')
    .addItem('⬇ Pull from Supabase', 'pullFromSupabase')
    .addToUi()
}

// ── Push: Sheet → Supabase ────────────────────────────────────────────────────

function syncToSupabase() {
  const props        = PropertiesService.getScriptProperties()
  const SUPABASE_URL = props.getProperty('SUPABASE_URL')
  const SUPABASE_KEY = props.getProperty('SUPABASE_KEY')

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    SpreadsheetApp.getUi().alert('Missing Script Properties: SUPABASE_URL and SUPABASE_KEY must be set.')
    return
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) { SpreadsheetApp.getUi().alert('Sheet "' + SHEET_NAME + '" not found.'); return }

  const lastRow = sheet.getLastRow()
  if (lastRow < 2) { SpreadsheetApp.getUi().alert('No data rows found (row 2 onward expected).'); return }

  const rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues()

  let imported = 0, skipped = 0, errors = 0
  const errorLog = []

  rows.forEach(function(row, idx) {
    const rowNum = idx + 2
    const companyName    = row[0]
    const gstinAvailable = row[1]
    const gstin          = row[2]
    const contactPerson  = row[3]
    const phone          = row[4]
    const email          = row[5]
    const state          = row[6]
    const district       = row[7]
    const fssaiLicNo     = row[8]
    const fssaiValidTill = row[9]
    const notes          = row[10]

    // Skip empty rows
    if (!companyName) { skipped++; return }

    // Normalise
    const name     = String(companyName).trim().toUpperCase()
    const hasGstin = String(gstinAvailable).trim().toLowerCase() === 'yes'
    let   finalGstin = hasGstin ? String(gstin).trim().toUpperCase() : ''
    const isPlaceholder = !hasGstin

    // Validate GSTIN when provided
    if (hasGstin && !/^[A-Z0-9]{15}$/.test(finalGstin)) {
      errorLog.push('Row ' + rowNum + ': Invalid GSTIN "' + finalGstin + '" — skipped')
      errors++; return
    }

    // Generate placeholder if no GSTIN
    if (!hasGstin) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      let suffix = ''
      for (var i = 0; i < 9; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
      finalGstin = 'NOGSTN' + suffix
    }

    // Validate FSSAI (optional, 14 digits if present)
    const fssai = String(fssaiLicNo).trim()
    if (fssai && !/^\d{14}$/.test(fssai)) {
      errorLog.push('Row ' + rowNum + ': Invalid FSSAI "' + fssai + '" — skipped')
      errors++; return
    }

    // Build payload
    const payload = {
      company_name:         name,
      contact_person:       String(contactPerson).trim(),
      contact_phone:        String(phone).trim(),
      contact_email:        String(email).trim(),
      state:                String(state).trim(),
      city:                 String(district).trim(),
      gstin:                finalGstin,
      gstin_is_placeholder: isPlaceholder,
      notes:                notes ? String(notes).trim() : null,
    }

    // POST to Supabase — ?on_conflict=gstin skips duplicates on real GSTINs
    const response = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/clients?on_conflict=gstin', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer':        'resolution=ignore-duplicates',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    })

    const code = response.getResponseCode()
    if (code === 201 || code === 200) {
      imported++
    } else {
      const body = response.getContentText()
      if (body.indexOf('idx_clients_gstin') !== -1) {
        errorLog.push('Row ' + rowNum + ': GSTIN ' + finalGstin + ' already exists — skipped')
        skipped++
      } else {
        errorLog.push('Row ' + rowNum + ': HTTP ' + code + ' — ' + body.substring(0, 120))
        errors++
      }
    }
  })

  writeLog(ss, 'PUSH', rows.length, imported, skipped, errors, errorLog)

  SpreadsheetApp.getUi().alert(
    '✅ Sync complete\n' +
    'Imported: ' + imported + '\n' +
    'Skipped:  ' + skipped  + '\n' +
    'Errors:   ' + errors   + '\n\n' +
    (errorLog.length ? 'See Sync Log tab for details.' : 'No errors.')
  )
}

// ── Pull: Supabase → Sheet ────────────────────────────────────────────────────

function pullFromSupabase() {
  const props        = PropertiesService.getScriptProperties()
  const SUPABASE_URL = props.getProperty('SUPABASE_URL')
  const SUPABASE_KEY = props.getProperty('SUPABASE_KEY')

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    SpreadsheetApp.getUi().alert('Missing Script Properties.')
    return
  }

  const response = UrlFetchApp.fetch(
    SUPABASE_URL + '/rest/v1/clients?select=company_name,gstin,gstin_is_placeholder,contact_person,contact_phone,contact_email,state,city,notes&order=company_name',
    {
      method: 'get',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      },
      muteHttpExceptions: true,
    }
  )

  if (response.getResponseCode() !== 200) {
    SpreadsheetApp.getUi().alert('Failed to fetch from Supabase:\n' + response.getContentText())
    return
  }

  const clients = JSON.parse(response.getContentText())
  const ss      = SpreadsheetApp.getActiveSpreadsheet()
  var   sheet   = ss.getSheetByName(SHEET_NAME)

  if (!sheet) sheet = ss.insertSheet(SHEET_NAME)

  // Clear data rows, keep header
  const lastRow = sheet.getLastRow()
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 11).clearContent()

  // Write header
  const header = [
    'Company Name', 'GSTIN Available (Yes/No)', 'GSTIN',
    'Contact Person', 'Phone', 'Email',
    'State', 'District', 'FSSAI License No', 'FSSAI Valid Till', 'Notes'
  ]
  sheet.getRange(1, 1, 1, header.length).setValues([header])
  sheet.getRange(1, 1, 1, header.length).setFontWeight('bold')

  if (clients.length === 0) {
    SpreadsheetApp.getUi().alert('No clients found in Supabase.')
    return
  }

  const dataRows = clients.map(function(c) {
    return [
      c.company_name,
      c.gstin_is_placeholder ? 'No' : 'Yes',
      c.gstin_is_placeholder ? '' : (c.gstin || ''),
      c.contact_person,
      c.contact_phone,
      c.contact_email,
      c.state,
      c.city,
      '',  // FSSAI — not pulled here (licenses are a separate table)
      '',
      c.notes || '',
    ]
  })

  sheet.getRange(2, 1, dataRows.length, 11).setValues(dataRows)
  writeLog(ss, 'PULL', clients.length, clients.length, 0, 0, [])

  SpreadsheetApp.getUi().alert('✅ Pulled ' + clients.length + ' clients from Supabase.')
}

// ── Sync Log ──────────────────────────────────────────────────────────────────

function writeLog(ss, direction, total, imported, skipped, errors, errorLines) {
  var logSheet = ss.getSheetByName(LOG_SHEET)
  if (!logSheet) {
    logSheet = ss.insertSheet(LOG_SHEET)
    logSheet.getRange(1, 1, 1, 6).setValues([['Timestamp', 'Direction', 'Total Rows', 'Imported', 'Skipped', 'Errors']])
    logSheet.getRange(1, 1, 1, 6).setFontWeight('bold')
  }

  const now     = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  const lastRow = logSheet.getLastRow()
  logSheet.getRange(lastRow + 1, 1, 1, 6).setValues([[now, direction, total, imported, skipped, errors]])

  if (errorLines.length > 0) {
    const errStart = logSheet.getLastRow() + 2
    logSheet.getRange(errStart, 1).setValue('--- Error details for run at ' + now + ' ---')
    errorLines.forEach(function(line, i) {
      logSheet.getRange(errStart + 1 + i, 1).setValue(line)
    })
  }
}
