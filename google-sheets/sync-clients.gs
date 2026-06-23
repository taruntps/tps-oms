// ============================================================
// TPS OMS — Google Sheets ↔ Supabase Client Sync (v4)
// Full dropdowns: State, District, GSTIN, Licence Type/Status, FBO Categories
//
// SETUP: Script Properties → EDGE_URL + SYNC_TOKEN (already set)
// First-time: run setupDropdowns() from the menu to install all dropdowns.
// onEdit trigger auto-updates city dropdown when state is changed.
// ============================================================

var SHEET_NAME = 'Clients'
var LOG_SHEET  = 'Sync Log'

// ── Column indices (1-based) ───────────────────────────────────────────────────
var COL = {
  COMPANY:      1,
  GSTIN_YN:     2,
  GSTIN:        3,
  PAN:          4,
  CONTACT:      5,
  PHONE:        6,
  WHATSAPP:     7,
  EMAIL:        8,
  CLIENT_STATE: 9,
  CLIENT_CITY:  10,
  NOTES:        11,
  LIC_TYPE:     12,
  LIC_NUM:      13,
  LIC_STATUS:   14,
  FBO_CAT:      15,
  LIC_STATE:    16,
  LIC_CITY:     17,
  PREMISES:     18,
  ISSUE_DATE:   19,
  EXPIRY_DATE:  20,
}

var NUM_COLS = 20
var DROPDOWN_MAX_ROW = 1000  // dropdowns applied up to this row for future entries

// ── Reference data ─────────────────────────────────────────────────────────────
var LICENCE_TYPES    = ['Central Licence', 'State Licence', 'Registration Certificate']
var LICENCE_STATUSES = ['active', 'pending_approval', 'expired', 'suspended', 'cancelled']
var FBO_CATS = ['Manufacturer','Relabeller','Repacker','Importer','Retailer',
                'Wholesaler / Distributor','Storage Unit','Transporter',
                'Trade / Retail','E-commerce','Petty Food Business']

