/**
 * Sunbelt Sports Newsletter Engine
 *
 * Standalone Apps Script delivery system for scheduled operations newsletters.
 * Source of truth: Google Sheets.
 * Delivery: Gmail.
 * Status log: separate Sunbelt Newsletter Engine Log spreadsheet.
 */

const SUNBELT_NEWSLETTER = {
  spreadsheetId: '1yNpkY-gcbeZS2hGPyATTkDdt8iMbmOm4mhy7WGidKfY',
  timeZone: 'America/New_York',
  senderName: 'Sunbelt Sports Operations',
  logSpreadsheetName: 'Sunbelt Newsletter Engine Log',
  logSheet: 'Newsletter_Run_Log',
  tabs: {
    scorecardDashboard: 'SCORECARD DASHBOARD',
    jotform: 'JOTFORM_FIELD_RAW',
    googleForms: 'Form Responses 1',
    masterJobs: 'MASTER JOB INDEX',
    qboEstVsActuals: 'QBO Est vs Actuals',
    qboArAging: 'QBO AR Aging',
    rework: 'REWORK_LOG',
    schedule: 'MS_PROJECT_SCHEDULE_LIVE',
  },
  properties: {
    defaultRecipients: 'SUNBELT_NEWSLETTER_RECIPIENTS',
    dailyRecipients: 'SUNBELT_DAILY_SITE_REPORT_RECIPIENTS',
    weeklyProjectRecipients: 'SUNBELT_WEEKLY_PROJECT_SUMMARY_RECIPIENTS',
    weeklyBusinessRecipients: 'SUNBELT_WEEKLY_BUSINESS_REVIEW_RECIPIENTS',
    monthlyRecipients: 'SUNBELT_MONTHLY_OPERATIONS_OVERVIEW_RECIPIENTS',
    logSpreadsheetId: 'SUNBELT_NEWSLETTER_LOG_SPREADSHEET_ID',
  },
};

const NEWSLETTER_DEFINITIONS = {
  DAILY_SITE_REPORT: {
    name: 'Daily Site Report',
    recipientProperty: SUNBELT_NEWSLETTER.properties.dailyRecipients,
  },
  WEEKLY_PROJECT_SUMMARY: {
    name: 'Weekly Project Summary',
    recipientProperty: SUNBELT_NEWSLETTER.properties.weeklyProjectRecipients,
  },
  WEEKLY_BUSINESS_REVIEW: {
    name: 'Weekly Business Review',
    recipientProperty: SUNBELT_NEWSLETTER.properties.weeklyBusinessRecipients,
  },
  MONTHLY_OPERATIONS_OVERVIEW: {
    name: 'Monthly Operations Overview',
    recipientProperty: SUNBELT_NEWSLETTER.properties.monthlyRecipients,
  },
};

function setupSunbeltNewsletterEngine() {
  const logSs = getNewsletterLogSpreadsheet_();
  ensureNewsletterLogSheet_(logSs);
  const audit = auditSunbeltNewsletterSourceHeaders();
  assertNewsletterRecipientsConfigured_();
  reinstallNewsletterTriggers_();
  return {
    ok: audit.ok,
    service: 'Sunbelt Newsletter Engine',
    triggerStatus: 'Installed',
    logSpreadsheetUrl: logSs.getUrl(),
    audit,
  };
}

function getSunbeltNewsletterLogSpreadsheetUrl() {
  return getNewsletterLogSpreadsheet_().getUrl();
}

function setSunbeltNewsletterLogSpreadsheetId(spreadsheetId) {
  const id = String(spreadsheetId || '').trim();
  if (!id) throw new Error('Spreadsheet ID is required.');
  const ss = SpreadsheetApp.openById(id);
  ensureNewsletterLogSheet_(ss);
  PropertiesService.getScriptProperties().setProperty(
    SUNBELT_NEWSLETTER.properties.logSpreadsheetId,
    id
  );
  return 'Newsletter log spreadsheet set: ' + ss.getUrl();
}

function removeNewsletterRunLogFromScorecardSheet() {
  const sourceSs = SpreadsheetApp.openById(SUNBELT_NEWSLETTER.spreadsheetId);
  const sheet = sourceSs.getSheetByName(SUNBELT_NEWSLETTER.logSheet);
  if (!sheet) {
    return 'No Newsletter_Run_Log tab exists in the scorecard sheet.';
  }
  sourceSs.deleteSheet(sheet);
  return 'Deleted Newsletter_Run_Log from the scorecard sheet.';
}

function auditSunbeltNewsletterSourceHeaders() {
  const ss = SpreadsheetApp.openById(SUNBELT_NEWSLETTER.spreadsheetId);
  const checks = [
    {
      tab: SUNBELT_NEWSLETTER.tabs.scorecardDashboard,
      headers: ['Job #', 'Job Name', 'PM', 'Status', 'Estimated Asphalt Tons', 'Actual Asphalt Tons', 'Man Hours'],
    },
    {
      tab: SUNBELT_NEWSLETTER.tabs.jotform,
      headers: ['Date of Activity', 'Foreman Name', 'Job Name', 'Job Number', 'Total Man Hours'],
    },
    {
      tab: SUNBELT_NEWSLETTER.tabs.googleForms,
      headers: ['Timestamp', 'Date of Activity', 'Foreman Name', 'Job Name', 'Activity Type'],
    },
    {
      tab: SUNBELT_NEWSLETTER.tabs.masterJobs,
      headers: ['Job #', 'Job Name', 'Job Status', 'Contract Amount', 'PM'],
    },
    {
      tab: SUNBELT_NEWSLETTER.tabs.qboEstVsActuals,
      headers: ['Job_Number', 'Project_Name', 'Act_Cost', 'Act_Income', 'Profit', 'Updated_At'],
    },
    {
      tab: SUNBELT_NEWSLETTER.tabs.qboArAging,
      headers: ['Job_Number', 'Project_Name', 'Customer', 'Days_91_Plus', 'Total', 'Updated_At'],
    },
    {
      tab: SUNBELT_NEWSLETTER.tabs.rework,
      headers: ['Date', 'Job_Number', 'Job_Name', 'Crew', 'Hours', 'Cost', 'Note'],
    },
    {
      tab: SUNBELT_NEWSLETTER.tabs.schedule,
      headers: ['Job_Number', 'Job_Name', 'Task_Type', 'Start_Date', 'Finish_Date', 'Schedule_Status'],
    },
  ];

  const results = checks.map(function(check) {
    const sheet = ss.getSheetByName(check.tab);
    if (!sheet) {
      return { tab: check.tab, ok: false, missing: ['TAB_NOT_FOUND'], present: [] };
    }
    const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getDisplayValues()[0];
    const missing = check.headers.filter(function(required) {
      return findHeaderIndex_(headers, [required]) < 0;
    });
    return {
      tab: check.tab,
      ok: missing.length === 0,
      missing,
      present: headers.filter(String),
    };
  });

  return {
    ok: results.every(function(result) { return result.ok; }),
    checkedAt: new Date().toISOString(),
    results,
  };
}

