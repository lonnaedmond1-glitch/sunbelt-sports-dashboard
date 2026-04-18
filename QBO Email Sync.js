/**
 * Google Apps Script — Auto-sync QuickBooks Online daily email reports
 *
 * Parses the 5 daily QBO reports that land in your Gmail and writes them to
 * dedicated tabs in the Scorecard Hub spreadsheet so the dashboard can read them.
 *
 * SETUP (one-time):
 * 1. Open https://script.google.com
 * 2. Create a new project called "QBO Email Sync"
 * 3. Paste this entire file in
 * 4. Click Run > syncQboEmails (authorize Gmail + Drive + Sheets access when prompted —
 *    this script uses the Drive REST API via UrlFetchApp; no Advanced Services
 *    need to be enabled, but you DO need to accept the Drive scope on first run)
 * 5. Click Triggers (clock icon) > Add Trigger:
 *      Function: syncQboEmails
 *      Event source: Time-driven
 *      Type: Hour timer > Every hour
 *
 * After that it runs automatically. New QBO reports hitting your inbox
 * get parsed and pushed to the sheet within an hour.
 *
 * ──────────────────────────────────────────────────────────────
 * Required OAuth scopes (auto-requested on first Run):
 *   - https://www.googleapis.com/auth/script.external_request   (UrlFetchApp)
 *   - https://www.googleapis.com/auth/drive                     (upload/delete temp file)
 *   - https://www.googleapis.com/auth/gmail.readonly            (read QBO emails)
 *   - https://www.googleapis.com/auth/spreadsheets              (write tabs)
 */

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════
const SPREADSHEET_ID = '1yNpkY-gcbeZS2hGPyATTkDdt8iMbmOm4mhy7WGidKfY'; // Scorecard Hub
const DAYS_TO_SEARCH = 3;

// Tab names the dashboard reads from. Keep in sync with lib/sheets-data.ts.
const TAB_EST_VS_ACTUALS = 'QBO Est vs Actuals';
const TAB_AR_AGING        = 'QBO AR Aging';

// Sender and subject filters
const QBO_SENDER  = 'quickbooks@notification.intuit.com';
const SUBJ_ESTACT = 'Estimated vs Actuals';
const SUBJ_ARAGER = 'ar ager';  // Subject is literally "ar ager" in QBO export