var INDIA_STATES = [{"state":"Andhra Pradesh","cities":["Alluri Sitarama Raju","Anakapalli","Ananthapuramu","Annamayya","Bapatla","Chittoor","Dr. B.R. Ambedkar Konaseema","East Godavari","Eluru","Guntur","Kakinada","Krishna","Kurnool","Nandyal","NTR","Palnadu","Parvathipuram Manyam","Prakasam","Sri Potti Sriramulu Nellore","Sri Sathya Sai","Srikakulam","Tirupati","Visakhapatnam","Vizianagaram","West Godavari","YSR Kadapa"]},{"state":"Arunachal Pradesh","cities":["Anjaw","Changlang","Dibang Valley","East Kameng","East Siang","Kamle","Kra Daadi","Kurung Kumey","Lepa Rada","Lohit","Longding","Lower Dibang Valley","Lower Siang","Lower Subansiri","Namsai","Pakke-Kessang","Papum Pare","Shi-Yomi","Siang","Tawang","Tirap","Upper Siang","Upper Subansiri","West Kameng","West Siang"]},{"state":"Assam","cities":["Bajali","Baksa","Barpeta","Biswanath","Bongaigaon","Cachar","Charaideo","Chirang","Darrang","Dhemaji","Dhubri","Dibrugarh","Dima Hasao","Goalpara","Golaghat","Hailakandi","Hojai","Jorhat","Kamrup","Kamrup Metropolitan","Karbi Anglong","Karimganj","Kokrajhar","Lakhimpur","Majuli","Morigaon","Nagaon","Nalbari","Sivasagar","Sonitpur","South Salmara-Mankachar","Tamulpur","Tinsukia","Udalguri","West Karbi Anglong"]},{"state":"Bihar","cities":["Araria","Arwal","Aurangabad","Banka","Begusarai","Bhagalpur","Bhojpur","Buxar","Darbhanga","East Champaran","Gaya","Gopalganj","Jamui","Jehanabad","Kaimur","Katihar","Khagaria","Kishanganj","Lakhisarai","Madhepura","Madhubani","Munger","Muzaffarpur","Nalanda","Nawada","Patna","Purnia","Rohtas","Saharsa","Samastipur","Saran","Sheikhpura","Sheohar","Sitamarhi","Siwan","Supaul","Vaishali","West Champaran"]},{"state":"Chhattisgarh","cities":["Balod","Baloda Bazar","Balrampur","Bastar","Bemetara","Bijapur","Bilaspur","Dantewada","Dhamtari","Durg","Gariaband","Gaurela-Pendra-Marwahi","Janjgir-Champa","Jashpur","Kabirdham","Kanker","Khairagarh-Chhuikhadan-Gandai","Kondagaon","Korba","Koriya","Mahasamund","Manendragarh-Chirmiri-Bharatpur","Mohla-Manpur-Ambagarh Chowki","Mungeli","Narayanpur","Raigarh","Raipur","Rajnandgaon","Sakti","Sarangarh-Bilaigarh","Sukma","Surajpur","Surguja"]},{"state":"Goa","cities":["North Goa","South Goa"]},{"state":"Gujarat","cities":["Ahmedabad","Amreli","Anand","Aravalli","Banaskantha","Bharuch","Bhavnagar","Botad","Chhota Udaipur","Dahod","Dang","Devbhoomi Dwarka","Gandhinagar","Gir Somnath","Jamnagar","Junagadh","Kheda","Kutch","Mahisagar","Mehsana","Morbi","Narmada","Navsari","Panchmahal","Patan","Porbandar","Rajkot","Sabarkantha","Surat","Surendranagar","Tapi","Vadodara","Valsad"]},{"state":"Haryana","cities":["Ambala","Bhiwani","Charkhi Dadri","Faridabad","Fatehabad","Gurugram","Hisar","Jhajjar","Jind","Kaithal","Karnal","Kurukshetra","Mahendragarh","Nuh","Palwal","Panchkula","Panipat","Rewari","Rohtak","Sirsa","Sonipat","Yamunanagar"]},{"state":"Himachal Pradesh","cities":["Bilaspur","Chamba","Hamirpur","Kangra","Kinnaur","Kullu","Lahaul and Spiti","Mandi","Shimla","Sirmaur","Solan","Una"]},{"state":"Jharkhand","cities":["Bokaro","Chatra","Deoghar","Dhanbad","Dumka","East Singhbhum","Garhwa","Giridih","Godda","Gumla","Hazaribag","Jamtara","Khunti","Koderma","Latehar","Lohardaga","Pakur","Palamu","Ramgarh","Ranchi","Sahebganj","Seraikela Kharsawan","Simdega","West Singhbhum"]},{"state":"Karnataka","cities":["Bagalkot","Ballari","Belagavi","Bengaluru Rural","Bengaluru Urban","Bidar","Chamarajanagar","Chikkaballapura","Chikkamagaluru","Chitradurga","Dakshina Kannada","Davangere","Dharwad","Gadag","Hassan","Haveri","Kalaburagi","Kodagu","Kolar","Koppal","Mandya","Mysuru","Raichur","Ramanagara","Shivamogga","Tumakuru","Udupi","Uttara Kannada","Vijayapura","Vijayanagara","Yadgir"]},{"state":"Kerala","cities":["Alappuzha","Ernakulam","Idukki","Kannur","Kasaragod","Kollam","Kottayam","Kozhikode","Malappuram","Palakkad","Pathanamthitta","Thiruvananthapuram","Thrissur","Wayanad"]},{"state":"Madhya Pradesh","cities":["Agar Malwa","Alirajpur","Anuppur","Ashoknagar","Balaghat","Barwani","Betul","Bhind","Bhopal","Burhanpur","Chhatarpur","Chhindwara","Damoh","Datia","Dewas","Dhar","Dindori","Guna","Gwalior","Harda","Hoshangabad","Indore","Jabalpur","Jhabua","Katni","Khandwa","Khargone","Maihar","Mandla","Mandsaur","Morena","Narsinghpur","Neemuch","Niwari","Panna","Raisen","Rajgarh","Ratlam","Rewa","Sagar","Satna","Sehore","Seoni","Shahdol","Shajapur","Sheopur","Shivpuri","Sidhi","Singrauli","Tikamgarh","Ujjain","Umaria","Vidisha"]},{"state":"Maharashtra","cities":["Ahmednagar","Akola","Amravati","Aurangabad","Beed","Bhandara","Buldhana","Chandrapur","Dhule","Gadchiroli","Gondia","Hingoli","Jalgaon","Jalna","Kolhapur","Latur","Mumbai City","Mumbai Suburban","Nagpur","Nanded","Nandurbar","Nashik","Osmanabad","Palghar","Parbhani","Pune","Raigad","Ratnagiri","Sangli","Satara","Sindhudurg","Solapur","Thane","Wardha","Washim","Yavatmal"]},{"state":"Manipur","cities":["Bishnupur","Chandel","Churachandpur","Imphal East","Imphal West","Jiribam","Kakching","Kamjong","Kangpokpi","Noney","Pherzawl","Senapati","Tamenglong","Tengnoupal","Thoubal","Ukhrul"]},{"state":"Meghalaya","cities":["East Garo Hills","East Jaintia Hills","East Khasi Hills","Eastern West Khasi Hills","North Garo Hills","Ri Bhoi","South Garo Hills","South West Garo Hills","South West Khasi Hills","West Garo Hills","West Jaintia Hills","West Khasi Hills"]},{"state":"Mizoram","cities":["Aizawl","Champhai","Hnahthial","Khawzawl","Kolasib","Lawngtlai","Lunglei","Mamit","Saitual","Serchhip","Siaha"]},{"state":"Nagaland","cities":["Chumoukedima","Dimapur","Kiphire","Kohima","Longleng","Mokokchung","Mon","Niuland","Noklak","Peren","Phek","Shamator","Tseminyu","Tuensang","Wokha","Zunheboto"]},{"state":"Odisha","cities":["Angul","Balangir","Balasore","Bargarh","Bhadrak","Boudh","Cuttack","Deogarh","Dhenkanal","Gajapati","Ganjam","Jagatsinghpur","Jajpur","Jharsuguda","Kalahandi","Kandhamal","Kendrapara","Kendujhar","Khordha","Koraput","Malkangiri","Mayurbhanj","Nabarangpur","Nayagarh","Nuapada","Puri","Rayagada","Sambalpur","Subarnapur","Sundargarh"]},{"state":"Punjab","cities":["Amritsar","Barnala","Bathinda","Faridkot","Fatehgarh Sahib","Fazilka","Ferozepur","Gurdaspur","Hoshiarpur","Jalandhar","Kapurthala","Ludhiana","Malerkotla","Mansa","Moga","Mohali (SAS Nagar)","Muktsar","Pathankot","Patiala","Rupnagar","Sangrur","Shaheed Bhagat Singh Nagar","Tarn Taran"]},{"state":"Rajasthan","cities":["Ajmer","Alwar","Banswara","Baran","Barmer","Bharatpur","Bhilwara","Bikaner","Bundi","Chittorgarh","Churu","Dausa","Dholpur","Dungarpur","Ganganagar","Hanumangarh","Jaipur","Jaisalmer","Jalore","Jhalawar","Jhunjhunu","Jodhpur","Karauli","Kota","Nagaur","Pali","Pratapgarh","Rajsamand","Sawai Madhopur","Sikar","Sirohi","Tonk","Udaipur"]},{"state":"Sikkim","cities":["East Sikkim","Gyalshing","Namchi","Pakyong","Soreng","North Sikkim"]},{"state":"Tamil Nadu","cities":["Ariyalur","Chengalpattu","Chennai","Coimbatore","Cuddalore","Dharmapuri","Dindigul","Erode","Kallakurichi","Kancheepuram","Kanyakumari","Karur","Krishnagiri","Madurai","Mayiladuthurai","Nagapattinam","Namakkal","Nilgiris","Perambalur","Pudukkottai","Ramanathapuram","Ranipet","Salem","Sivaganga","Tenkasi","Thanjavur","Theni","Thoothukudi","Tiruchirappalli","Tirunelveli","Tirupathur","Tiruppur","Tiruvallur","Tiruvannamalai","Tiruvarur","Vellore","Villupuram","Virudhunagar"]},{"state":"Telangana","cities":["Adilabad","Bhadradri Kothagudem","Hanumakonda","Hyderabad","Jagtial","Jangaon","Jayashankar Bhupalpally","Jogulamba Gadwal","Kamareddy","Karimnagar","Khammam","Kumuram Bheem","Mahabubabad","Mahabubnagar","Mancherial","Medak","Medchal-Malkajgiri","Mulugu","Nagarkurnool","Nalgonda","Narayanpet","Nirmal","Nizamabad","Peddapalli","Rajanna Sircilla","Rangareddy","Sangareddy","Siddipet","Suryapet","Vikarabad","Wanaparthy","Warangal","Yadadri Bhuvanagiri"]},{"state":"Tripura","cities":["Dhalai","Gomati","Khowai","North Tripura","Sepahijala","South Tripura","Unakoti","West Tripura"]},{"state":"Uttar Pradesh","cities":["Agra","Aligarh","Ambedkar Nagar","Amethi","Amroha","Auraiya","Ayodhya","Azamgarh","Baghpat","Bahraich","Ballia","Balrampur","Banda","Barabanki","Bareilly","Basti","Bhadohi","Bijnor","Budaun","Bulandshahr","Chandauli","Chitrakoot","Deoria","Etah","Etawah","Farrukhabad","Fatehpur","Firozabad","Gautam Buddha Nagar","Ghaziabad","Ghazipur","Gonda","Gorakhpur","Hamirpur","Hapur","Hardoi","Hathras","Jalaun","Jaunpur","Jhansi","Kannauj","Kanpur Dehat","Kanpur Nagar","Kasganj","Kaushambi","Kheri","Kushinagar","Lalitpur","Lucknow","Maharajganj","Mahoba","Mainpuri","Mathura","Mau","Meerut","Mirzapur","Moradabad","Muzaffarnagar","Pilibhit","Prayagraj","Rae Bareli","Rampur","Saharanpur","Sambhal","Sant Kabir Nagar","Shahjahanpur","Shamli","Shravasti","Siddharthnagar","Sitapur","Sonbhadra","Sultanpur","Unnao","Varanasi"]},{"state":"Uttarakhand","cities":["Almora","Bageshwar","Chamoli","Champawat","Dehradun","Haridwar","Nainital","Pauri Garhwal","Pithoragarh","Rudraprayag","Tehri Garhwal","Udham Singh Nagar","Uttarkashi"]},{"state":"West Bengal","cities":["Alipurduar","Bankura","Birbhum","Cooch Behar","Dakshin Dinajpur","Darjeeling","Hooghly","Howrah","Jalpaiguri","Jhargram","Kalimpong","Kolkata","Malda","Murshidabad","Nadia","North 24 Parganas","Paschim Bardhaman","Paschim Medinipur","Purba Bardhaman","Purba Medinipur","Purulia","South 24 Parganas","Uttar Dinajpur"]},{"state":"Andaman & Nicobar Islands","cities":["Nicobar","North and Middle Andaman","South Andaman"]},{"state":"Chandigarh","cities":["Chandigarh"]},{"state":"Dadra & Nagar Haveli and Daman & Diu","cities":["Dadra and Nagar Haveli","Daman","Diu"]},{"state":"Delhi","cities":["Central Delhi","East Delhi","New Delhi","North Delhi","North East Delhi","North West Delhi","Shahdara","South Delhi","South East Delhi","South West Delhi","West Delhi"]},{"state":"Jammu & Kashmir","cities":["Anantnag","Bandipora","Baramulla","Budgam","Doda","Ganderbal","Jammu","Kathua","Kishtwar","Kulgam","Kupwara","Poonch","Pulwama","Rajouri","Ramban","Reasi","Samba","Shopian","Srinagar","Udhampur"]},{"state":"Ladakh","cities":["Kargil","Leh"]},{"state":"Lakshadweep","cities":["Lakshadweep"]},{"state":"Puducherry","cities":["Karaikal","Mahe","Puducherry","Yanam"]}]