function setSunbeltNewsletterRecipients(emailCsv) {
  const recipients = parseRecipients_(emailCsv);
  if (!recipients.length) throw new Error('At least one recipient email is required.');
  PropertiesService.getScriptProperties().setProperty(
    SUNBELT_NEWSLETTER.properties.defaultRecipients,
    recipients.join(',')
  );
  return 'SUNBELT_NEWSLETTER_RECIPIENTS saved: ' + recipients.length + ' recipient(s).';
}

function setDailySiteReportRecipients(emailCsv) {
  return setNewsletterRecipientsByKey_(NEWSLETTER_DEFINITIONS.DAILY_SITE_REPORT.recipientProperty, emailCsv);
}

function setWeeklyProjectSummaryRecipients(emailCsv) {
  return setNewsletterRecipientsByKey_(NEWSLETTER_DEFINITIONS.WEEKLY_PROJECT_SUMMARY.recipientProperty, emailCsv);
}

function setWeeklyBusinessReviewRecipients(emailCsv) {
  return setNewsletterRecipientsByKey_(NEWSLETTER_DEFINITIONS.WEEKLY_BUSINESS_REVIEW.recipientProperty, emailCsv);
}

function setMonthlyOperationsOverviewRecipients(emailCsv) {
  return setNewsletterRecipientsByKey_(NEWSLETTER_DEFINITIONS.MONTHLY_OPERATIONS_OVERVIEW.recipientProperty, emailCsv);
}

function sendSportsReport() {
  return sendDailySiteReport();
}

function sendDailySiteReport() {
  const today = todayInTimeZone_();
  if (today.getDay() === 0 || today.getDay() === 6) {
    return logNewsletterSkipped_('DAILY_SITE_REPORT', dailyReportPeriod_(), 'Weekend skip.');
  }
  return sendNewsletter_('DAILY_SITE_REPORT', dailyReportPeriod_(), false);
}

function sendWeeklyProjectSummary() {
  return sendNewsletter_('WEEKLY_PROJECT_SUMMARY', trailingDaysPeriod_(7), false);
}

function sendWeeklyBusinessReview() {
  return sendNewsletter_('WEEKLY_BUSINESS_REVIEW', trailingDaysPeriod_(7), false);
}

function sendMonthlyOperationsOverview() {
  const today = todayInTimeZone_();
  if (!isFirstMonday_(today)) {
    return logNewsletterSkipped_('MONTHLY_OPERATIONS_OVERVIEW', previousMonthPeriod_(), 'Not first Monday.');
  }
  return sendNewsletter_('MONTHLY_OPERATIONS_OVERVIEW', previousMonthPeriod_(), false);
}

function forceSendDailySiteReport() {
  return sendNewsletter_('DAILY_SITE_REPORT', dailyReportPeriod_(), true);
}

function forceSendWeeklyProjectSummary() {
  return sendNewsletter_('WEEKLY_PROJECT_SUMMARY', trailingDaysPeriod_(7), true);
}

function forceSendWeeklyBusinessReview() {
  return sendNewsletter_('WEEKLY_BUSINESS_REVIEW', trailingDaysPeriod_(7), true);
}

function forceSendMonthlyOperationsOverview() {
  return sendNewsletter_('MONTHLY_OPERATIONS_OVERVIEW', previousMonthPeriod_(), true);
}

function previewDailySiteReport() {
  return buildNewsletter_('DAILY_SITE_REPORT', dailyReportPeriod_()).html;
}

function previewWeeklyProjectSummary() {
  return buildNewsletter_('WEEKLY_PROJECT_SUMMARY', trailingDaysPeriod_(7)).html;
}

function previewWeeklyBusinessReview() {
  return buildNewsletter_('WEEKLY_BUSINESS_REVIEW', trailingDaysPeriod_(7)).html;
}

function previewMonthlyOperationsOverview() {
  return buildNewsletter_('MONTHLY_OPERATIONS_OVERVIEW', previousMonthPeriod_()).html;
}

function sendNewsletter_(key, period, force) {
  const definition = NEWSLETTER_DEFINITIONS[key];
  if (!definition) throw new Error('Unknown newsletter key: ' + key);

  const logSs = getNewsletterLogSpreadsheet_();
  ensureNewsletterLogSheet_(logSs);

  if (!force && hasSuccessfulNewsletterRun_(logSs, key, period)) {
    return logNewsletterSkipped_(key, period, 'Already sent for this period.');
  }

  let built;
  try {
    built = buildNewsletter_(key, period);
    const recipients = getNewsletterRecipients_(definition);
    GmailApp.sendEmail(recipients.join(','), built.subject, built.text, {
      htmlBody: built.html,
      name: SUNBELT_NEWSLETTER.senderName,
    });
    appendNewsletterLog_(logSs, {
      key,
      name: definition.name,
      period,
      recipients,
      status: 'SENT',
      subject: built.subject,
      message: 'Sent successfully.',
      metrics: built.metrics,
    });
    return {
      ok: true,
      status: 'SENT',
      newsletter: definition.name,
      subject: built.subject,
      recipients: recipients.length,
      periodStart: dateKey_(period.start),
      periodEnd: dateKey_(period.end),
    };
  } catch (error) {
    appendNewsletterLog_(logSs, {
      key,
      name: definition.name,
      period,
      recipients: [],
      status: 'FAILED',
      subject: built && built.subject ? built.subject : definition.name,
      message: error && error.message ? error.message : String(error),
      metrics: {},
    });
    throw error;
  }
}

function buildNewsletter_(key, period) {
  const data = loadSunbeltNewsletterData_();
  if (key === 'DAILY_SITE_REPORT') return buildDailySiteReport_(data, period);
  if (key === 'WEEKLY_PROJECT_SUMMARY') return buildWeeklyProjectSummary_(data, period);
  if (key === 'WEEKLY_BUSINESS_REVIEW') return buildWeeklyBusinessReview_(data, period);
  if (key === 'MONTHLY_OPERATIONS_OVERVIEW') return buildMonthlyOperationsOverview_(data, period);
  throw new Error('Unknown newsletter key: ' + key);
}

function loadSunbeltNewsletterData_() {
  const ss = SpreadsheetApp.openById(SUNBELT_NEWSLETTER.spreadsheetId);
  const jotformRows = readObjects_(ss, SUNBELT_NEWSLETTER.tabs.jotform);
  const googleFormRows = readObjects_(ss, SUNBELT_NEWSLETTER.tabs.googleForms);
  const masterJobs = readObjects_(ss, SUNBELT_NEWSLETTER.tabs.masterJobs).map(normalizeMasterJob_);
  const qboRows = readObjects_(ss, SUNBELT_NEWSLETTER.tabs.qboEstVsActuals).map(normalizeQboRow_);
  const arRows = readObjects_(ss, SUNBELT_NEWSLETTER.tabs.qboArAging).map(normalizeArRow_);
  const reworkRows = readObjects_(ss, SUNBELT_NEWSLETTER.tabs.rework).map(normalizeReworkRow_);
  const scheduleRows = readObjects_(ss, SUNBELT_NEWSLETTER.tabs.schedule).map(normalizeScheduleRow_);
  const reports = normalizeFieldReports_(jotformRows, googleFormRows);

  return {
    loadedAt: new Date(),
    reports,
    masterJobs,
    qboRows,
    arRows,
    reworkRows,
    scheduleRows,
    masterByJob: indexBy_(masterJobs, 'jobNumber'),
  };
}

