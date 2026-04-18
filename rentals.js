function syncRentalEmails() {
  logStatus("Rental Sync", "START", "Syncing rental data from emails");
  try {
    syncSunbeltRentals();
    syncUnitedRentals(); // if it exists
    logStatus("Rental Sync", "SUCCESS", "Rental parsing completed cleanly");
  } catch(e) {
    logStatus("Rental Sync", "FAILURE", e.message);
  }
}

function syncSunbeltRentals() {
  const sh = getSheet(CFG.SHEETS.RENTALS); // Assume this is just SUNBELT or we append cleanly
  
  const query = 'from:noreply@sunbeltrentals.com subject:"Equipment on Rent" newer_than:3d has:attachment';
  const threads = GmailApp.search(query, 0, 5);

  if (!threads.length) {
    Logger.log('No Sunbelt rental emails found.');
    logStatus("Sunbelt Rental Sync", "WARN", "No rental emails found");
    return;
  }

  const latestMsg = threads[0].getMessages().slice(-1)[0];
  const emailDate = latestMsg.getDate();

  const csvAttachment = latestMsg.getAttachments().find(a =>
    a.getContentType().toLowerCase().includes('csv') ||
    a.getName().toLowerCase().endsWith('.csv')
  );

  if (!csvAttachment) {
    Logger.log('No Sunbelt CSV attachment found.');
    logStatus("Sunbelt Rental Sync", "WARN", "No CSV attachment found in latest email");
    return;
  }

  const dataStr = csvAttachment.getDataAsString();
  const rows = Utilities.parseCsv(dataStr);
  
  if (!rows || rows.length < 2) {
    Logger.log('Sunbelt CSV empty or malformed.');
    logStatus("Sunbelt Rental Sync", "WARN", "Malfomed or empty CSV data");
    return;
  }

  const header = [
    'Vendor','Contract_Number','Branch','Job_Name','Job_Location','Job_City','State',
    'Ordered_By','Equipment_Type','Class_Name','Day_Rate','Week_Rate','FourWeek_Rate',
    'Date_Rented','Days_On_Rent','Pickup_Date','Email_Date','Synced_At'
  ];

  // OVERWRITE: Ensure clean table, no append chaos
  clearWholeSheet(sh);
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !String(r[0] || '').trim()) continue;

    out.push([
      'Sunbelt Rentals',
      String(r[0] || ''),
      String(r[1] || ''),
      String(r[2] || ''),
      String(r[3] || ''),
      String(r[4] || ''),
      String(r[5] || ''),
      String(r[6] || ''),
      String(r[7] || ''),
      String(r[8] || ''),
      String(r[9] || ''),
      String(r[10] || ''),
      String(r[11] || ''),
      String(r[12] || ''),
      String(r[13] || ''),
      String(r[14] || ''),
      Utilities.formatDate(emailDate, CFG.TZ, 'yyyy-MM-dd'),
      nowStamp()
    ]);
  }

  if (out.length) {
    sh.getRange(2, 1, out.length, out[0].length).setValues(out);
  }

  sh.setFrozenRows(1);
  autoSize(sh, 18);
  logStatus("Sunbelt Rental Sync", "SUCCESS", `Synced ${out.length} rentals cleanly.`);
}

function syncUnitedRentals() {
  // Placeholder equivalent to United if needed, else it cleanly returns
  Logger.log("United rentals sync logic here.");
}