var STATE_NAMES = INDIA_STATES.map(function(s) { return s.state })

// ── Menu ──────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TPS Sync')
    .addItem('⬇ Pull from Supabase', 'pullFromSupabase')
    .addItem('▶ Push to Supabase', 'syncToSupabase')
    .addSeparator()
    .addItem('⚙ Setup Dropdowns', 'runSetupDropdowns')
    .addToUi()
}

// ── Auto-update city dropdown when state changes ───────────────────────────────

function onEdit(e) {
  var sheet = e.range.getSheet()
  if (sheet.getName() !== SHEET_NAME) return
  var col = e.range.getColumn()
  var row = e.range.getRow()
  if (row === 1) return

  if (col === COL.CLIENT_STATE) updateCityDropdown(sheet, row, COL.CLIENT_CITY, e.value)
  if (col === COL.LIC_STATE)    updateCityDropdown(sheet, row, COL.LIC_CITY,    e.value)
}

function updateCityDropdown(sheet, row, cityCol, stateName) {
  var stateData = null
  for (var i = 0; i < INDIA_STATES.length; i++) {
    if (INDIA_STATES[i].state === stateName) { stateData = INDIA_STATES[i]; break }
  }
  var cityCell = sheet.getRange(row, cityCol)
  cityCell.clearContent()
  if (stateData && stateData.cities.length) {
    cityCell.setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(stateData.cities, true)
        .setAllowInvalid(false)
        .build()
    )
  } else {
    cityCell.clearDataValidations()
  }
}