function buildDailySiteReport_(data, period) {
  const reports = reportsInPeriod_(data.reports, period);
  const scheduled = scheduleInPeriod_(data.scheduleRows, period);
  const missingReports = findMissingReports_(scheduled, reports);
  const issues = fieldIssues_(reports);
  const production = productionMetrics_(reports);
  const rows = groupReportRowsByJob_(reports, data.masterByJob);
  const periodLabel = periodLabel_(period);

  const sections = [
    kpiGrid_([
      ['Field reports', production.reportCount],
      ['Jobs reported', production.jobCount],
      ['Man hours', formatNumber_(production.manHours)],
      ['Asphalt tons', formatNumber_(production.asphaltTons)],
    ]),
    section_('Production By Job', jobProductionTable_(rows)),
    section_('Office Follow-Up', followUpList_(missingReports, issues)),
    section_('Schedule Watch', scheduleTable_(scheduled.slice(0, 12))),
  ].join('');

  const subject = 'Daily Site Report - ' + periodLabel;
  return {
    subject,
    html: wrapEmailHtml_('Daily Site Report', periodLabel, sections),
    text: textSummary_(subject, production, missingReports, issues),
    metrics: Object.assign({}, production, {
      missingReportCount: missingReports.length,
      issueCount: issues.length,
    }),
  };
}

function buildWeeklyProjectSummary_(data, period) {
  const reports = reportsInPeriod_(data.reports, period);
  const scheduled = scheduleInPeriod_(data.scheduleRows, period);
  const nextWeek = scheduleInPeriod_(data.scheduleRows, nextDaysPeriod_(7));
  const missingReports = findMissingReports_(scheduled, reports);
  const issues = fieldIssues_(reports);
  const production = productionMetrics_(reports);
  const rows = groupReportRowsByJob_(reports, data.masterByJob);
  const periodLabel = periodLabel_(period);

  const sections = [
    kpiGrid_([
      ['Jobs worked', production.jobCount],
      ['Field reports', production.reportCount],
      ['Man hours', formatNumber_(production.manHours)],
      ['Base tons', formatNumber_(production.baseTons)],
      ['Asphalt tons', formatNumber_(production.asphaltTons)],
      ['Open follow-ups', missingReports.length + issues.length],
    ]),
    section_('Top Production Jobs', jobProductionTable_(rows.slice(0, 12))),
    section_('Missing Reports And Field Issues', followUpList_(missingReports, issues)),
    section_('Next 7 Days Schedule', scheduleTable_(nextWeek.slice(0, 15))),
  ].join('');

  const subject = 'Weekly Project Summary - ' + periodLabel;
  return {
    subject,
    html: wrapEmailHtml_('Weekly Project Summary', periodLabel, sections),
    text: textSummary_(subject, production, missingReports, issues),
    metrics: Object.assign({}, production, {
      missingReportCount: missingReports.length,
      issueCount: issues.length,
      upcomingScheduleCount: nextWeek.length,
    }),
  };
}

function buildWeeklyBusinessReview_(data, period) {
  const reports = reportsInPeriod_(data.reports, period);
  const rework = rowsInPeriod_(data.reworkRows, period, 'date');
  const production = productionMetrics_(reports);
  const financials = financialMetrics_(data.qboRows, data.arRows, data.masterByJob);
  const issues = fieldIssues_(reports);
  const periodLabel = periodLabel_(period);
  const reworkCost = sum_(rework, 'cost');
  const reworkHours = sum_(rework, 'hours');

  const sections = [
    kpiGrid_([
      ['Contract-backed revenue', money_(financials.contractRevenue)],
      ['Actual cost', money_(financials.actualCost)],
      ['Avg margin', pct_(financials.averageMargin)],
      ['A/R 91+', money_(financials.ar91Plus)],
      ['Rework cost', money_(reworkCost)],
      ['Field issue count', issues.length],
    ]),
    section_('Margin Watch', financialRiskTable_(financials.lossJobs)),
    section_('Collections Watch', arRiskTable_(financials.arRiskRows)),
    section_('Production Pulse', productionSummaryTable_(production, reworkCost, reworkHours)),
  ].join('');

  const subject = 'Weekly Business Review - ' + periodLabel;
  return {
    subject,
    html: wrapEmailHtml_('Weekly Business Review', periodLabel, sections),
    text: [
      subject,
      'Contract-backed revenue: ' + money_(financials.contractRevenue),
      'Actual cost: ' + money_(financials.actualCost),
      'Average margin: ' + pct_(financials.averageMargin),
      'A/R 91+: ' + money_(financials.ar91Plus),
      'Rework cost: ' + money_(reworkCost),
    ].join('\n'),
    metrics: Object.assign({}, production, {
      contractRevenue: financials.contractRevenue,
      actualCost: financials.actualCost,
      averageMargin: financials.averageMargin,
      ar91Plus: financials.ar91Plus,
      reworkCost,
      reworkHours,
      lossJobCount: financials.lossJobs.length,
    }),
  };
}

function buildMonthlyOperationsOverview_(data, period) {
  const reports = reportsInPeriod_(data.reports, period);
  const rework = rowsInPeriod_(data.reworkRows, period, 'date');
  const scheduled = scheduleInPeriod_(data.scheduleRows, period);
  const production = productionMetrics_(reports);
  const financials = financialMetrics_(data.qboRows, data.arRows, data.masterByJob);
  const rows = groupReportRowsByJob_(reports, data.masterByJob);
  const reworkCost = sum_(rework, 'cost');
  const periodLabel = periodLabel_(period);

  const sections = [
    kpiGrid_([
      ['Jobs worked', production.jobCount],
      ['Reports filed', production.reportCount],
      ['Man hours', formatNumber_(production.manHours)],
      ['Asphalt tons', formatNumber_(production.asphaltTons)],
      ['Scheduled projects', scheduled.length],
      ['Rework cost', money_(reworkCost)],
    ]),
    section_('Monthly Production Leaders', jobProductionTable_(rows.slice(0, 15))),
    section_('Financial Position', monthlyFinancialTable_(financials)),
    section_('Schedule Throughput', scheduleTable_(scheduled.slice(0, 20))),
  ].join('');

  const subject = 'Monthly Operations Overview - ' + periodLabel;
  return {
    subject,
    html: wrapEmailHtml_('Monthly Operations Overview', periodLabel, sections),
    text: [
      subject,
      'Jobs worked: ' + production.jobCount,
      'Reports filed: ' + production.reportCount,
      'Man hours: ' + formatNumber_(production.manHours),
      'Asphalt tons: ' + formatNumber_(production.asphaltTons),
      'Rework cost: ' + money_(reworkCost),
    ].join('\n'),
    metrics: Object.assign({}, production, {
      scheduledProjectCount: scheduled.length,
      reworkCost,
      contractRevenue: financials.contractRevenue,
      averageMargin: financials.averageMargin,
      ar91Plus: financials.ar91Plus,
    }),
  };
}

