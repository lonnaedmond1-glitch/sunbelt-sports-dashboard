function hydrateMasterJobIndex() {
  logStatus("Master Hydration", "START", "Pulling from WIP_Translator to MASTER JOB INDEX");
  try {
    const shWIP = getSheet(CFG.SHEETS.WIP_TRANSLATOR);
    const shMaster = getSheet(CFG.SHEETS.MASTER_INDEX);

    // Get WIP Data
    const wipData = shWIP.getDataRange().getValues();
    if (wipData.length < 2) throw new Error("WIP_Translator is empty or missing headers");

    // Find headers in WIP
    const headers = wipData[0].map(h => String(h).trim().toLowerCase());
    
    // Create mapping indexes with extremely broad matching
    const idx = {
        jobNum: headers.findIndex(h => h.includes("job") && (h.includes("#") || h.includes("num"))),
        jobName: headers.findIndex(h => h.includes("job name")),
        status: headers.findIndex(h => h.includes("status")),
        contractAmt: headers.findIndex(h => h.includes("contract")),
        gabTons: headers.findIndex(h => h.match(/\bgab\b/)),
        binderTons: headers.findIndex(h => h.includes("binder")),
        toppingTons: headers.findIndex(h => h.includes("topping")),
        asphaltTons: headers.findIndex(h => h.includes("asphalt") && !h.includes("plant")),
        pm: headers.findIndex(h => h === "pm" || h.includes("project manager")),
        pmEmail: headers.findIndex(h => h.includes("email"))
    };

    const out = [];
    // Standard output headers strictly compliant with the new master schema
    const targetHeaders = [
        "Job #", "Job Name", "Job Status", "Contract Amount",
        "Estimated GAB Tons", "Estimated Binder Tons", "Estimated Topping Tons", 
        "Estimated Asphalt Tons", "PM", "PM Email"
    ];

    for (let r = 1; r < wipData.length; r++) {
        const row = wipData[r];
        const jobNum = row[idx.jobNum];
        if (!jobNum) continue;

        out.push([
            jobNum,
            idx.jobName >= 0 ? row[idx.jobName] : '',
            idx.status >= 0 ? row[idx.status] : '',
            idx.contractAmt >= 0 ? row[idx.contractAmt] : '',
            idx.gabTons >= 0 ? row[idx.gabTons] : '',
            idx.binderTons >= 0 ? row[idx.binderTons] : '',
            idx.toppingTons >= 0 ? row[idx.toppingTons] : '',
            idx.asphaltTons >= 0 ? row[idx.asphaltTons] : '',
            idx.pm >= 0 ? row[idx.pm] : '',
            idx.pmEmail >= 0 ? row[idx.pmEmail] : ''
        ]);
    }

    // Clear and rewrite Master idempotently 
    clearWholeSheet(shMaster);
    shMaster.getRange(1, 1, 1, targetHeaders.length).setValues([targetHeaders]).setFontWeight("bold");
    
    if (out.length > 0) {
        shMaster.getRange(2, 1, out.length, targetHeaders.length).setValues(out);
    }
    
    autoSize(shMaster, targetHeaders.length);
    logStatus("Master Hydration", "SUCCESS", `Hydrated ${out.length} jobs into MASTER JOB INDEX`);

  } catch (err) {
    logStatus("Master Hydration", "ERROR", err.message);
  }
}