// ═══════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════
function syncQboEmails() {
  // Scope warm-up: referencing these services ensures Apps Script requests the
  // Drive + Gmail OAuth scopes on first run, so the UrlFetchApp call to
  // googleapis.com/drive has the right token.
  // These are no-ops; they just force scope declaration at parse time.
  if (false) {
    DriveApp.getRootFolder();
    GmailApp.getInboxUnreadCount();
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  syncEstimatesVsActuals(ss);
  syncArAging(ss);
  Logger.log('QBO sync complete: ' + new Date().toISOString());
}

// ═══════════════════════════════════════════════════════════
// 1) ESTIMATES VS ACTUALS  (XLSX attachment)
//    Columns: Project | Account | Product/Service | Total Est. Costs |
//             Total Act. Costs | Cost Difference | Total Est. Income |
//             Total Act. Income | Income Difference | Profit | Profit Margin
// ═══════════════════════════════════════════════════════════
function syncEstimatesVsActuals(ss) {
  const query = `from:${QBO_SENDER} subject:"${SUBJ_ESTACT}" newer_than:${DAYS_TO_SEARCH}d has:attachment`;
  const threads = GmailApp.search(query, 0, 5);
  if (threads.length === 0) { Logger.log('No Estimates vs Actuals email found'); return; }

  const { blob, messageDate } = getLatestAttachment_(threads, /\.xlsx$/i);
  if (!blob) { Logger.log('Est vs Actuals: no xlsx attachment'); return; }

  const rows = readXlsxToMatrix_(blob);
  if (!rows || rows.length === 0) { Logger.log('Est vs Actuals: empty xlsx'); return; }

  // QBO sometimes puts report title rows above the real header.
  // Find the header row by scanning for one whose first cell equals 'Project'.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === 'project') { headerIdx = i; break; }
  }
  if (headerIdx < 0) {
    Logger.log('Est vs Actuals: could not find header row (looking for "Project" in col A)');
    Logger.log('  First 5 rows were:');
    for (let i = 0; i < Math.min(5, rows.length); i++) Logger.log('    ' + JSON.stringify(rows[i]));
    return;
  }

  // Build a fuzzy header map — tolerant of whitespace, punctuation, case.
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const header = rows[headerIdx];
  const hMap = {};
  header.forEach((h, i) => { const k = norm(h); if (k) hMap[k] = i; });

  const findCol = (...keys) => {
    for (const k of keys) {
      const n = norm(k);
      if (hMap[n] !== undefined) return hMap[n];
    }
    return -1;
  };

  const iProject  = findCol('Project');
  const iEstCost  = findCol('Total Est. Costs', 'Est Costs', 'Estimated Costs');
  const iActCost  = findCol('Total Act. Costs', 'Act Costs', 'Actual Costs');
  const iEstInc   = findCol('Total Est. Income', 'Est Income', 'Estimated Income');
  const iActInc   = findCol('Total Act. Income', 'Act Income', 'Actual Income');
  const iProfit   = findCol('Profit');
  const iMargin   = findCol('Profit Margin', 'Margin');

  if (iProject < 0) {
    Logger.log('Est vs Actuals: "Project" column not found in header. Headers were: ' + JSON.stringify(header));
    return;
  }

  const out = [[
    'Job_Number', 'Project_Name', 'Est_Cost', 'Act_Cost',
    'Est_Income', 'Act_Income', 'Profit', 'Profit_Margin', 'Updated_At'
  ]];
  const stamp = Utilities.formatDate(messageDate, 'America/New_York', 'yyyy-MM-dd HH:mm:ss');

  let skipped = 0;
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const project = String(row[iProject] || '').trim();
    if (!project) { skipped++; continue; }
    // Skip QBO total/subtotal rows
    if (/^total\b/i.test(project) || project === 'TOTAL') { skipped++; continue; }
    const { jobNo, jobName } = splitProject_(project);
    out.push([
      jobNo,
      jobName || project,
      iEstCost >= 0 ? safeNum_(row[iEstCost]) : 0,
      iActCost >= 0 ? safeNum_(row[iActCost]) : 0,
      iEstInc  >= 0 ? safeNum_(row[iEstInc])  : 0,
      iActInc  >= 0 ? safeNum_(row[iActInc])  : 0,
      iProfit  >= 0 ? safeNum_(row[iProfit])  : 0,
      iMargin  >= 0 ? safeNum_(row[iMargin])  : 0,
      stamp,
    ]);
  }

  writeTab_(ss, TAB_EST_VS_ACTUALS, out);
  Logger.log(`Est vs Actuals: headerIdx=${headerIdx}, wrote ${out.length - 1} rows, skipped ${skipped}`);
}

// ═══════════════════════════════════════════════════════════
// 2) AR AGING  (XLSX attachment — grouped format)
//    Columns: | CURRENT | 1-30 | 31-60 | 61-90 | 91+ | Total
//    Rows alternate: customer group header, job line items, "Total for X", blank.
// ═══════════════════════════════════════════════════════════
function syncArAging(ss) {
  const query = `from:${QBO_SENDER} subject:"${SUBJ_ARAGER}" newer_than:${DAYS_TO_SEARCH}d has:attachment`;
  const threads = GmailApp.search(query, 0, 5);
  if (threads.length === 0) { Logger.log('No AR Aging email found'); return; }

  const { blob, messageDate } = getLatestAttachment_(threads, /\.xlsx$/i);
  if (!blob) return;

  const rows = readXlsxToMatrix_(blob);
  if (!rows || rows.length === 0) { Logger.log('AR Aging: empty'); return; }

  // Find header row (the one containing "CURRENT")
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (rows[i].some(c => String(c).toUpperCase().trim() === 'CURRENT')) { headerRowIdx = i; break; }
  }
  if (headerRowIdx < 0) { Logger.log('AR Aging: header not found'); return; }

  const out = [[
    'Job_Number', 'Project_Name', 'Customer',
    'Current', 'Days_1_30', 'Days_31_60', 'Days_61_90', 'Days_91_Plus', 'Total',
    'Updated_At'
  ]];
  const stamp = Utilities.formatDate(messageDate, 'America/New_York', 'yyyy-MM-dd HH:mm:ss');

  let currentCustomer = '';
  let portfolioTotals = null;

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const firstCell = String(row[0] || '').trim();
    const c1 = safeNum_(row[1]);  // Current
    const c2 = safeNum_(row[2]);  // 1-30
    const c3 = safeNum_(row[3]);  // 31-60
    const c4 = safeNum_(row[4]);  // 61-90
    const c5 = safeNum_(row[5]);  // 91+
    const c6 = safeNum_(row[6]);  // Total

    if (!firstCell) continue;

    // Grand total row at the end
    if (firstCell.toUpperCase() === 'TOTAL') {
      portfolioTotals = [c1, c2, c3, c4, c5, c6];
      continue;
    }
    // Customer subtotal rows (e.g. "Total for Astro Turf Corporation")
    if (/^Total for /i.test(firstCell)) continue;
    // Date footer
    if (/^\s*(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/i.test(firstCell) && /,\s+\d{4}/.test(firstCell)) continue;

    // If row has no dollar values, it's a customer group header
    const hasMoney = c1 || c2 || c3 || c4 || c5 || c6;
    if (!hasMoney) {
      currentCustomer = firstCell;
      continue;
    }

    // This is a job line item under the current customer.
    const { jobNo, jobName } = splitProject_(firstCell);
    out.push([
      jobNo,
      jobName || firstCell,
      currentCustomer,
      c1, c2, c3, c4, c5, c6,
      stamp,
    ]);
  }

  // Append a synthetic TOTAL row for convenience
  if (portfolioTotals) {
    out.push([
      '__TOTAL__', 'Portfolio Total', '',
      portfolioTotals[0], portfolioTotals[1], portfolioTotals[2],
      portfolioTotals[3], portfolioTotals[4], portfolioTotals[5],
      stamp,
    ]);
  }

  writeTab_(ss, TAB_AR_AGING, out);
  Logger.log(`AR Aging: wrote ${out.length - 1} rows`);
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