// ── Push: Sheet → Supabase ────────────────────────────────────────────────────

function syncToSupabase() {
  var props    = PropertiesService.getScriptProperties()
  var EDGE_URL = props.getProperty('EDGE_URL')
  var TOKEN    = props.getProperty('SYNC_TOKEN')
  if (!EDGE_URL || !TOKEN) { SpreadsheetApp.getUi().alert('Add EDGE_URL and SYNC_TOKEN in Script Properties.'); return }

  var ss    = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) { SpreadsheetApp.getUi().alert('Sheet "Clients" not found.'); return }
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) { SpreadsheetApp.getUi().alert('No data rows found.'); return }

  var rows = sheet.getRange(2, 1, lastRow - 1, NUM_COLS).getValues()
  var clientsToSend = [], errorLog = [], skipped = 0

  rows.forEach(function(row, idx) {
    var rowNum = idx + 2
    if (!row[COL.COMPANY - 1]) { skipped++; return }

    var name     = String(row[COL.COMPANY  - 1]).trim().toUpperCase()
    var hasGstin = String(row[COL.GSTIN_YN - 1]).trim().toLowerCase() === 'yes'
    var gstin    = hasGstin ? String(row[COL.GSTIN - 1]).trim().toUpperCase() : ''

    if (hasGstin && !/^[A-Z0-9]{15}$/.test(gstin)) {
      errorLog.push('Row ' + rowNum + ': Invalid GSTIN — skipped'); skipped++; return
    }
    if (!hasGstin) {
      var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', suffix = ''
      for (var i = 0; i < 9; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
      gstin = 'NOGSTN' + suffix
    }

    clientsToSend.push({
      company_name:         name,
      gstin:                gstin,
      gstin_is_placeholder: !hasGstin,
      pan:                  String(row[COL.PAN      - 1]).trim() || null,
      contact_person:       String(row[COL.CONTACT  - 1]).trim(),
      contact_phone:        String(row[COL.PHONE    - 1]).trim(),
      whatsapp_number:      String(row[COL.WHATSAPP - 1]).trim() || null,
      contact_email:        String(row[COL.EMAIL    - 1]).trim(),
      state:                String(row[COL.CLIENT_STATE - 1]).trim(),
      city:                 String(row[COL.CLIENT_CITY  - 1]).trim(),
      notes:                String(row[COL.NOTES - 1]).trim() || null,
    })
  })

  if (!clientsToSend.length) { SpreadsheetApp.getUi().alert('No valid rows.\n' + errorLog.join('\n')); return }

  var res = UrlFetchApp.fetch(EDGE_URL + '?action=push', {
    method: 'post', contentType: 'application/json',
    headers: { 'x-sync-token': TOKEN },
    payload: JSON.stringify(clientsToSend), muteHttpExceptions: true,
  })
  if (res.getResponseCode() !== 200) { SpreadsheetApp.getUi().alert('❌ Failed: ' + res.getContentText()); return }
  var r = JSON.parse(res.getContentText())
  writeLog(ss, 'PUSH', rows.length, r.imported||0, (r.skipped||0)+skipped, r.errors?r.errors.length:0, errorLog)
  SpreadsheetApp.getUi().alert('✅ Done!\nImported: '+(r.imported||0)+'\nSkipped: '+((r.skipped||0)+skipped))
}

