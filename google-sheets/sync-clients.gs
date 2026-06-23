// ============================================================
// TPS OMS — Google Sheets ↔ Supabase Client Sync (v2)
//
// SETUP (one-time, 2 minutes):
//   1. Extensions → Apps Script → paste this file → Save
//   2. Project Settings (gear) → Script Properties → Add TWO properties:
//        EDGE_URL   = https://muxwwvwmephtwghsrzbp.supabase.co/functions/v1/sheets-sync
//        SYNC_TOKEN = TPS2026SYNC
//   3. Run onOpen() once → grant permissions
//   4. Refresh your Sheet → "TPS Sync" menu appears
//
// No service role key needed — authentication is via the SYNC_TOKEN only.
// ============================================================

const SHEET_NAME = 'Clients'
const LOG_SHEET  = 'Sync Log'

// ── Menu ──────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TPS Sync')
    .addItem('▶ Sync to Supabase (Push)', 'syncToSupabase')
    .addItem('⬇ Pull from Supabase', 'pullFromSupabase')
    .addToUi()
}

// ── Push: Sheet → Supabase ────────────────────────────────────────────────────

function syncToSupabase() {
  const props    = PropertiesService.getScriptProperties()
  const EDGE_URL = props.getProperty('EDGE_URL')
  const TOKEN    = props.getProperty('SYNC_TOKEN')

  if (!EDGE_URL || !TOKEN) {
    SpreadsheetApp.getUi().alert('Missing Script Properties.\nAdd EDGE_URL and SYNC_TOKEN in Project Settings → Script Properties.')
    return
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) { SpreadsheetApp.getUi().alert('Sheet "' + SHEET_NAME + '" not found.'); return }

  const lastRow = sheet.getLastRow()
  if (lastRow < 2) { SpreadsheetApp.getUi().alert('No data rows found (data starts at row 2).'); return }

  const rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues()

  var clientsToSend = []
  var errorLog      = []
  var skipped       = 0

  rows.forEach(function(row, idx) {
    var rowNum       = idx + 2
    var companyName  = row[0]
    var gstinYesNo   = row[1]
    var gstin        = row[2]
    var contactPerson= row[3]
    var phone        = row[4]
    var email        = row[5]
    var state        = row[6]
    var district     = row[7]
    var notes        = row[10]

    if (!companyName) { skipped++; return }

    var name       = String(companyName).trim().toUpperCase()
    var hasGstin   = String(gstinYesNo).trim().toLowerCase() === 'yes'
    var finalGstin = hasGstin ? String(gstin).trim().toUpperCase() : ''

    // Validate real GSTIN
    if (hasGstin && !/^[A-Z0-9]{15}$/.test(finalGstin)) {
      errorLog.push('Row ' + rowNum + ': Invalid GSTIN "' + finalGstin + '" — skipped')
      skipped++; return
    }

    // Generate placeholder GSTIN
    if (!hasGstin) {
      var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      var suffix = ''
      for (var i = 0; i < 9; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
      finalGstin = 'NOGSTN' + suffix
    }

    // Validate FSSAI if present
    var fssai = String(row[8]).trim()
    if (fssai && !/^\d{14}$/.test(fssai)) {
      errorLog.push('Row ' + rowNum + ': Invalid FSSAI "' + fssai + '" (must be 14 digits) — skipped')
      skipped++; return
    }

    clientsToSend.push({
      company_name:         name,
      contact_person:       String(contactPerson).trim(),
      contact_phone:        String(phone).trim(),
      contact_email:        String(email).trim(),
      state:                String(state).trim(),
      city:                 String(district).trim(),
      gstin:                finalGstin,
      gstin_is_placeholder: !hasGstin,
      notes:                notes ? String(notes).trim() : null,
    })
  })

  if (clientsToSend.length === 0) {
    SpreadsheetApp.getUi().alert('No valid rows to sync.\n\nSkipped: ' + skipped + '\n\n' + errorLog.join('\n'))
    return
  }

  // Send to Edge Function
  var response = UrlFetchApp.fetch(EDGE_URL + '?action=push', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-token': TOKEN },
    payload: JSON.stringify(clientsToSend),
    muteHttpExceptions: true,
  })

  var code = response.getResponseCode()
  var body = response.getContentText()

  if (code !== 200) {
    SpreadsheetApp.getUi().alert('❌ Sync failed (HTTP ' + code + ')\n\n' + body)
    return
  }

  var result = JSON.parse(body)
  writeLog(ss, 'PUSH', rows.length, result.imported || 0, result.skipped || skipped, result.errors ? result.errors.length : 0, errorLog.concat(result.errors || []))

  SpreadsheetApp.getUi().alert(
    '✅ Sync complete!\n' +
    'Imported: ' + (result.imported || 0) + '\n' +
    'Skipped:  ' + ((result.skipped || 0) + skipped) + '\n' +
    'Errors:   ' + (result.errors ? result.errors.length : 0) + '\n\n' +
    (result.errors && result.errors.length ? 'See Sync Log tab for details.' : '')
  )
}

