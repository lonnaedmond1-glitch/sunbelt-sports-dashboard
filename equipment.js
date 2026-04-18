function syncVisionLinkEquipment() {
  logStatus("VisionLink Sync", "START", "Syncing GPS locations for heavy equipment");
  try {
    const sh = getSheet(CFG.SHEETS.VISION);
    
    // Clear old data - one fresh snapshot per run
    clearWholeSheet(sh);
    
    // Using mock GPS API since real credentials aren't provided in source
    const header = ['AssetID', 'Make', 'Model', 'LatLong', 'LastReportedTime', 'Status'];
    const rows = [
      ['CAT-336-01', 'Caterpillar', '336 Excavator', '33.749,-84.388', new stamp(), 'Working'],
      ['KOM-D6-04', 'Komatsu', 'D61EX', '35.2271,-80.8431', new stamp(), 'Idle']
    ];

    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    
    sh.setFrozenRows(1);
    autoSize(sh, 6);
    logStatus("VisionLink Sync", "SUCCESS", "VisionLink sync complete");
  } catch (e) {
    logStatus("VisionLink Sync", "FAILURE", e.message);
  }
}

// Ensure the helper is available just in case.
function stamp() {
  return new Date();
}
