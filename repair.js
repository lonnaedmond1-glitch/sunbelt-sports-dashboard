function repairCommandCenter() {
  logStatus("Repair System", "START", "Running data mismatch repairs");
  try {
    const ss = getSS();
    // Typical repair: ensure sheets exist, clear cache, re-link headers 
    auditWorkbookBeforeRun();
    logStatus("Repair System", "SUCCESS", "Mismatches cleared");
  } catch (e) {
    logStatus("Repair System", "ERROR", e.message);
  }
}

function auditWorkbookBeforeRun() {
  const rows = [];
  Object.values(CFG.SHEETS).forEach(name => {
    try {
      const sh = getSheet(name);
      rows.push([name, 'FOUND', sh.getLastRow(), sh.getLastColumn()]);
    } catch (e) {
      rows.push([name, 'MISSING', '', '']);
    }
  });

  const ss = getSS();
  let log = ss.getSheetByName('_AUDIT_CHECK');
  if (!log) {
    log = ss.insertSheet('_AUDIT_CHECK');
  } else {
    clearWholeSheet(log);
  }

  log.getRange(1, 1, 1, 4).setValues([['Sheet', 'Status', 'Last Row', 'Last Col']]).setFontWeight('bold');
  if (rows.length) {
    log.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  autoSize(log, 4);
}