function normalizeFieldReports_(jotformRows, googleFormRows) {
  const legacy = jotformRows.map(function(row) {
    const jobLabel = getAny_(row, ['Job Name']);
    const jobNumber = cleanJobNumber_(getAny_(row, ['Job Number']) || extractJobNumber_(jobLabel));
    const date = parseDate_(getAny_(row, ['Date of Activity']));
    return {
      source: 'JOTFORM_FIELD_RAW',
      date,
      dateKey: date ? dateKey_(date) : '',
      jobNumber,
      jobName: extractJobName_(jobLabel, jobNumber),
      foreman: getAny_(row, ['Foreman Name']),
      activity: getAny_(row, ['Production Activity']),
      crewCount: number_(getAny_(row, ['Number of Crew Members'])),
      manHours: number_(getAny_(row, ['Total Man Hours'])),
      truckCount: number_(getAny_(row, ['How many trucks were onsite today?'])),
      soilTons: number_(getAny_(row, ['Soil Cement Tonnage'])),
      gabTons: number_(getAny_(row, ['GAB Tonnage'])),
      binderTons: number_(getAny_(row, ['Binder Tonnage'])),
      toppingTons: number_(getAny_(row, ['Topping Tonnage'])),
      patchTons: number_(getAny_(row, ['Patching Tonnage'])),
      concreteCy: number_(getAny_(row, ['Concrete CY'])),
      curbLf: number_(getAny_(row, ['Concrete Curb LF'])),
      millingSy: number_(getAny_(row, ['Milling SY'])),
      summary: getAny_(row, ['Job Summary', 'Comments']),
      blockers: getAny_(row, ['Missed Production Reasons', 'Why No Activity?']),
      alerts: getAny_(row, ['Explain quality issues', 'What needs to be repaired?']),
      weatherImpact: getAny_(row, ['Any rain days for crews this week? Recorded on daily report?']),
      materialOverrun: '',
      safetyIncident: '',
      equipmentIssue: yesText_(getAny_(row, ['Do you have equipment that needs repairs?'])),
      qualityIssue: yesText_(getAny_(row, ['Did you have any quality issues?'])),
    };
  });

  const forms = googleFormRows.map(function(row) {
    const jobLabel = getAny_(row, ['Job Name', 'Job']);
    const jobNumber = cleanJobNumber_(extractJobNumber_(jobLabel));
    const date = parseDate_(getAny_(row, ['Date of Activity', 'Date of Activity (Fecha de Actividad)', 'Timestamp']));
    return {
      source: 'Form Responses 1',
      date,
      dateKey: date ? dateKey_(date) : '',
      jobNumber,
      jobName: extractJobName_(jobLabel, jobNumber),
      foreman: getAny_(row, ['Foreman Name', 'Foreman Name (Nombre del Capataz)']),
      activity: getAny_(row, ['Activity Type', 'Activity Type (Tipo de Actividad)']),
      crewCount: number_(getAny_(row, ['Crew Size', 'Crew Size (Tamaño del Equipo)'])),
      manHours: number_(getAny_(row, ['Hours Worked', 'Hours Worked (Calculated)'])),
      truckCount: 0,
      soilTons: number_(getAny_(row, ['Soil Tons Laid', 'Soil Tons Laid (Toneladas de Suelo Colocadas)'])),
      gabTons: number_(getAny_(row, ['GAB Tons Laid', 'GAB Tons Laid (Toneladas GAB Colocadas)'])),
      binderTons: number_(getAny_(row, ['Binder Tons Laid', 'Binder Tons Laid (Toneladas de Aglutinante Colocadas)'])),
      toppingTons: number_(getAny_(row, ['Topping Tons Laid', 'Topping Tons Laid (Toneladas de Capa Superior Colocadas)'])),
      patchTons: number_(getAny_(row, ['Patch Tons Laid', 'Patch Tons Laid (Toneladas de Parche Colocadas)'])),
      concreteCy: number_(getAny_(row, ['Cubic Yards Poured', 'Cubic Yards Poured (Yardas Cubicas Vertidas)'])),
      curbLf: 0,
      millingSy: number_(getAny_(row, ['Square Yards Milled', 'If Milling Activity: Square Yards Milled / Tons Removed'])),
      summary: getAny_(row, ['Field Notes', 'Field Notes (Notas de Campo)']),
      blockers: getAny_(row, ['Blockers / Delays', 'If materials were late, what was missing or delayed?']),
      alerts: getAny_(row, ['Alerts / Risks for Office']),
      weatherImpact: getAny_(row, ['Did weather impact production today?', 'Weather Conditions Today']),
      materialOverrun: yesText_(getAny_(row, ['Material overrun? (Over budgeted tonnage)'])),
      safetyIncident: yesText_(getAny_(row, ['Were there any safety incidents or near-misses today?'])),
      equipmentIssue: getAny_(row, ['Which piece of equipment experienced an issue or malfunction today?']),
      qualityIssue: yesText_(getAny_(row, ['Did anything go wrong today?'])),
    };
  });

  return legacy.concat(forms).filter(function(report) {
    return report.date && report.jobNumber;
  });
}

function normalizeMasterJob_(row) {
  return {
    jobNumber: cleanJobNumber_(getAny_(row, ['Job #'])),
    jobName: getAny_(row, ['Job Name']),
    status: displayNewsletterJobStatus_(getAny_(row, ['Job Status'])),
    contractAmount: number_(getAny_(row, ['Contract Amount'])),
    estimatedAsphaltTons: number_(getAny_(row, ['Estimated Asphalt Tons'])),
    pm: getAny_(row, ['PM']),
    pmEmail: getAny_(row, ['PM Email']),
  };
}

function normalizeQboRow_(row) {
  return {
    jobNumber: cleanJobNumber_(getAny_(row, ['Job_Number'])),
    projectName: getAny_(row, ['Project_Name']),
    estCost: number_(getAny_(row, ['Est_Cost'])),
    actCost: number_(getAny_(row, ['Act_Cost'])),
    estIncome: number_(getAny_(row, ['Est_Income'])),
    actIncome: number_(getAny_(row, ['Act_Income'])),
    profit: number_(getAny_(row, ['Profit'])),
    profitMargin: number_(getAny_(row, ['Profit_Margin'])),
    updatedAt: getAny_(row, ['Updated_At']),
  };
}

function normalizeArRow_(row) {
  return {
    jobNumber: cleanJobNumber_(getAny_(row, ['Job_Number'])),
    projectName: getAny_(row, ['Project_Name']),
    customer: getAny_(row, ['Customer']),
    current: number_(getAny_(row, ['Current'])),
    d1_30: number_(getAny_(row, ['Days_1_30'])),
    d31_60: number_(getAny_(row, ['Days_31_60'])),
    d61_90: number_(getAny_(row, ['Days_61_90'])),
    d91Plus: number_(getAny_(row, ['Days_91_Plus'])),
    total: number_(getAny_(row, ['Total'])),
    updatedAt: getAny_(row, ['Updated_At']),
  };
}

