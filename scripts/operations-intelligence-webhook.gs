/**
 * Sunbelt Sports Operations Intelligence webhook.
 *
 * Deploy as an Apps Script web app and set these server env vars in Vercel:
 * OPERATIONS_INTELLIGENCE_WEBHOOK_URL
 * OPERATIONS_INTELLIGENCE_WEBHOOK_SECRET
 */

const OPERATIONS_INTELLIGENCE_STORE = {
  spreadsheetId: '1yNpkY-gcbeZS2hGPyATTkDdt8iMbmOm4mhy7WGidKfY',
  briefSheet: 'Ops_Intelligence_Briefs',
  actionSheet: 'Ops_Intelligence_Actions',
  evidenceSheet: 'Ops_Intelligence_Evidence',
  freshnessSheet: 'Ops_Intelligence_Freshness',
  changeSheet: 'Ops_Intelligence_Changes',
};

function setupOperationsIntelligenceStore() {
  const ss = SpreadsheetApp.openById(OPERATIONS_INTELLIGENCE_STORE.spreadsheetId);
  ensureOpsIntelSheets_(ss);
  return 'Operations Intelligence store ready.';
}

function setOperationsIntelligenceWebhookSecret(secret) {
  if (!secret) throw new Error('Secret is required.');
  PropertiesService.getScriptProperties().setProperty('OPERATIONS_INTELLIGENCE_WEBHOOK_SECRET', String(secret));
  return 'OPERATIONS_INTELLIGENCE_WEBHOOK_SECRET saved.';
}

function doPost(e) {
  const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
  requireOpsIntelSecret_(body.secret);

  const ss = SpreadsheetApp.openById(OPERATIONS_INTELLIGENCE_STORE.spreadsheetId);
  ensureOpsIntelSheets_(ss);

  if (body.action === 'saveDashboardBrief') {
    saveOpsIntelBrief_(ss, body.payload && body.payload.brief ? body.payload.brief : {});
    return opsIntelJson_({ ok: true, action: body.action });
  }

  if (body.action === 'appendDashboardAction') {
    appendOpsIntelAction_(ss, body.payload && body.payload.event ? body.payload.event : {});
    return opsIntelJson_({ ok: true, action: body.action });
  }

  throw new Error('Unsupported action: ' + body.action);
}

function doGet() {
  return opsIntelJson_({ ok: true, service: 'Operations Intelligence Store' });
}

function ensureOpsIntelSheets_(ss) {
  ensureOpsIntelSheet_(ss, OPERATIONS_INTELLIGENCE_STORE.briefSheet, [
    'Generated_At', 'Mode', 'Provider_Used', 'Model_Route', 'Model_Used', 'Score', 'Score_Label', 'Summary', 'Next_Actions_JSON',
    'Watchlist_JSON', 'Source_Freshness_JSON', 'Changes_JSON', 'Errors_JSON',
    'Snapshot_Hash', 'Snapshot_JSON',
  ]);
  ensureOpsIntelSheet_(ss, OPERATIONS_INTELLIGENCE_STORE.actionSheet, [
    'Created_At', 'Action_ID', 'Action_Title', 'Action_Type', 'Owner', 'Status',
    'Note', 'Evidence_IDs_JSON', 'Payload_JSON',
  ]);
  ensureOpsIntelSheet_(ss, OPERATIONS_INTELLIGENCE_STORE.evidenceSheet, [
    'Generated_At', 'Evidence_ID', 'Source_Type', 'Source_ID', 'Source_URL',
    'Title', 'Summary', 'Captured_At',
  ]);
  ensureOpsIntelSheet_(ss, OPERATIONS_INTELLIGENCE_STORE.freshnessSheet, [
    'Generated_At', 'Source', 'Last_Updated_At', 'Status', 'Warning',
  ]);
  ensureOpsIntelSheet_(ss, OPERATIONS_INTELLIGENCE_STORE.changeSheet, [
    'Changed_At', 'Change_ID', 'Title', 'Category', 'Previous_Value',
    'Current_Value', 'Impact', 'Evidence_IDs_JSON',
  ]);
}

function ensureOpsIntelSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeaders = headers.some(function(header, index) { return current[index] !== header; });
  if (needsHeaders) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function saveOpsIntelBrief_(ss, brief) {
  const generatedAt = value_(brief, 'generatedAt');
  ss.getSheetByName(OPERATIONS_INTELLIGENCE_STORE.briefSheet).appendRow([
    generatedAt,
    value_(brief, 'mode'),
    value_(brief, 'providerUsed'),
    value_(brief, 'modelRoute'),
    value_(brief, 'modelUsed'),
    value_(brief.score || {}, 'overall'),
    value_(brief.score || {}, 'label'),
    value_(brief, 'summary'),
    JSON.stringify(brief.nextActions || []),
    JSON.stringify(brief.watchlist || []),
    JSON.stringify(brief.sourceFreshness || []),
    JSON.stringify(brief.changedSinceLastBrief || []),
    JSON.stringify(brief.errors || []),
    value_(brief, 'rawSourceSnapshotHash'),
    JSON.stringify(brief.snapshot || {}),
  ]);

  const evidenceRows = (brief.evidence || []).map(function(item) {
    return [
      generatedAt,
      value_(item, 'id'),
      value_(item, 'sourceType'),
      value_(item, 'sourceId'),
      value_(item, 'sourceUrl'),
      value_(item, 'title'),
      value_(item, 'summary'),
      value_(item, 'capturedAt'),
    ];
  });
  appendRows_(ss.getSheetByName(OPERATIONS_INTELLIGENCE_STORE.evidenceSheet), evidenceRows);

  const freshnessRows = (brief.sourceFreshness || []).map(function(item) {
    return [
      generatedAt,
      value_(item, 'source'),
      value_(item, 'lastUpdatedAt'),
      value_(item, 'status'),
      value_(item, 'warning'),
    ];
  });
  appendRows_(ss.getSheetByName(OPERATIONS_INTELLIGENCE_STORE.freshnessSheet), freshnessRows);

  const changeRows = (brief.changedSinceLastBrief || []).map(function(item) {
    return [
      value_(item, 'changedAt'),
      value_(item, 'id'),
      value_(item, 'title'),
      value_(item, 'category'),
      value_(item, 'previousValue'),
      value_(item, 'currentValue'),
      value_(item, 'impact'),
      JSON.stringify(item.sourceEvidenceIds || []),
    ];
  });
  appendRows_(ss.getSheetByName(OPERATIONS_INTELLIGENCE_STORE.changeSheet), changeRows);
}

function appendOpsIntelAction_(ss, event) {
  ss.getSheetByName(OPERATIONS_INTELLIGENCE_STORE.actionSheet).appendRow([
    value_(event, 'createdAt'),
    value_(event, 'actionId'),
    value_(event, 'actionTitle'),
    value_(event, 'actionType'),
    value_(event, 'owner'),
    value_(event, 'status'),
    value_(event, 'note'),
    JSON.stringify(event.sourceEvidenceIds || []),
    JSON.stringify(event.actionPayload || {}),
  ]);
}

function appendRows_(sheet, rows) {
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function requireOpsIntelSecret_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty('OPERATIONS_INTELLIGENCE_WEBHOOK_SECRET');
  if (!expected) throw new Error('OPERATIONS_INTELLIGENCE_WEBHOOK_SECRET is not configured.');
  if (String(secret || '') !== expected) throw new Error('Invalid webhook secret.');
}

function opsIntelJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function value_(obj, key) {
  return obj && obj[key] !== undefined && obj[key] !== null ? obj[key] : '';
}