// ── Pull: Supabase → Sheet ────────────────────────────────────────────────────

function pullFromSupabase() {
  var props    = PropertiesService.getScriptProperties()
  var EDGE_URL = props.getProperty('EDGE_URL')
  var TOKEN    = props.getProperty('SYNC_TOKEN')
  if (!EDGE_URL || !TOKEN) { SpreadsheetApp.getUi().alert('Add EDGE_URL and SYNC_TOKEN in Script Properties.'); return }

  var res = UrlFetchApp.fetch(EDGE_URL + '?action=pull', {
    method: 'get', headers: { 'x-sync-token': TOKEN }, muteHttpExceptions: true,
  })
  if (res.getResponseCode() !== 200) { SpreadsheetApp.getUi().alert('❌ Failed: ' + res.getContentText()); return }

  var clients = JSON.parse(res.getContentText())
  var ss    = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME)

  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow()-1, NUM_COLS).clearContent()

  // Write header
  sheet.getRange(1, 1, 1, NUM_COLS).setValues([[
    'Company Name','GSTIN Available (Yes/No)','GSTIN','PAN',
    'Contact Person','Phone','WhatsApp Number','Email',
    'Client State','Client District','Notes',
    'Licence Type','Licence Number','Licence Status','FBO Categories',
    'Licence State','Licence District','Authorised Premises',
    'Issue Date','Expiry Date (Valid Till)'
  ]]).setFontWeight('bold')

  if (!clients.length) {
    SpreadsheetApp.getUi().alert('No clients found.')
    return
  }

  var dataRows = clients.map(function(c) {
    return [
      c.company_name   ||'',
      c.gstin_is_placeholder ? 'No':'Yes',
      c.gstin_is_placeholder ? '':(c.gstin||''),
      c.pan            ||'', c.contact_person  ||'',
      c.contact_phone  ||'', c.whatsapp_number ||'',
      c.contact_email  ||'', c.state           ||'',
      c.city           ||'', c.notes           ||'',
      c.lic_type       ||'', c.lic_number      ||'',
      c.lic_status     ||'', c.lic_categories  ||'',
      c.lic_state      ||'', c.lic_city        ||'',
      c.lic_premises   ||'', c.lic_issue_date  ||'',
      c.lic_expiry_date||'',
    ]
  })

  sheet.getRange(2, 1, dataRows.length, NUM_COLS).setValues(dataRows)

  // Apply all dropdowns (static + per-row city)
  applyAllDropdowns(sheet, 2, dataRows.length)

  writeLog(ss, 'PULL', clients.length, clients.length, 0, 0, [])
  SpreadsheetApp.getUi().alert('✅ Pulled ' + clients.length + ' clients. Dropdowns applied.')
}

