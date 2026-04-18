const CFG = {
  SPREADSHEET_ID: '1eIwv3pK0BBH3n4Uds6YZu4GWdMrlS3SAEFzsU3OKS5I',
  TZ: 'America/Los_Angeles',
  SHEETS: {
    DASHBOARD: 'Dashboard',
    RENTALS: 'Sunbelt Rentals Live',
    ACTIVE: 'Active_Jobs',
    SCHEDULE: 'Schedule',
    WEATHER: 'Weather_Watch',
    VISION: 'VisionLink_Equipment',
    PREP: 'Job_Prep_Board',
    CREDIT: 'Credit_Accounts',
    ASPHALT: 'Asphalt_Plants',
    QUARRY: 'Quarries_Rock',
    CONCRETE: 'Concrete',
    HAULERS: 'Haulers',
    DUMP: 'Dump_Sites',
    MISC: 'Misc_Supplies',
    EQUIP_VENDORS: 'Equipment_Vendors',
    EMAIL_TODO: 'Email_To_Do',
    RUN_LOG: '_RUN_LOG',
    // New pipeline source/canonical tables Added 
    WIP_TRANSLATOR: 'WIP_Translator',
    MASTER_INDEX: 'MASTER JOB INDEX',
    SCORECARD_DASHBOARD: 'SCORECARD DASHBOARD',
    EST_VS_ACT: 'EST VS ACT',
    CRITICAL_ATTENTION: 'CRITICAL ATTENTION',
    SCHEDULE_MIRROR: 'SCHEDULE_MIRROR'
  }
};

function getSS() {
  // Always use the active spreadsheet the script is bound to, rather than hardcoding ID
  // This prevents failures when you copy the workbook to a new version!
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  const sh = getSS().getSheetByName(name);
  if (!sh) throw new Error(`Missing sheet: ${name}`);
  return sh;
}

function nowStamp() {
  return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
}

function normalizeText(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(high school|middle school|school|hs|ms|track|tennis)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableId(input) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    input,
    Utilities.Charset.UTF_8
  );
  return digest
    .slice(0, 4)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2))
    .join('')
    .toUpperCase();
}

function autoSize(sheet, maxCols) {
  const cols = Math.min(sheet.getLastColumn(), maxCols || sheet.getLastColumn());
  for (let c = 1; c <= cols; c++) {
    try { sheet.autoResizeColumn(c); } catch (e) {}
  }
}

function clearWholeSheet(sheet) {
  const maxRows = sheet.getMaxRows();
  const maxCols = sheet.getMaxColumns();
  if (maxRows > 0 && maxCols > 0) {
    sheet.getRange(1, 1, maxRows, maxCols).clearContent();
  }
}

function clearAndUnmerge(sheet, startRow, startCol, numRows, numCols) {
  const range = sheet.getRange(startRow, startCol, numRows, numCols);
  try { range.breakApart(); } catch (e) {}
  range.clearContent();
}

function clearConditionalRules(sheet) {
  try { sheet.setConditionalFormatRules([]); } catch (e) {}
}

function findHeaderRow(values, requiredHeaders, maxRowsToCheck) {
  const limit = Math.min(values.length, maxRowsToCheck || 10);
  for (let i = 0; i < limit; i++) {
    const row = values[i].map(v => String(v || '').trim());
    if (requiredHeaders.every(h => row.includes(h))) return i + 1;
  }
  return -1;
}

function ensureSheetColumnsVisible(sheet, startCol) {
  try {
    const maxCols = sheet.getMaxColumns();
    if (maxCols >= startCol) {
      sheet.showColumns(startCol, maxCols - startCol + 1);
    }
  } catch (e) {}
}

// LOGGING + TRACEABILITY
function logStatus(stepInfo, status, details = "") {
  try {
    const ss = getSS();
    let logSheet = ss.getSheetByName(CFG.SHEETS.RUN_LOG);
    if (!logSheet) {
      logSheet = ss.insertSheet(CFG.SHEETS.RUN_LOG);
      logSheet.appendRow(["Timestamp", "Step", "Status", "Details"]);
      logSheet.getRange(1, 1, 1, 4).setFontWeight("bold");
    }
    logSheet.appendRow([nowStamp(), stepInfo, status, String(details)]);
  } catch (e) {
    Logger.log("Failed to log status: " + e.message);
  }
}