// ── Pull: Supabase → Sheet ────────────────────────────────────────────────────

function pullFromSupabase() {
  var props    = PropertiesService.getScriptProperties()
  var EDGE_URL = props.getProperty('EDGE_URL')
  var TOKEN    = props.getProperty('SYNC_TOKEN')

  if (!EDGE_URL || !TOKEN) {
    SpreadsheetApp.getUi().alert('Missing Script Properties.\nAdd EDGE_URL and SYNC_TOKEN in Project Settings → Script Properties.')
    return
  }

  var response = UrlFetchApp.fetch(EDGE_URL + '?action=pull', {
    method: 'get',
    headers: { 'x-sync-token': TOKEN },
    muteHttpExceptions: true,
  })

  var code = response.getResponseCode()
  if (code !== 200) {
    SpreadsheetApp.getUi().alert('❌ Pull failed (HTTP ' + code + ')\n\n' + response.getContentText())
    return
  }

  var clients = JSON.parse(response.getContentText())
  var ss      = SpreadsheetApp.getActiveSpreadsheet()
  var sheet   = ss.getSheetByName(SHEET_NAME)
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME)

  // Clear data, keep header
  var lastRow = sheet.getLastRow()
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 11).clearContent()

  // Write header
  var header = [
    'Company Name', 'GSTIN Available (Yes/No)', 'GSTIN',
    'Contact Person', 'Phone', 'Email',
    'State', 'District', 'FSSAI License No', 'FSSAI Valid Till', 'Notes'
  ]
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold')

  if (clients.length === 0) {
    SpreadsheetApp.getUi().alert('No clients found in Supabase.')
    return
  }

  var dataRows = clients.map(function(c) {
    return [
      c.company_name,
      c.gstin_is_placeholder ? 'No' : 'Yes',
      c.gstin_is_placeholder ? '' : (c.gstin || ''),
      c.contact_person,
      c.contact_phone,
      c.contact_email,
      c.state,
      c.city,
      '', '',   // FSSAI — separate table, not pulled here
      c.notes || '',
    ]
  })

  sheet.getRange(2, 1, dataRows.length, 11).setValues(dataRows)
  writeLog(ss, 'PULL', clients.length, clients.length, 0, 0, [])
  SpreadsheetApp.getUi().alert('✅ Pulled ' + clients.length + ' clients from Supabase.')
}

// ── Sync Log ──────────────────────────────────────────────────────────────────

function writeLog(ss, direction, total, imported, skipped, errors, errorLines) {
  var log = ss.getSheetByName(LOG_SHEET)
  if (!log) {
    log = ss.insertSheet(LOG_SHEET)
    log.getRange(1,1,1,6).setValues([['Timestamp','Direction','Total','Imported','Skipped','Errors']]).setFontWeight('bold')
  }
  var now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  log.getRange(log.getLastRow()+1, 1, 1, 6).setValues([[now, direction, total, imported, skipped, errors]])
  if (errorLines.length) {
    var start = log.getLastRow() + 2
    log.getRange(start, 1).setValue('--- Errors for ' + now + ' ---')
    errorLines.forEach(function(line, i) { log.getRange(start+1+i, 1).setValue(line) })
  }
}