// ── Dropdown setup ─────────────────────────────────────────────────────────────

function runSetupDropdowns() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) { SpreadsheetApp.getUi().alert('Pull data first — sheet "Clients" not found.'); return }
  var lastRow = Math.max(sheet.getLastRow(), 2)
  applyAllDropdowns(sheet, 2, lastRow - 1)
  SpreadsheetApp.getUi().alert('✅ Dropdowns applied to all rows.')
}

function applyAllDropdowns(sheet, startRow, numDataRows) {
  var endRow = DROPDOWN_MAX_ROW // apply up to 1000 for future rows

  // ── Static dropdowns (applied to entire column range) ──────────────────────
  applyStaticDropdown(sheet, startRow, endRow, COL.GSTIN_YN,    ['Yes', 'No'])
  applyStaticDropdown(sheet, startRow, endRow, COL.LIC_TYPE,    LICENCE_TYPES)
  applyStaticDropdown(sheet, startRow, endRow, COL.LIC_STATUS,  LICENCE_STATUSES)
  applyStaticDropdown(sheet, startRow, endRow, COL.FBO_CAT,     FBO_CATS)
  applyStaticDropdown(sheet, startRow, endRow, COL.CLIENT_STATE, STATE_NAMES)
  applyStaticDropdown(sheet, startRow, endRow, COL.LIC_STATE,   STATE_NAMES)

  // ── Per-row city dropdowns (based on current state values) ─────────────────
  for (var i = 0; i < numDataRows; i++) {
    var row = startRow + i
    var clientState = sheet.getRange(row, COL.CLIENT_STATE).getValue()
    var licState    = sheet.getRange(row, COL.LIC_STATE).getValue()
    if (clientState) updateCityDropdown(sheet, row, COL.CLIENT_CITY, clientState)
    if (licState)    updateCityDropdown(sheet, row, COL.LIC_CITY,    licState)
  }

  // ── Format date columns ────────────────────────────────────────────────────
  sheet.getRange(startRow, COL.ISSUE_DATE,   endRow - startRow + 1, 1).setNumberFormat('yyyy-mm-dd')
  sheet.getRange(startRow, COL.EXPIRY_DATE,  endRow - startRow + 1, 1).setNumberFormat('yyyy-mm-dd')

  // ── Column widths ──────────────────────────────────────────────────────────
  sheet.setColumnWidth(COL.COMPANY,       220)
  sheet.setColumnWidth(COL.GSTIN_YN,       80)
  sheet.setColumnWidth(COL.GSTIN,         160)
  sheet.setColumnWidth(COL.PAN,           100)
  sheet.setColumnWidth(COL.CONTACT,       150)
  sheet.setColumnWidth(COL.PHONE,         120)
  sheet.setColumnWidth(COL.WHATSAPP,      120)
  sheet.setColumnWidth(COL.EMAIL,         180)
  sheet.setColumnWidth(COL.CLIENT_STATE,  140)
  sheet.setColumnWidth(COL.CLIENT_CITY,   140)
  sheet.setColumnWidth(COL.NOTES,         160)
  sheet.setColumnWidth(COL.LIC_TYPE,      140)
  sheet.setColumnWidth(COL.LIC_NUM,       140)
  sheet.setColumnWidth(COL.LIC_STATUS,    120)
  sheet.setColumnWidth(COL.FBO_CAT,       160)
  sheet.setColumnWidth(COL.LIC_STATE,     140)
  sheet.setColumnWidth(COL.LIC_CITY,      140)
  sheet.setColumnWidth(COL.PREMISES,      200)
  sheet.setColumnWidth(COL.ISSUE_DATE,    100)
  sheet.setColumnWidth(COL.EXPIRY_DATE,   130)

  // ── Freeze header ──────────────────────────────────────────────────────────
  sheet.setFrozenRows(1)
}

function applyStaticDropdown(sheet, startRow, endRow, col, list) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(list, true)
    .setAllowInvalid(false)
    .build()
  sheet.getRange(startRow, col, endRow - startRow + 1, 1).setDataValidation(rule)
}

// ── Sync Log ──────────────────────────────────────────────────────────────────

function writeLog(ss, direction, total, imported, skipped, errors, errorLines) {
  var log = ss.getSheetByName(LOG_SHEET)
  if (!log) {
    log = ss.insertSheet(LOG_SHEET)
    log.getRange(1,1,1,6).setValues([['Timestamp','Direction','Total','Imported','Skipped','Errors']]).setFontWeight('bold')
  }
  var now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  log.getRange(log.getLastRow()+1,1,1,6).setValues([[now,direction,total,imported,skipped,errors]])
  if (errorLines && errorLines.length) {
    var start = log.getLastRow()+2
    log.getRange(start,1).setValue('--- Errors for '+now+' ---')
    errorLines.forEach(function(line,i){ log.getRange(start+1+i,1).setValue(line) })
  }
}