// Pull the most recent matching attachment from a list of threads.
function getLatestAttachment_(threads, filenamePattern) {
  let best = null;
  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      const atts = msg.getAttachments() || [];
      for (const att of atts) {
        if (!filenamePattern.test(att.getName())) continue;
        if (!best || msg.getDate() > best.messageDate) {
          best = { blob: att.copyBlob(), messageDate: msg.getDate(), filename: att.getName() };
        }
      }
    }
  }
  return best || { blob: null, messageDate: null };
}

// Convert an XLSX blob into a 2D array.
// Uses DriveApp (no Advanced Drive Service required) + the standard XLSX->Sheets
// conversion that happens automatically when you upload a .xlsx via DriveApp
// and then re-download it as Google Sheets. We use the Drive REST API directly
// through UrlFetchApp — this needs only the default Drive scope and doesn't
// require enabling the "Drive API" advanced service.
function readXlsxToMatrix_(xlsxBlob) {
  // Step 1 — upload the XLSX with conversion=true via a multipart REST request.
  // This creates a Google Sheet from the XLSX content.
  const boundary = '---qbo-boundary-' + Date.now();
  const metadata = {
    name: 'qbo-temp-' + Date.now(),
    mimeType: MimeType.GOOGLE_SHEETS,
  };

  const bytes = xlsxBlob.getBytes();
  const metaPart =
    '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: ' + xlsxBlob.getContentType() + '\r\n\r\n';
  const closing = '\r\n--' + boundary + '--';

  const payload = Utilities.newBlob(metaPart).getBytes()
    .concat(bytes)
    .concat(Utilities.newBlob(closing).getBytes());

  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
  const token = ScriptApp.getOAuthToken();
  const uploadRes = UrlFetchApp.fetch(uploadUrl, {
    method: 'post',
    contentType: 'multipart/related; boundary=' + boundary,
    payload: payload,
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });

  if (uploadRes.getResponseCode() >= 300) {
    throw new Error('Drive upload failed: ' + uploadRes.getContentText());
  }
  const fileId = JSON.parse(uploadRes.getContentText()).id;

  try {
    // Step 2 — read the converted sheet's values via SpreadsheetApp.
    const ss = SpreadsheetApp.openById(fileId);
    const sheet = ss.getSheets()[0];
    const range = sheet.getDataRange();
    return range.getValues();
  } finally {
    // Step 3 — delete the temp file via REST DELETE.
    try {
      UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId, {
        method: 'delete',
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true,
      });
    } catch (e) { /* best-effort cleanup */ }
  }
}

// Split a QBO project string like "25-175 Butler High School-Matthews NC"
// into job number and name.
function splitProject_(s) {
  const m = String(s).match(/^(\d{2,3}-\d{3})\s*(.*)$/);
  if (m) return { jobNo: m[1], jobName: m[2].trim() };
  return { jobNo: '', jobName: String(s).trim() };
}

// Coerce cell value to number, stripping $ , and %.
function safeNum_(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[$,\s]/g, '').replace(/%$/, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Write rows to a tab (create if missing), wiping old contents first.
function writeTab_(ss, tabName, matrix) {
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) sheet = ss.insertSheet(tabName);
  sheet.clearContents();
  if (matrix.length === 0) return;
  sheet.getRange(1, 1, matrix.length, matrix[0].length).setValues(matrix);
}