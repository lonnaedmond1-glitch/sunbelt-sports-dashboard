function getActiveJobs() {
  const sheet = getSheet(CFG.SHEETS.ACTIVE);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];

  const idx = {
    jobNumber: headers.indexOf('Job Number'),
    jobName: headers.indexOf('Job Name'),
    wipStatus: headers.indexOf('WIP Status'),
    address: headers.indexOf('Address'),
    city: headers.indexOf('City'),
    state: headers.indexOf('State'),
    planDate: headers.indexOf('Plan Date'),
    asphaltSource: headers.indexOf('Asphalt Source'),
    quarrySource: headers.indexOf('Quarry Source'),
    estTons: headers.indexOf('Est Tons'),
    estLoads: headers.indexOf('Est Loads'),
    needPlant: headers.indexOf('Need Plant'),
    needQuarry: headers.indexOf('Need Quarry'),
    needDisposal: headers.indexOf('Need Disposal'),
    needTrucks: headers.indexOf('Need Trucks'),
    needEquipment: headers.indexOf('Need Equipment'),
    accountRisk: headers.indexOf('Account Risk'),
    dumpSetup: headers.indexOf('Dump Setup'),
    rentalFocus: headers.indexOf('Rental Focus')
  };

  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const jobNumber = String(row[idx.jobNumber] || '').trim();
    if (!jobNumber) continue;

    out.push({
      jobNumber,
      jobName: String(row[idx.jobName] || '').trim(),
      wipStatus: String(row[idx.wipStatus] || '').trim(),
      address: String(row[idx.address] || '').trim(),
      city: String(row[idx.city] || '').trim(),
      state: String(row[idx.state] || '').trim(),
      planDate: row[idx.planDate],
      asphaltSource: String(row[idx.asphaltSource] || '').trim(),
      quarrySource: String(row[idx.quarrySource] || '').trim(),
      estTons: String(row[idx.estTons] || '').trim(),
      estLoads: String(row[idx.estLoads] || '').trim(),
      needPlant: String(row[idx.needPlant] || '').trim().toUpperCase(),
      needQuarry: String(row[idx.needQuarry] || '').trim().toUpperCase(),
      needDisposal: String(row[idx.needDisposal] || '').trim().toUpperCase(),
      needTrucks: String(row[idx.needTrucks] || '').trim().toUpperCase(),
      needEquipment: String(row[idx.needEquipment] || '').trim().toUpperCase(),
      accountRisk: String(row[idx.accountRisk] || '').trim(),
      dumpSetup: String(row[idx.dumpSetup] || '').trim().toUpperCase(),
      rentalFocus: String(row[idx.rentalFocus] || '').trim().toUpperCase()
    });
  }
  return out;
}

function loadMaster(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  const headerRow = findHeaderRow(values, ['Vendor Display', 'State', 'Source', 'Account Status'], 10);
  if (headerRow < 1) throw new Error(`Could not find header row on ${sheetName}`);

  const headers = values[headerRow - 1];
  const idx = {
    vendor: headers.indexOf('Vendor Display'),
    state: headers.indexOf('State'),
    source: headers.indexOf('Source'),
    account: headers.indexOf('Account Status'),
    phone: headers.indexOf('Phone'),
    email: headers.indexOf('Email'),
    category: headers.indexOf('Category'),
    notes: headers.indexOf('Notes')
  };

  const out = [];
  for (let r = headerRow; r < values.length; r++) {
    const row = values[r];
    const vendor = String(row[idx.vendor] || '').trim();
    if (!vendor) continue;

    out.push({
      vendor,
      vendorKey: normalizeText(vendor),
      state: String(row[idx.state] || '').trim(),
      source: String(row[idx.source] || '').trim(),
      account: String(row[idx.account] || '').trim(),
      phone: String(row[idx.phone] || '').trim(),
      email: String(row[idx.email] || '').trim(),
      category: String(row[idx.category] || '').trim(),
      notes: String(row[idx.notes] || '').trim()
    });
  }
  return out;
}

