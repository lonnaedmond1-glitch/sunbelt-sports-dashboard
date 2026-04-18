function executeOneTimeReportingUpgrade() {
  logStatus("Reporting Upgrade", "START", "Executing hardcoded Google Sheets formula repoints (Steps 1-4)");
  try {
    const ss = getSS();
    
    // ==========================================
    // STEP 1: Destroy Dashboard Links to Transform Copies
    // ==========================================
    Logger.log("Step 1: Re-pointing SCORECARD DASHBOARD formulas...");
    const dashboard = ss.getSheetByName(CFG.SHEETS.SCORECARD_DASHBOARD);
    if (dashboard) {
       // Replace any formula trace pointing to dead copies with MASTER JOB INDEX natively
       dashboard.createTextFinder("Copy of Master Jobs").matchFormulaText(true).replaceAllWith("MASTER JOB INDEX");
       dashboard.createTextFinder("Estimated Clean").matchFormulaText(true).replaceAllWith("MASTER JOB INDEX");
       dashboard.createTextFinder("Copy of Execution Status").matchFormulaText(true).replaceAllWith("MASTER JOB INDEX");
    }

    // ==========================================
    // STEP 2: Sync Variance Logic in EST VS ACT
    // ==========================================
    Logger.log("Step 2: Re-pointing EST VS ACT formulas...");
    const estVsAct = ss.getSheetByName(CFG.SHEETS.EST_VS_ACT);
    if (estVsAct) {
       // Replace WIP_Translator or Estimated Clean with MASTER JOB INDEX in all formulas
       estVsAct.createTextFinder("WIP_Translator").matchFormulaText(true).replaceAllWith("MASTER JOB INDEX");
       estVsAct.createTextFinder("Estimated Clean").matchFormulaText(true).replaceAllWith("MASTER JOB INDEX");
    }

    // ==========================================
    // STEP 3: Make Critical Attention a Read-Only Filter
    // ==========================================
    Logger.log("Step 3: Stripping raw math from CRITICAL ATTENTION...");
    const criticalAtt = ss.getSheetByName(CFG.SHEETS.CRITICAL_ATTENTION);
    if (criticalAtt) {
       // Strip out raw SUM/variance logic, replace completely with pure filter.
       clearWholeSheet(criticalAtt);
       // The QUERY fetches data dynamically based on the G = 'CRITICAL' flag in Dashboard
       criticalAtt.getRange("A1").setFormula(`=QUERY('${CFG.SHEETS.SCORECARD_DASHBOARD}'!A:Z, "SELECT * WHERE G = 'CRITICAL'", 1)`);
    }

    // ==========================================
    // STEP 4: Cleanup Danger Zones
    // ==========================================
    Logger.log("Step 4: Purging dead transform layers...");
    const sheetsToDelete = [
      "Estimated Clean", 
      "Copy of Master Jobs", 
      "Copy of Execution Status"
    ];
    
    sheetsToDelete.forEach(name => {
       const sh = ss.getSheetByName(name);
       if (sh) {
           ss.deleteSheet(sh);
           Logger.log("Deleted dead layer: " + name);
       }
    });

    // Hide 'Form Responses 1'
    const formResponses = ss.getSheetByName("Form Responses 1");
    if (formResponses) {
        formResponses.hideSheet();
        Logger.log("Hid Form Responses 1 to prevent secondary raw intake use.");
    }

    logStatus("Reporting Upgrade", "SUCCESS", "Formulas re-pointed, QUERY injected, and dead sheets purged.");
    Logger.log("✅ Upgrade Actions Executed Successfully");

  } catch (err) {
    logStatus("Reporting Upgrade", "ERROR", err.message);
    Logger.log("❌ ERROR: " + err.message);
  }
}