function normalizeReworkRow_(row) {
  return {
    date: parseDate_(getAny_(row, ['Date'])),
    jobNumber: cleanJobNumber_(getAny_(row, ['Job_Number'])),
    jobName: getAny_(row, ['Job_Name']),
    crew: getAny_(row, ['Crew']),
    hours: number_(getAny_(row, ['Hours'])),
    cost: number_(getAny_(row, ['Cost'])),
    note: getAny_(row, ['Note']),
  };
}

function normalizeScheduleRow_(row) {
  const rawStatus = getAny_(row, ['Schedule_Status']);
  const percentComplete = number_(getAny_(row, ['Percent_Complete']));
  return {
    jobNumber: cleanJobNumber_(getAny_(row, ['Job_Number'])),
    jobName: getAny_(row, ['Job_Name']),
    taskName: getAny_(row, ['Task_Name']),
    taskType: getAny_(row, ['Task_Type']),
    percentComplete,
    startDate: parseDate_(getAny_(row, ['Start_Date'])),
    finishDate: parseDate_(getAny_(row, ['Finish_Date'])),
    scheduleStatus: displayNewsletterScheduleStatus_(rawStatus, percentComplete),
    matchedMasterJob: getAny_(row, ['Matched_Master_Job']),
  };
}

function productionMetrics_(reports) {
  const jobNumbers = unique_(reports.map(function(report) { return report.jobNumber; }).filter(Boolean));
  return {
    reportCount: reports.length,
    jobCount: jobNumbers.length,
    crewCount: reports.reduce(function(max, report) { return Math.max(max, report.crewCount || 0); }, 0),
    manHours: sum_(reports, 'manHours'),
    truckCount: reports.reduce(function(max, report) { return Math.max(max, report.truckCount || 0); }, 0),
    baseTons: sum_(reports, 'gabTons') + sum_(reports, 'soilTons'),
    asphaltTons: sum_(reports, 'binderTons') + sum_(reports, 'toppingTons') + sum_(reports, 'patchTons'),
    concreteCy: sum_(reports, 'concreteCy'),
    curbLf: sum_(reports, 'curbLf'),
    millingSy: sum_(reports, 'millingSy'),
  };
}

function financialMetrics_(qboRows, arRows, masterByJob) {
  const enriched = qboRows.map(function(row) {
    const master = masterByJob[row.jobNumber] || {};
    const contract = master.contractAmount || 0;
    const revenue = row.estIncome > 0 ? row.estIncome : contract || row.actIncome || 0;
    const profit = revenue > 0 ? revenue - row.actCost : row.profit;
    const margin = revenue > 0 ? profit / revenue : row.profitMargin || 0;
    return Object.assign({}, row, {
      contractRevenue: revenue,
      computedProfit: profit,
      computedMargin: margin,
    });
  }).filter(function(row) {
    return row.jobNumber || row.projectName;
  });

  const lossJobs = enriched
    .filter(function(row) { return row.computedProfit < 0; })
    .sort(function(a, b) { return a.computedProfit - b.computedProfit; })
    .slice(0, 10);

  const arRiskRows = arRows
    .filter(function(row) { return row.d91Plus > 0; })
    .sort(function(a, b) { return b.d91Plus - a.d91Plus; })
    .slice(0, 10);

  const contractRevenue = sum_(enriched, 'contractRevenue');
  const actualCost = sum_(enriched, 'actCost');
  const profit = contractRevenue - actualCost;
  const averageMargin = contractRevenue > 0 ? profit / contractRevenue : 0;

  return {
    contractRevenue,
    actualCost,
    profit,
    averageMargin,
    arTotal: sum_(arRows, 'total'),
    ar91Plus: sum_(arRows, 'd91Plus'),
    lossJobs,
    arRiskRows,
  };
}

function groupReportRowsByJob_(reports, masterByJob) {
  const grouped = {};
  reports.forEach(function(report) {
    if (!grouped[report.jobNumber]) {
      const master = masterByJob[report.jobNumber] || {};
      grouped[report.jobNumber] = {
        jobNumber: report.jobNumber,
        jobName: report.jobName || master.jobName || '',
        pm: master.pm || '',
        reports: 0,
        manHours: 0,
        baseTons: 0,
        asphaltTons: 0,
        concreteCy: 0,
        millingSy: 0,
        foremen: [],
        latestSummary: '',
      };
    }
    const item = grouped[report.jobNumber];
    item.reports += 1;
    item.manHours += report.manHours || 0;
    item.baseTons += (report.gabTons || 0) + (report.soilTons || 0);
    item.asphaltTons += (report.binderTons || 0) + (report.toppingTons || 0) + (report.patchTons || 0);
    item.concreteCy += report.concreteCy || 0;
    item.millingSy += report.millingSy || 0;
    if (report.foreman && item.foremen.indexOf(report.foreman) < 0) item.foremen.push(report.foreman);
    if (report.summary) item.latestSummary = report.summary;
  });

  return Object.keys(grouped).map(function(key) {
    return grouped[key];
  }).sort(function(a, b) {
    return (b.asphaltTons + b.baseTons + b.manHours / 10) - (a.asphaltTons + a.baseTons + a.manHours / 10);
  });
}

function fieldIssues_(reports) {
  const issues = [];
  reports.forEach(function(report) {
    [
      ['Safety', report.safetyIncident],
      ['Equipment', report.equipmentIssue],
      ['Quality', report.qualityIssue],
      ['Weather', report.weatherImpact],
      ['Material', report.materialOverrun],
      ['Blocker', report.blockers],
      ['Office Alert', report.alerts],
    ].forEach(function(pair) {
      const label = pair[0];
      const value = cleanIssueText_(pair[1]);
      if (!value) return;
      issues.push({
        label,
        jobNumber: report.jobNumber,
        jobName: report.jobName,
        foreman: report.foreman,
        detail: value,
      });
    });
  });
  return issues.slice(0, 25);
}

function findMissingReports_(scheduled, reports) {
  const reported = {};
  reports.forEach(function(report) {
    if (report.jobNumber) reported[report.jobNumber] = true;
  });
  const seen = {};
  return scheduled.filter(function(item) {
    if (!item.jobNumber || reported[item.jobNumber] || seen[item.jobNumber]) return false;
    seen[item.jobNumber] = true;
    return true;
  }).slice(0, 20);
}

function reportsInPeriod_(reports, period) {
  return reports.filter(function(report) {
    return report.date && dateInPeriod_(report.date, period);
  });
}

function rowsInPeriod_(rows, period, dateField) {
  return rows.filter(function(row) {
    return row[dateField] && dateInPeriod_(row[dateField], period);
  });
}

