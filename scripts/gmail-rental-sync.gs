/**
 * Google Apps Script — Auto-sync Sunbelt Rentals & United Rentals email CSVs
 * 
 * SETUP:
 * 1. Open https://script.google.com
 * 2. Create a new project called "Rental Email Sync"
 * 3. Paste this entire script
 * 4. Click Run > syncRentalEmails (authorize when prompted)
 * 5. Click Triggers (clock icon) > Add Trigger:
 *    - Function: syncRentalEmails
 *    - Event source: Time-driven
 *    - Type: Hour timer > Every hour
 * 
 * This will auto-parse your daily Sunbelt and United Rentals emails
 * and write the data to a Google Sheet tab that the dashboard reads.
 */

// ═══════════════════════════════════════════════════════════
// CONFIG — Update this to match your spreadsheet
// ═══════════════════════════════════════════════════════════
const SPREADSHEET_ID = '1eIwv3pK0BBH3n4Uds6YZu4GWdMrlS3SAEFzsU3OKS5I';
const SUNBELT_TAB_NAME = 'Sunbelt Rentals Live';
const UNITED_TAB_NAME = 'United Rentals Live';
const DAYS_TO_SEARCH = 3; // How many days back to search emails

// ═══════════════════════════════════════════════════════════
// MAIN FUNCTION — Run this or set it as a trigger
// ═══════════════════════════════════════════════════════════
function syncRentalEmails() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  syncSunbeltRentals(ss);
  syncUnitedRentals(ss);
  
  Logger.log('Rental sync complete at ' + new Date().toISOString());
}

// ═══════════════════════════════════════════════════════════
// SUNBELT RENTALS
// From: noreply@sunbeltrentals.com
// Subject: "Equipment on Rent - SUNBELT SPORTS INC."
// Attachment: CSV with rental details
// ═══════════════════════════════════════════════════════════
function syncSunbeltRentals(ss) {
  const query = `from:noreply@sunbeltrentals.com subject:"Equipment on Rent" newer_than:${DAYS_TO_SEARCH}d has:attachment`;
  const threads = GmailApp.search(query, 0, 5);
  
  if (threads.length === 0) {
    Logger.log('No Sunbelt emails found');
    return;
  }
  
  // Get the most recent email
  const latestThread = threads[0];
  const messages = latestThread.getMessages();
  const latestMsg = messages[messages.length - 1];
  const emailDate = latestMsg.getDate();
  
  // Find CSV attachment
  const attachments = latestMsg.getAttachments();
  const csvAttachment = attachments.find(a => 
    a.getContentType().includes('csv') || 
    a.getName().toLowerCase().endsWith('.csv')
  );
  
  if (!csvAttachment) {
    Logger.log('No CSV attachment in Sunbelt email');
    return;
  }
  
  // Parse CSV
  const csvText = csvAttachment.getDataAsString();
  const rows = Utilities.parseCsv(csvText);
  
  if (rows.length < 2) {
    Logger.log('Sunbelt CSV empty');
    return;
  }
  
  // Get or create tab
  let sheet = ss.getSheetByName(SUNBELT_TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SUNBELT_TAB_NAME);
  }
  
  // Clear and write
  sheet.clear();
  
  // Write standardized header
  const header = [
    'Vendor', 'Contract_Number', 'Branch', 'Job_Name', 'Job_Location', 
    'Job_City', 'State', 'Ordered_By', 'Equipment_Type', 'Class_Name',
    'Day_Rate', 'Week_Rate', 'FourWeek_Rate', 'Date_Rented', 
    'Days_On_Rent', 'Pickup_Date', 'Accrued_Amount', 'Email_Date', 'Synced_At'
  ];
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
  
  // Write data rows (skip header row from CSV)
  const sourceHeader = rows[0].map(h => String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, ''));
  const col = (...names) => {
    for (const name of names) {
      const idx = sourceHeader.indexOf(String(name).toLowerCase().replace(/[^a-z0-9]+/g, ''));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const get = (row, fallbackIndex, ...names) => {
    const idx = col(...names);
    const value = idx >= 0 ? row[idx] : row[fallbackIndex];
    return (value || '').trim();
  };
  const dataRows = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 5) continue;
    if (!r[0] || r[0].trim() === '') continue; // Skip empty rows
    
    dataRows.push([
      'Sunbelt Rentals',
      get(r, 0, 'ContractNumber', 'Contract Number', 'Contract #'),
      get(r, 1, 'Branch', 'Branch Number'),
      get(r, 2, 'JobName', 'Job Name'),
      get(r, 3, 'JobLocation', 'Job Location'),
      get(r, 4, 'JobCity', 'Job City'),
      get(r, 5, 'State', 'JobState', 'Job State'),
      get(r, 6, 'OrderedBy', 'Ordered By'),
      get(r, 7, 'EquipmentType', 'Equipment Type', 'EquipmentModel', 'Equipment Model'),
      get(r, 8, 'ClassName', 'Class Name', 'EquipmentClass', 'Equipment Class'),
      get(r, 9, 'DayRate', 'Day Rate', 'DailyRate', 'Daily Rate'),
      get(r, 10, 'WeekRate', 'Week Rate', 'WeeklyRate', 'Weekly Rate'),
      get(r, 11, 'FourWeekRate', 'Four Week Rate', 'MonthlyRate', 'Monthly Rate'),
      get(r, 12, 'DateRented', 'Date Rented', 'DateOut', 'Date Out'),
      get(r, 13, 'DaysOnRent', 'Days on Rent'),
      get(r, 14, 'PickupDate', 'Pickup Date'),
      get(r, 15, 'AccruedAmount', 'Accrued Amount', 'TotalAmountBilled', 'Total Amount Billed'),
      Utilities.formatDate(emailDate, 'America/New_York', 'yyyy-MM-dd'),
      Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd HH:mm'),
    ]);
  }
  
  if (dataRows.length > 0) {
    sheet.getRange(2, 1, dataRows.length, header.length).setValues(dataRows);
  }
  
  Logger.log(`Sunbelt: wrote ${dataRows.length} rows from ${emailDate}`);
}

