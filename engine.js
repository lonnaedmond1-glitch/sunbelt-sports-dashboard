/**
 * SUNBELT COMMAND CENTER ENGINE
 * This is the ONLY function you schedule on a trigger.
 * Everything else becomes a sub-function.
 */
function runSunbeltCommandCenter() {
  // Lock protection to prevent overlapping executions
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // 30 seconds wait
  } catch (e) {
    Logger.log("❌ Could not obtain lock. Script is already running.");
    return;
  }

  const start = new Date();
  Logger.log("🚀 Starting Sunbelt Command Center...");
  logStatus("Engine", "START", "runSunbeltCommandCenter triggered");

  try {
    // 1. Intake new jobs from Level 10
    Logger.log("📥 Extracting new jobs...");
    extractNewJobsFromLevel10();

    // 1.5. HYDRATE MASTER JOB INDEX (NEW - CORE TO STABILITY)
    Logger.log("💧 Hydrating Master Job Index...");
    hydrateMasterJobIndex();

    // 2. Clean and map schedule (FIRST - Clean Mapping)
    Logger.log("📅 Translating schedule...");
    translateSchedule();

    // 3. Repair data mismatches (EARLY - fix mismatches)
    Logger.log("🧹 Running repair logic...");
    repairCommandCenter();

    // 4. Push jobs to hotel systems
    Logger.log("🏨 Pushing jobs to Hotel APIs...");
    pushJobsToHotelAPIs();

    // 5. Sync rental data from emails
    Logger.log("🚛 Syncing rental emails...");
    syncRentalEmails();

    // 6. Sync equipment GPS
    Logger.log("📡 Syncing equipment...");
    syncVisionLinkEquipment();

    // 7. Update weather intelligence
    Logger.log("🌦 Updating weather...");
    updateDailyWeatherForActiveJobs();

    // 8. Prep Board rebuild
    Logger.log("📋 Rebuilding job prep board...");
    rebuildJobPrepBoard();
    
    // 9. Alerts
    Logger.log("📬 Processing Follow Ups...");
    processFollowUps();

    Logger.log("✅ Command Center Complete");
    logStatus("Engine", "SUCCESS", "All systems ran normally");
  } catch (err) {
    Logger.log("❌ ERROR: " + err.message);
    logStatus("Engine", "CRITICAL_ERROR", err.message);
  } finally {
    lock.releaseLock();
  }

  const end = new Date();
  Logger.log(`⏱ Runtime: ${(end - start) / 1000}s`);
  logStatus("Engine", "END", `Total Runtime: ${(end - start) / 1000}s`);
}

// Ensure ONLY this trigger is available
function createHourlyTrigger() {
  // Delete all existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));

  // Build the one true trigger
  ScriptApp.newTrigger('runSunbeltCommandCenter')
    .timeBased()
    .everyHours(1)
    .create();
}