function scheduleInPeriod_(scheduleRows, period) {
  return scheduleRows.filter(function(row) {
    if (!row.jobNumber || !row.startDate || !row.finishDate) return false;
    if (String(row.taskType || '').toLowerCase() !== 'project') return false;
    return rangesIntersect_(row.startDate, row.finishDate, period.start, period.end);
  }).sort(function(a, b) {
    return a.startDate.getTime() - b.startDate.getTime();
  });
}

function wrapEmailHtml_(title, subtitle, bodyHtml) {
  return [
    '<!doctype html>',
    '<html>',
    '<body style="margin:0;background:#F7F8F5;color:#2F3437;font-family:Arial,sans-serif;">',
    '<div style="max-width:980px;margin:0 auto;padding:24px;">',
    '<div style="border:2px solid #2F3437;background:#FFFFFF;padding:22px 24px;">',
    '<div style="font-family:Arial Black,Arial,sans-serif;font-size:28px;line-height:1;text-transform:uppercase;letter-spacing:0;color:#2F3437;">' + escapeHtml_(title) + '</div>',
    '<div style="margin-top:8px;font-size:13px;color:#5F666A;">Sunbelt Sports, Inc. | ' + escapeHtml_(subtitle) + '</div>',
    '<div style="height:5px;background:#0BBE63;margin:18px 0 4px;"></div>',
    bodyHtml,
    '<div style="margin-top:22px;padding-top:14px;border-top:1px solid #DDE2E5;font-size:11px;color:#757A7F;">Generated from Google Sheets source data. Newsletter engine is separate from the dashboard app.</div>',
    '</div>',
    '</div>',
    '</body>',
    '</html>',
  ].join('');
}

function section_(title, html) {
  return [
    '<div style="margin-top:22px;">',
    '<div style="font-family:Arial Black,Arial,sans-serif;font-size:17px;text-transform:uppercase;color:#2F3437;border-bottom:2px solid #2F3437;padding-bottom:6px;">' + escapeHtml_(title) + '</div>',
    '<div style="margin-top:10px;">' + html + '</div>',
    '</div>',
  ].join('');
}

function kpiGrid_(items) {
  const cells = items.map(function(item) {
    return [
      '<td style="width:16.6%;vertical-align:top;padding:10px;border:1px solid #DDE2E5;background:#FAFCFB;">',
      '<div style="font-size:10px;text-transform:uppercase;color:#6D7478;font-weight:bold;">' + escapeHtml_(item[0]) + '</div>',
      '<div style="font-family:Arial Black,Arial,sans-serif;font-size:22px;margin-top:4px;color:#2F3437;">' + escapeHtml_(String(item[1])) + '</div>',
      '</td>',
    ].join('');
  }).join('');
  return '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:16px;"><tr>' + cells + '</tr></table>';
}

function jobProductionTable_(rows) {
  if (!rows.length) return emptyState_('No field production reports found for this period.');
  const body = rows.map(function(row) {
    return [
      '<tr>',
      td_(row.jobNumber + (row.jobName ? ' | ' + row.jobName : '')),
      td_(row.pm || '-'),
      td_(formatNumber_(row.manHours), 'right'),
      td_(formatNumber_(row.baseTons), 'right'),
      td_(formatNumber_(row.asphaltTons), 'right'),
      td_(row.foremen.slice(0, 3).join(', ') || '-'),
      '</tr>',
    ].join('');
  }).join('');
  return table_(['Job', 'PM', 'Man Hours', 'Base Tons', 'Asphalt Tons', 'Foreman'], body);
}

function scheduleTable_(rows) {
  if (!rows.length) return emptyState_('No scheduled projects found for this period.');
  const body = rows.map(function(row) {
    return [
      '<tr>',
      td_(row.jobNumber + (row.jobName ? ' | ' + row.jobName : '')),
      td_(dateKey_(row.startDate)),
      td_(dateKey_(row.finishDate)),
      td_(formatNumber_(row.percentComplete) + '%', 'right'),
      td_(row.scheduleStatus || '-'),
      '</tr>',
    ].join('');
  }).join('');
  return table_(['Job', 'Start', 'Finish', '% Complete', 'Status'], body);
}

function followUpList_(missingReports, issues) {
  const items = [];
  missingReports.forEach(function(row) {
    items.push('<li><strong>Missing report:</strong> ' + escapeHtml_(row.jobNumber + (row.jobName ? ' | ' + row.jobName : '')) + '</li>');
  });
  issues.forEach(function(issue) {
    items.push('<li><strong>' + escapeHtml_(issue.label) + ':</strong> ' + escapeHtml_(issue.jobNumber + (issue.jobName ? ' | ' + issue.jobName : '') + ' - ' + issue.detail) + '</li>');
  });
  if (!items.length) return emptyState_('No missing report or field issue items found for this period.');
  return '<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.55;">' + items.join('') + '</ul>';
}

function financialRiskTable_(rows) {
  if (!rows.length) return emptyState_('No negative-margin jobs found in QBO data.');
  const body = rows.map(function(row) {
    return [
      '<tr>',
      td_(row.jobNumber + (row.projectName ? ' | ' + row.projectName : '')),
      td_(money_(row.contractRevenue), 'right'),
      td_(money_(row.actCost), 'right'),
      td_(money_(row.computedProfit), 'right'),
      td_(pct_(row.computedMargin), 'right'),
      '</tr>',
    ].join('');
  }).join('');
  return table_(['Job', 'Revenue Basis', 'Actual Cost', 'Profit', 'Margin'], body);
}

function arRiskTable_(rows) {
  if (!rows.length) return emptyState_('No 91+ A/R rows found.');
  const body = rows.map(function(row) {
    return [
      '<tr>',
      td_(row.customer || '-'),
      td_(row.jobNumber + (row.projectName ? ' | ' + row.projectName : '')),
      td_(money_(row.d91Plus), 'right'),
      td_(money_(row.total), 'right'),
      '</tr>',
    ].join('');
  }).join('');
  return table_(['Customer', 'Job', '91+ Days', 'Total A/R'], body);
}

function productionSummaryTable_(production, reworkCost, reworkHours) {
  const body = [
    ['Field reports', production.reportCount],
    ['Jobs worked', production.jobCount],
    ['Man hours', formatNumber_(production.manHours)],
    ['Base tons', formatNumber_(production.baseTons)],
    ['Asphalt tons', formatNumber_(production.asphaltTons)],
    ['Concrete CY', formatNumber_(production.concreteCy)],
    ['Rework cost', money_(reworkCost)],
    ['Rework hours', formatNumber_(reworkHours)],
  ].map(function(row) {
    return '<tr>' + td_(row[0]) + td_(row[1], 'right') + '</tr>';
  }).join('');
  return table_(['Metric', 'Value'], body);
}

function monthlyFinancialTable_(financials) {
  const body = [
    ['Contract-backed revenue', money_(financials.contractRevenue)],
    ['Actual cost', money_(financials.actualCost)],
    ['Computed profit', money_(financials.profit)],
    ['Average margin', pct_(financials.averageMargin)],
    ['Total A/R', money_(financials.arTotal)],
    ['A/R 91+', money_(financials.ar91Plus)],
  ].map(function(row) {
    return '<tr>' + td_(row[0]) + td_(row[1], 'right') + '</tr>';
  }).join('');
  return table_(['Metric', 'Value'], body);
}