// ═══════════════════════════════════════════════════════════
// UNITED RENTALS
// From: NoReply@ur.com
// Subject: "URNotification Report: DailyActivity"
// Attachment: DailyActivity CSV
// ═══════════════════════════════════════════════════════════
function syncUnitedRentals(ss) {
  const query = `from:NoReply@ur.com subject:"URNotification" newer_than:${DAYS_TO_SEARCH}d has:attachment`;
  const threads = GmailApp.search(query, 0, 5);
  
  if (threads.length === 0) {
    Logger.log('No United Rentals emails found');
    return;
  }
  
  const latestThread = threads[0];
  const messages = latestThread.getMessages();
  const latestMsg = messages[messages.length - 1];
  const emailDate = latestMsg.getDate();
  
  // Find CSV attachment (not the logo image)
  const attachments = latestMsg.getAttachments();
  const csvAttachment = attachments.find(a => {
    const name = a.getName().toLowerCase();
    return name.endsWith('.csv') || name.includes('dailyactivity');
  });
  
  if (!csvAttachment) {
    Logger.log('No CSV attachment in United Rentals email');
    return;
  }
  
  const csvText = csvAttachment.getDataAsString();
  const rows = Utilities.parseCsv(csvText);
  
  if (rows.length < 2) {
    Logger.log('United Rentals CSV empty');
    return;
  }
  
  // Get or create tab
  let sheet = ss.getSheetByName(UNITED_TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(UNITED_TAB_NAME);
  }
  
  sheet.clear();
  
  // Write the CSV header as-is (we don't know exact columns yet)
  // Plus our metadata columns
  const csvHeader = rows[0];
  const fullHeader = [...csvHeader, 'Vendor', 'Email_Date', 'Synced_At'];
  sheet.getRange(1, 1, 1, fullHeader.length).setValues([fullHeader]);
  sheet.getRange(1, 1, 1, fullHeader.length).setFontWeight('bold');
  
  // Write data rows
  const dataRows = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(cell => !cell || cell.trim() === '')) continue;
    
    dataRows.push([
      ...r,
      'United Rentals',
      Utilities.formatDate(emailDate, 'America/New_York', 'yyyy-MM-dd'),
      Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd HH:mm'),
    ]);
  }
  
  if (dataRows.length > 0) {
    sheet.getRange(2, 1, dataRows.length, fullHeader.length).setValues(dataRows);
  }
  
  Logger.log(`United Rentals: wrote ${dataRows.length} rows from ${emailDate}`);
}

// ═══════════════════════════════════════════════════════════
// MANUAL TEST — Run this to test individual parsers
// ═══════════════════════════════════════════════════════════
function testSunbelt() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  syncSunbeltRentals(ss);
}

function testUnitedRentals() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  syncUnitedRentals(ss);
}