function lookupVendor(masterRows, primaryVendor, state) {
  const target = normalizeText(primaryVendor);
  if (!target) return null;

  const stateRows = masterRows.filter(r => !state || !r.state || r.state === state);

  return (
    stateRows.find(r => r.vendorKey === target) ||
    stateRows.find(r => r.vendorKey.includes(target) || target.includes(r.vendorKey)) ||
    masterRows.find(r => r.vendorKey === target) ||
    masterRows.find(r => r.vendorKey.includes(target) || target.includes(r.vendorKey)) ||
    null
  );
}

function getAlternates(masterRows, state, excludeVendor, limit) {
  const ex = normalizeText(excludeVendor);
  let rows = masterRows.filter(r => !state || !r.state || r.state === state);
  if (!rows.length) rows = masterRows;

  const alts = rows
    .filter(r => normalizeText(r.vendor) !== ex)
    .map(r => r.vendor);

  return [...new Set(alts)].slice(0, limit || 2);
}

function pickMiscAlternates(masterRows, state) {
  const alts = getAlternates(masterRows, state, '', 2);
  if (alts.length >= 2) return alts;
  if (alts.length === 1) return [alts[0], 'Lowes'];
  return ['Home Depot', 'Lowes'];
}

function createPrepRow(job, prepItem, primaryValue, accountStatus, alt1, alt2, status, nextAction, riskNote) {
  return [
    stableId(`${job.jobNumber}|${prepItem}`),
    job.jobNumber,
    job.jobName,
    job.state,
    prepItem,
    primaryValue,
    accountStatus,
    false,
    alt1 || '',
    alt2 || '',
    job.city,
    status,
    nextAction,
    riskNote
  ];
}

function rebuildJobPrepBoard() {
  logStatus("Prep Board", "START", "Rebuilding Prep Board");
  try {
    const sh = getSheet(CFG.SHEETS.PREP);
    const jobs = getActiveJobs();

    const asphaltRows = loadMaster(CFG.SHEETS.ASPHALT);
    const quarryRows = loadMaster(CFG.SHEETS.QUARRY);
    const concreteRows = loadMaster(CFG.SHEETS.CONCRETE);
    const haulerRows = loadMaster(CFG.SHEETS.HAULERS);
    const dumpRows = loadMaster(CFG.SHEETS.DUMP);
    const miscRows = loadMaster(CFG.SHEETS.MISC);
    const equipRows = loadMaster(CFG.SHEETS.EQUIP_VENDORS);

    const header = [
      'Prep_ID', 'Job Number', 'Job Name', 'State', 'Prep Item',
      'Work Order Need / Vendor', 'Account Status', 'Pending App?',
      'Alternate 1', 'Alternate 2', 'Search / City', 'Status',
      'Next Action', 'Risk Note'
    ];

    const out = [];

    jobs.forEach(job => {
      if (job.needPlant === 'YES') {
        const match = lookupVendor(asphaltRows, job.asphaltSource, job.state);
        const alts = getAlternates(asphaltRows, job.state, job.asphaltSource, 2);
        const account = match ? (match.account || 'NO ACCOUNT') : 'NO ACCOUNT';
        const status = String(account).toUpperCase() === 'OPEN' ? 'READY' : 'NO ACCOUNT';
        out.push(createPrepRow(job, 'Asphalt Plant', job.asphaltSource || 'CHECK', account, alts[0], alts[1], status, status === 'READY' ? 'Confirm rates' : 'Start credit app', match ? match.notes : 'Vendor not seen'));
      }
      if (job.needQuarry === 'YES') {
        const match = lookupVendor(quarryRows, job.quarrySource, job.state);
        const alts = getAlternates(quarryRows, job.state, job.quarrySource, 2);
        const account = match ? (match.account || 'CHECK') : 'CHECK';
        const status = String(account).toUpperCase() === 'OPEN' ? 'READY' : 'CHECK';
        out.push(createPrepRow(job, 'Rock / Quarry', job.quarrySource || 'CHECK', account, alts[0], alts[1], status, 'Confirm rates', match ? match.notes : 'Need confirmation'));
      }
      {
        const alts = getAlternates(concreteRows, job.state, '', 2);
        out.push(createPrepRow(job, 'Concrete / Field Events', 'Check scope', 'CHECK', alts[0] || 'Argos', alts[1], 'CHECK', 'Review scope', 'Needs review'));
      }
      if (job.needTrucks === 'YES') {
        const alts = getAlternates(haulerRows, job.state, '', 2);
        out.push(createPrepRow(job, 'Haulers / Trucks', job.estLoads || 'Check count', 'CHECK', alts[0], alts[1], 'CHECK', 'Line up trucks', 'Need haulers'));
      }
      if (job.needDisposal === 'YES' || job.dumpSetup === 'YES') {
        const alts = getAlternates(dumpRows, job.state, '', 2);
        out.push(createPrepRow(job, 'Dump Site / Debris', 'Debris', 'CHECK', alts[0] || 'Waste Management', alts[1], 'CHECK', 'Find local dump', 'Need pricing'));
      }
      if (job.needEquipment === 'YES' || job.rentalFocus === 'YES') {
        const alts = getAlternates(equipRows, job.state, '', 2);
        out.push(createPrepRow(job, 'Equipment On Rent', 'Cost burn', 'CHECK', 'Sunbelt Rentals', alts[0], 'CHECK', 'Track rentals', 'Use watch tab'));
      }
      {
        const alts = pickMiscAlternates(miscRows, job.state);
        out.push(createPrepRow(job, 'Misc Supplies', 'Odds & ends', 'CHECK', alts[0] || 'Home Depot', alts[1] || 'Lowes', 'CHECK', 'Use supply master', 'Keep CC out'));
      }
    });

    clearWholeSheet(sh);
    clearConditionalRules(sh);

    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    if (out.length) {
      sh.getRange(2, 1, out.length, header.length).setValues(out);
    }

    sh.setFrozenRows(1);
    autoSize(sh, 14);
    stylePrepBoard();
    rebuildDashboard();
    logStatus("Prep Board", "SUCCESS", "Prep board generated correctly");
  } catch (e) {
    logStatus("Prep Board", "ERROR", e.message);
  }
}