function table_(headers, bodyHtml) {
  const headerHtml = headers.map(function(header) {
    return '<th style="text-align:left;padding:8px;border:1px solid #2F3437;background:#2F3437;color:#FFFFFF;font-size:11px;text-transform:uppercase;">' + escapeHtml_(header) + '</th>';
  }).join('');
  return '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr>' + headerHtml + '</tr></thead><tbody>' + bodyHtml + '</tbody></table>';
}

function td_(value, align) {
  return '<td style="padding:8px;border:1px solid #DDE2E5;text-align:' + (align || 'left') + ';vertical-align:top;">' + escapeHtml_(String(value === undefined || value === null ? '' : value)) + '</td>';
}

function emptyState_(message) {
  return '<div style="border:1px solid #DDE2E5;background:#FAFCFB;padding:12px;font-size:13px;color:#6D7478;">' + escapeHtml_(message) + '</div>';
}

function textSummary_(subject, production, missingReports, issues) {
  return [
    subject,
    'Field reports: ' + production.reportCount,
    'Jobs reported: ' + production.jobCount,
    'Man hours: ' + formatNumber_(production.manHours),
    'Base tons: ' + formatNumber_(production.baseTons),
    'Asphalt tons: ' + formatNumber_(production.asphaltTons),
    'Missing reports: ' + missingReports.length,
    'Field issues: ' + issues.length,
  ].join('\n');
}

function reinstallNewsletterTriggers_() {
  const handlers = [
    'sendDailySiteReport',
    'sendWeeklyProjectSummary',
    'sendWeeklyBusinessReview',
    'sendMonthlyOperationsOverview',
  ];
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (handlers.indexOf(trigger.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('sendDailySiteReport')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(30)
    .inTimezone(SUNBELT_NEWSLETTER.timeZone)
    .create();

  ScriptApp.newTrigger('sendWeeklyProjectSummary')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(7)
    .nearMinute(0)
    .inTimezone(SUNBELT_NEWSLETTER.timeZone)
    .create();

  ScriptApp.newTrigger('sendWeeklyBusinessReview')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(17)
    .nearMinute(0)
    .inTimezone(SUNBELT_NEWSLETTER.timeZone)
    .create();

  ScriptApp.newTrigger('sendMonthlyOperationsOverview')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(0)
    .inTimezone(SUNBELT_NEWSLETTER.timeZone)
    .create();
}

function setNewsletterRecipientsByKey_(propertyKey, emailCsv) {
  const recipients = parseRecipients_(emailCsv);
  if (!recipients.length) throw new Error('At least one recipient email is required.');
  PropertiesService.getScriptProperties().setProperty(propertyKey, recipients.join(','));
  return propertyKey + ' saved: ' + recipients.length + ' recipient(s).';
}

function getNewsletterLogSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty(SUNBELT_NEWSLETTER.properties.logSpreadsheetId);
  if (existingId) {
    try {
      return SpreadsheetApp.openById(existingId);
    } catch (error) {
      props.deleteProperty(SUNBELT_NEWSLETTER.properties.logSpreadsheetId);
    }
  }

  const ss = SpreadsheetApp.create(SUNBELT_NEWSLETTER.logSpreadsheetName);
  props.setProperty(SUNBELT_NEWSLETTER.properties.logSpreadsheetId, ss.getId());
  ensureNewsletterLogSheet_(ss);
  return ss;
}

function getNewsletterRecipients_(definition) {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(definition.recipientProperty)
    || props.getProperty(SUNBELT_NEWSLETTER.properties.defaultRecipients)
    || '';
  const recipients = parseRecipients_(raw);
  if (!recipients.length) throw new Error('No newsletter recipients are configured.');
  return recipients;
}

function assertNewsletterRecipientsConfigured_() {
  const props = PropertiesService.getScriptProperties();
  const keys = [
    SUNBELT_NEWSLETTER.properties.defaultRecipients,
    NEWSLETTER_DEFINITIONS.DAILY_SITE_REPORT.recipientProperty,
    NEWSLETTER_DEFINITIONS.WEEKLY_PROJECT_SUMMARY.recipientProperty,
    NEWSLETTER_DEFINITIONS.WEEKLY_BUSINESS_REVIEW.recipientProperty,
    NEWSLETTER_DEFINITIONS.MONTHLY_OPERATIONS_OVERVIEW.recipientProperty,
  ];
  const configured = keys.some(function(key) {
    return parseRecipients_(props.getProperty(key)).length > 0;
  });
  if (!configured) {
    throw new Error('Set newsletter recipients before installing triggers. Run setSunbeltNewsletterRecipients("ops@example.com").');
  }
}

function parseRecipients_(emailCsv) {
  return String(emailCsv || '')
    .split(/[,\n;]/)
    .map(function(email) { return email.trim(); })
    .filter(function(email) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email); });
}

function ensureNewsletterLogSheet_(ss) {
  let sheet = ss.getSheetByName(SUNBELT_NEWSLETTER.logSheet);
  if (!sheet) sheet = ss.insertSheet(SUNBELT_NEWSLETTER.logSheet);
  const headers = [
    'Run_At',
    'Newsletter_Key',
    'Newsletter_Name',
    'Period_Start',
    'Period_End',
    'Recipient_Count',
    'Recipients',
    'Status',
    'Subject',
    'Message',
    'Metrics_JSON',
  ];
  const current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const needsHeaders = headers.some(function(header, index) { return current[index] !== header; });
  if (needsHeaders) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function appendNewsletterLog_(ss, event) {
  const sheet = ensureNewsletterLogSheet_(ss);
  sheet.appendRow([
    formatDateTime_(new Date()),
    event.key,
    event.name,
    dateKey_(event.period.start),
    dateKey_(event.period.end),
    event.recipients.length,
    event.recipients.join(','),
    event.status,
    event.subject,
    event.message,
    JSON.stringify(event.metrics || {}),
  ]);
}

function logNewsletterSkipped_(key, period, reason) {
  const ss = getNewsletterLogSpreadsheet_();
  const definition = NEWSLETTER_DEFINITIONS[key];
  appendNewsletterLog_(ss, {
    key,
    name: definition ? definition.name : key,
    period,
    recipients: [],
    status: 'SKIPPED',
    subject: definition ? definition.name : key,
    message: reason,
    metrics: {},
  });
  return {
    ok: true,
    status: 'SKIPPED',
    newsletter: definition ? definition.name : key,
    reason,
    periodStart: dateKey_(period.start),
    periodEnd: dateKey_(period.end),
  };
}

function hasSuccessfulNewsletterRun_(ss, key, period) {
  const sheet = ensureNewsletterLogSheet_(ss);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const values = sheet.getRange(2, 1, lastRow - 1, 11).getDisplayValues();
  const periodStart = dateKey_(period.start);
  const periodEnd = dateKey_(period.end);
  return values.some(function(row) {
    return row[1] === key && row[3] === periodStart && row[4] === periodEnd && row[7] === 'SENT';
  });
}

function readObjects_(ss, tabName) {
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) throw new Error('Missing sheet tab: ' + tabName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];
  const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  if (values.length < 2) return [];
  const headers = uniqueHeaders_(values[0]);
  return values.slice(1).filter(function(row) {
    return row.some(function(cell) { return String(cell || '').trim(); });
  }).map(function(row) {
    const obj = {};
    headers.forEach(function(header, index) {
      obj[header] = row[index] === undefined ? '' : row[index];
    });
    return obj;
  });
}

