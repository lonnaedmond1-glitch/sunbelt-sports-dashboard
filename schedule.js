function translateSchedule() {
  logStatus("Schedule", "START", "Rebuilding Schedule logic");
  try {
    rebuildScheduleHelpers();
    logStatus("Schedule", "SUCCESS", "Schedule mapped idempotently");
  } catch (e) {
    logStatus("Schedule", "ERROR", e.message);
  }
}

function rebuildScheduleHelpers() {
  const sh = getSheet(CFG.SHEETS.SCHEDULE);
  const activeJobs = getActiveJobs();
  const lastRow = Math.max(sh.getLastRow(), 20);

  ensureSheetColumnsVisible(sh, 11);
  // Idempotent: Never append duplicates. Clean existing columns first
  clearAndUnmerge(sh, 4, 11, lastRow, Math.max(sh.getMaxColumns() - 10, 2));

  sh.getRange(4, 11, 1, 2).setValues([['Clean_Job_Num', 'Clean_Job_Name']]).setFontWeight('bold');

  const values = sh.getRange(5, 1, Math.max(lastRow - 4, 1), 10).getValues();
  const out = values.map(row => {
    const rawJobNum = String(row[0] || '').trim();
    const rawJobName = String(row[1] || '').trim();

    if (!rawJobNum && !rawJobName) return ['', ''];

    let match = activeJobs.find(j => j.jobNumber === rawJobNum);

    if (!match && rawJobName) {
      const key = normalizeText(rawJobName);
      match = activeJobs.find(j => {
        const jKey = normalizeText(j.jobName);
        return jKey === key || jKey.includes(key) || key.includes(jKey);
      });
    }

    return match ? [match.jobNumber, match.jobName] : ['UNMAPPED', 'UNMAPPED'];
  });

  if (out.length) {
    sh.getRange(5, 11, out.length, 2).setValues(out);
  }

  // Remove any remaining columns that might have shifted
  if (sh.getMaxColumns() >= 13) {
    try { sh.deleteColumns(13, sh.getMaxColumns() - 12); } catch (e) {}
  }

  sh.setFrozenRows(4);
  autoSize(sh, 12);
}

function rebuildWeatherWatch() {
  const schedule = getSheet(CFG.SHEETS.SCHEDULE);
  const weather = getSheet(CFG.SHEETS.WEATHER);
  const activeJobs = getActiveJobs();
  const activeMap = new Map(activeJobs.map(j => [j.jobNumber, j]));

  const scheduleLastRow = Math.max(schedule.getLastRow(), 5);
  const scheduleRows = schedule.getRange(5, 1, Math.max(scheduleLastRow - 4, 1), 6).getValues();

  clearAndUnmerge(weather, 1, 1, Math.max(weather.getMaxRows(), 1000), 9);

  weather.getRange(1, 1).setValue('WEATHER WATCH');
  weather.getRange(2, 1).setValue('This is the watch list for scheduled jobs. Fill rain % or paste forecast notes when a job is close.');
  weather.getRange(4, 1, 1, 9).setValues([[
    'Job Number', 'Job Name', 'City', 'State', 'Forecast Date', 'Rain %', 'Conditions', 'Risk', 'Search Query'
  ]]).setFontWeight('bold');

  const out = [];
  scheduleRows.forEach(row => {
    const jobNumber = String(row[0] || '').trim();
    const jobName = String(row[1] || '').trim();
    const scheduledStart = row[4];

    if (!jobNumber && !jobName) return;

    const meta = activeMap.get(jobNumber) || {};
    out.push([
      jobNumber,
      meta.jobName || jobName,
      meta.city || '',
      meta.state || '',
      scheduledStart || '',
      '',
      '',
      '',
      ''
    ]);
  });

  if (out.length) {
    weather.getRange(5, 1, out.length, 9).setValues(out);
  }

  const lastRow = weather.getLastRow();
  if (lastRow >= 5) {
    for (let r = 5; r <= lastRow; r++) {
      weather.getRange(r, 8).setFormula(`=IF(F${r}>=50,"BAD",IF(F${r}>=30,"WATCH","OK"))`);
      weather.getRange(r, 9).setFormula(`=IF(E${r}="","Set schedule date first","weather " & C${r} & ", " & D${r} & " " & TEXT(E${r},"m/d/yyyy"))`);
    }
  }

  weather.setFrozenRows(4);
  autoSize(weather, 9);
}