function extractNewJobsFromLevel10() {
  logStatus("Level10 Intake", "START", "Extracting new jobs");
  try {
    // Label Mock API
    Logger.log("Extracting links from Level 10...");
    logStatus("Level10 Intake", "SUCCESS", "Jobs extracted successfully");
  } catch (e) {
    logStatus("Level10 Intake", "ERROR", e.message);
  }
}

function pushJobsToHotelAPIs() {
  logStatus("Hotel APIs", "START", "Pushing jobs to hotel systems");
  try {
    // Label Mock API
    Logger.log("Calling Hotel APIs...");
    logStatus("Hotel APIs", "SUCCESS", "Hotel API push complete");
  } catch (e) {
    logStatus("Hotel APIs", "ERROR", e.message);
  }
}

function processFollowUps() {
  logStatus("Alert System", "START", "Processing follow-ups");
  try {
    const ss = getSS();
    let emailTodo = ss.getSheetByName(CFG.SHEETS.EMAIL_TODO);
    if (!emailTodo) {
      emailTodo = ss.insertSheet(CFG.SHEETS.EMAIL_TODO);
      emailTodo.appendRow(["Timestamp", "Job Number", "Job Name", "Prep Item", "Action Needed"]);
      emailTodo.getRange(1, 1, 1, 5).setFontWeight("bold");
    }

    const prepSheet = ss.getSheetByName(CFG.SHEETS.PREP);
    if (!prepSheet || prepSheet.getLastRow() < 2) return;

    const prepData = prepSheet.getDataRange().getValues();
    // Headers: Prep_ID, Job Number, Job Name, State, Prep Item...
    // Index: Job=1, Name=2, Item=4, Status=11, Action=12
    
    // Get existing to deduplicate
    const todoData = emailTodo.getDataRange().getValues();
    // Assuming format Job=1, Item=3. Creating a composite key Job+Item
    const existingKeys = new Set(todoData.slice(1).map(r => String(r[1]).trim() + "|" + String(r[3]).trim()));

    const newRows = [];
    for (let i = 1; i < prepData.length; i++) {
        const row = prepData[i];
        const status = String(row[11] || '').trim();
        if (status === 'NO ACCOUNT' || status === 'CHECK') {
            const jobNumber = String(row[1] || '').trim();
            const jobName = String(row[2] || '').trim();
            const prepItem = String(row[4] || '').trim();
            const nextAction = String(row[12] || '').trim();
            
            const key = jobNumber + "|" + prepItem;
            if (!existingKeys.has(key)) {
                newRows.push([nowStamp(), jobNumber, jobName, prepItem, nextAction]);
                existingKeys.add(key); // prevent duplicates within the same run if any
            }
        }
    }

    if (newRows.length > 0) {
        emailTodo.getRange(emailTodo.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
        autoSize(emailTodo, 5);
        logStatus("Alert System", "SUCCESS", `Added ${newRows.length} new follow-ups`);
    } else {
        logStatus("Alert System", "SUCCESS", "No new follow-ups to add");
    }

  } catch (e) {
    logStatus("Alert System", "ERROR", e.message);
  }
}