function uniqueHeaders_(headers) {
  const counts = {};
  return headers.map(function(header, index) {
    const base = String(header || 'Column_' + (index + 1)).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    counts[base] = (counts[base] || 0) + 1;
    return counts[base] === 1 ? base : base + '__' + counts[base];
  });
}

function getAny_(row, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const exact = getByHeader_(row, aliases[i], true);
    if (exact) return exact;
  }
  for (let j = 0; j < aliases.length; j++) {
    const loose = getByHeader_(row, aliases[j], false);
    if (loose) return loose;
  }
  return '';
}

function getByHeader_(row, alias, exactOnly) {
  const aliasNorm = normalizeHeader_(alias);
  const keys = Object.keys(row);
  for (let i = 0; i < keys.length; i++) {
    if (normalizeHeader_(keys[i]) === aliasNorm && String(row[keys[i]] || '').trim()) return String(row[keys[i]]).trim();
  }
  if (exactOnly) return '';
  for (let j = 0; j < keys.length; j++) {
    const keyNorm = normalizeHeader_(keys[j]);
    if ((keyNorm.indexOf(aliasNorm) >= 0 || aliasNorm.indexOf(keyNorm) >= 0) && String(row[keys[j]] || '').trim()) {
      return String(row[keys[j]]).trim();
    }
  }
  return '';
}

function findHeaderIndex_(headers, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const target = normalizeHeader_(aliases[i]);
    for (let j = 0; j < headers.length; j++) {
      if (normalizeHeader_(headers[j]) === target || normalizeHeader_(headers[j]).indexOf(target) >= 0) return j;
    }
  }
  return -1;
}

function normalizeHeader_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function compactStatus_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function displayNewsletterJobStatus_(value) {
  const status = compactStatus_(value);
  if (status === 'active' || status === 'open' || status === 'inprogress') return 'Active';
  if (status === 'pending' || status === 'received' || status === 'signed') return 'Pending';
  if (status === 'closed' || status === 'complete' || status === 'completed' || status === 'done') return 'Closed';
  return String(value || '').trim() || 'Unknown';
}

function displayNewsletterScheduleStatus_(value, percentComplete) {
  const status = compactStatus_(value);
  const pct = number_(percentComplete);
  if (status === 'complete' || status === 'completed' || pct >= 100) return 'Complete';
  if (status === 'inprogress' || pct > 0) return 'In Progress';
  if (status === 'blocked') return 'Blocked';
  if (status === 'delayed' || status === 'atrisk') return 'Delayed';
  if (status === 'notstarted' || status === 'pending') return 'Not Started';
  return String(value || '').trim() || 'Unknown';
}

function number_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = String(value).replace(/[$,\s"]/g, '').replace(/%$/, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function sum_(rows, field) {
  return rows.reduce(function(total, row) { return total + (number_(row[field]) || 0); }, 0);
}

function unique_(values) {
  const out = [];
  values.forEach(function(value) {
    if (out.indexOf(value) < 0) out.push(value);
  });
  return out;
}

function indexBy_(rows, field) {
  const indexed = {};
  rows.forEach(function(row) {
    if (row[field]) indexed[row[field]] = row;
  });
  return indexed;
}

function parseDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
  const text = String(value).trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const mdy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (mdy) {
    const year = Number(mdy[3].length === 2 ? '20' + mdy[3] : mdy[3]);
    return new Date(year, Number(mdy[1]) - 1, Number(mdy[2]));
  }
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function todayInTimeZone_() {
  return parseYmd_(Utilities.formatDate(new Date(), SUNBELT_NEWSLETTER.timeZone, 'yyyy-MM-dd'));
}

function parseYmd_(ymd) {
  const parts = String(ymd).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function addDays_(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function dailyReportPeriod_() {
  const today = todayInTimeZone_();
  const day = today.getDay();
  const start = day === 1 ? addDays_(today, -3) : addDays_(today, -1);
  const end = addDays_(today, -1);
  return { start, end };
}

function trailingDaysPeriod_(days) {
  const today = todayInTimeZone_();
  const end = addDays_(today, -1);
  return { start: addDays_(end, -(days - 1)), end };
}

function nextDaysPeriod_(days) {
  const today = todayInTimeZone_();
  return { start: today, end: addDays_(today, days - 1) };
}

function previousMonthPeriod_() {
  const today = todayInTimeZone_();
  const firstCurrent = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = addDays_(firstCurrent, -1);
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return { start, end };
}

function isFirstMonday_(date) {
  return date.getDay() === 1 && date.getDate() <= 7;
}

function dateInPeriod_(date, period) {
  const key = dateKey_(date);
  return key >= dateKey_(period.start) && key <= dateKey_(period.end);
}

function rangesIntersect_(startA, endA, startB, endB) {
  return dateKey_(startA) <= dateKey_(endB) && dateKey_(endA) >= dateKey_(startB);
}

function dateKey_(date) {
  return Utilities.formatDate(date, SUNBELT_NEWSLETTER.timeZone, 'yyyy-MM-dd');
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, SUNBELT_NEWSLETTER.timeZone, 'yyyy-MM-dd HH:mm:ss');
}

function periodLabel_(period) {
  const start = dateKey_(period.start);
  const end = dateKey_(period.end);
  return start === end ? start : start + ' to ' + end;
}

function cleanJobNumber_(value) {
  const match = String(value || '').match(/\b(\d{2,3}-\d{3}[A-Z]?)\b/i);
  return match ? match[1].toUpperCase() : String(value || '').trim();
}

function extractJobNumber_(value) {
  const match = String(value || '').match(/\b(\d{2,3}-\d{3}[A-Z]?)\b/i);
  return match ? match[1].toUpperCase() : '';
}

function extractJobName_(label, jobNumber) {
  return String(label || '').replace(jobNumber || '', '').trim();
}

function cleanIssueText_(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^(no|none|n\/a|na|false|0)$/i.test(text)) return '';
  if (/^no\s*\(/i.test(text)) return '';
  return text;
}

function yesText_(value) {
  const text = cleanIssueText_(value);
  if (!text) return '';
  if (/^yes\b/i.test(text)) return text;
  return text.length > 2 ? text : '';
}

function formatNumber_(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function money_(value) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function pct_(value) {
  return (Number(value || 0) * 100).toFixed(1) + '%';
}

function escapeHtml_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