function stylePrepBoard() {
  const sh = getSheet(CFG.SHEETS.PREP);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const checkboxRange = sh.getRange(2, 8, lastRow - 1, 1);
  checkboxRange.clearDataValidations();
  checkboxRange.insertCheckboxes();

  const statusRange = sh.getRange(2, 12, lastRow - 1, 1);
  clearConditionalRules(sh);

  const rules = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('READY').setBackground('#D9EAD3').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('CHECK').setBackground('#FFF2CC').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('NO ACCOUNT').setBackground('#F4CCCC').setRanges([statusRange]).build()
  ];
  sh.setConditionalFormatRules(rules);
}

function rebuildDashboard() {
  const sh = getSheet(CFG.SHEETS.DASHBOARD);
  clearAndUnmerge(sh, 1, 1, 30, 10);

  sh.getRange(1, 1, 1, 10).merge();
  sh.getRange(1, 1).setValue('SUNBELT COORDINATOR COMMAND CENTER');

  sh.getRange(4, 1).setValue('Active Jobs');
  sh.getRange(4, 4).setValue('Prep Rows');
  sh.getRange(4, 7).setValue('No Account Flags');
  sh.getRange(4, 10).setValue('Follow Up Flags');

  sh.getRange(5, 1).setFormula(`=COUNTA('${CFG.SHEETS.ACTIVE}'!C:C)-1`);
  sh.getRange(5, 4).setFormula(`=COUNTA('${CFG.SHEETS.PREP}'!B:B)-1`);
  sh.getRange(5, 7).setFormula(`=COUNTIF('${CFG.SHEETS.PREP}'!L:L,"NO ACCOUNT")`);
  sh.getRange(5, 10).setFormula(`=COUNTIF('${CFG.SHEETS.EMAIL_TODO}'!D:D,"*Follow*")`);
  
  sh.setHiddenGridlines(true);
}
