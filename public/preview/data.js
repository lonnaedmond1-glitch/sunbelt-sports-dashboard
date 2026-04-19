// Sunbelt Sports — shared data module
// Lifted from the live portal, supplemented where realistic.

window.SBS_DATA = (() => {
  const jobs = [
    { id:"26-046", name:"American Leadership Academy", gc:"McLean Grading", pm:"David", state:"SC", status:"Pending", value:170243, billed:0, health:null, type:"Track Paving", crew:null, start:"2026-05-12", end:"2026-06-02", margin:null, billedPct:0 },
    { id:"25-177", name:"Brewer High School", gc:"Limestone Building", pm:"Jeff", state:"AL", status:"Executed", value:385230, billed:0, health:"N/S", type:"Track Paving", crew:"Julio / B1", start:"2026-04-21", end:"2026-05-04", margin:42, billedPct:0 },
    { id:"25-141", name:"Camden County High School", gc:"Heartland Construction", pm:"David", state:"NC", status:"Signed", value:693082, billed:256724, health:"OK", type:"Turn Key", crew:"Juan / B3", start:"2026-03-30", end:"2026-05-10", margin:38, billedPct:37, flags:["no-report","weather"] },
    { id:"25-161", name:"Camden County Sportsplex", gc:"Beynon", pm:"David", state:"SC", status:"Signed", value:307376, billed:0, health:null, type:"Track Paving", crew:null, start:"2026-05-20", end:"2026-06-15", margin:44, billedPct:0 },
    { id:"26-040", name:"Chateau Elan", gc:"Sunbelt Asphalt", pm:"David", state:"GA", status:"Signed", value:756170, billed:756170, health:"Watch", type:"Road Paving", crew:"Rosendo / P1", start:"2026-02-15", end:"2026-04-19", margin:22, billedPct:100 },
    { id:"26-058", name:"Covenant Day School", gc:"Beynon Sports", pm:"Jeff", state:"NC", status:"Pending", value:730293, billed:0, health:null, type:"Turn Key", crew:null, margin:48, billedPct:0 },
    { id:"26-057", name:"Chateau Elan speed tables", gc:"Chateau Elan HOA", pm:"Pedro", state:"GA", status:"Executed", value:15000, billed:15000, health:"OK", type:"Speed Tables", crew:null, margin:52, billedPct:100 },
    { id:"24-130", name:"Evans High School Tennis", gc:"Carolina Sports Concepts", pm:"David", state:"GA", status:"Executed", value:231299, billed:231299, health:"OK", type:"Tennis Courts", crew:null, margin:51, billedPct:100 },
    { id:"25-283", name:"Flint Hill Middle School", gc:"Tarkett Sports", pm:"David", state:"SC", status:"Signed", value:175632, billed:175632, health:null, type:"Track", crew:null, margin:47, billedPct:100 },
    { id:"25-271", name:"Hewitt Trussville High School", gc:"Warner's Athletics", pm:"Jeff", state:"AL", status:"Pending", value:268382, billed:0, health:null, type:"Track", crew:null, margin:44, billedPct:0 },
    { id:"25-301", name:"Johnson Elementary School", gc:"Geo Surfaces Midwest", pm:"Jeff", state:"AL", status:"Received", value:350713, billed:0, health:"N/S", type:"Paving", crew:null, margin:41, billedPct:0 },
    { id:"25-254", name:"Lakewood High School", gc:"Baseline Sports Const.", pm:"David", state:"SC", status:"Executed", value:428110, billed:428110, health:"OK", type:"Track Upgrades", crew:"Cesar", start:"2026-03-23", end:"2026-04-19", margin:28, billedPct:100, flags:["material-overrun"] },
    { id:"25-201", name:"Lake Wylie High School", gc:"Southern Builders", pm:"Jeff", state:"SC", status:"Executed", value:898758, billed:756772, health:"OK", type:"Turn Key", crew:"Rosendo / P1", start:"2026-03-23", end:"2026-04-19", margin:25, billedPct:84, flags:["budget-burn"] },
    { id:"24-165", name:"Lovejoy HS Track — Hampton", gc:"Evergreen Construction", pm:"Jeff", state:"GA", status:"Executed", value:603334, billed:0, health:"N/S", type:"Track Upgrades", crew:null, start:"2026-04-21", end:"2026-05-11", margin:46, billedPct:0 },
    { id:"25-323", name:"Madison County High School", gc:"Specialty Turf", pm:"Jeff", state:"AL", status:"Pending", value:297828, billed:0, health:null, type:"Track", crew:null, margin:43, billedPct:0 },
    { id:"24-205", name:"New South MS / HS", gc:"Tarkett Sports", pm:"David", state:"NC", status:"Executed", value:447427, billed:208931, health:"OK", type:"Paving", crew:"Rosendo / P1", start:"2026-04-16", end:"2026-04-22", margin:33, billedPct:47 },
    { id:"25-160", name:"North Central High School", gc:"Beynon", pm:"David", state:"SC", status:"Received", value:212069, billed:0, health:"N/S", type:"Track", crew:null, margin:45, billedPct:0 },
    { id:"26-011", name:"Pine Lake Prep Sports Complex", gc:"Beynon", pm:"David", state:"NC", status:"Signed", value:649000, billed:0, health:null, type:"Sports Complex", crew:null, margin:49, billedPct:0 },
    { id:"25-140", name:"Percy Julian High School", gc:"Sports Turf Company", pm:"Jeff", state:"AL", status:"Pending", value:440238, billed:0, health:null, type:"Track", crew:null, margin:45, billedPct:0 },
    { id:"25-324", name:"Porter Ridge High School", gc:"Beynon", pm:"David", state:"NC", status:"Pending", value:284206, billed:0, health:"N/S", type:"Track Paving", crew:"Julio / B1", margin:40, billedPct:0 },
    { id:"25-215", name:"Richmond Senior High School", gc:"Geo Surfaces", pm:"David", state:"NC", status:"Pending", value:189147, billed:0, health:null, type:"Track", crew:null, margin:46, billedPct:0 },
    { id:"25-093", name:"Rome Middle School", gc:"Field Turf", pm:"Jeff", state:"GA", status:"Executed", value:406955, billed:406955, health:"OK", type:"Track Upgrades", crew:null, margin:50, billedPct:100 },
    { id:"25-290", name:"University of Alabama Huntsville", gc:"Warner's Athletics", pm:"Jeff", state:"AL", status:"Pending", value:634525, billed:0, health:null, type:"Track Paving", crew:null, start:"2026-04-21", end:"2026-06-01", margin:42, billedPct:0 },
    { id:"25-135", name:"Veterans MS", gc:"Parish Construction", pm:"Jeff", state:"GA", status:"Executed", value:777753, billed:92588, health:"Watch", type:"Turn Key", crew:"Martin / B2", start:"2026-04-17", end:"2026-05-28", margin:31, billedPct:12 },
    { id:"25-145", name:"Wilson's Mill High School — Smithfield", gc:"Fred Smith Const", pm:"David", state:"NC", status:"Executed", value:618305, billed:618305, health:"OK", type:"Track", crew:null, margin:36, billedPct:100 },
    { id:"24-228", name:"Woodruff HS Tennis", gc:"Carolina Sports Concepts", pm:"David", state:"SC", status:"Executed", value:305663, billed:305663, health:"OK", type:"Tennis Courts", crew:null, start:"2026-04-16", end:"2026-04-22", margin:53, billedPct:100 },
    { id:"25-278", name:"Lithia Springs High School", gc:"Sports Turf", pm:"—", state:"GA", status:"Pending", value:281307, billed:0, health:null, type:"Track", crew:null, margin:45, billedPct:0 },
    { id:"25-319", name:"Plains High School", gc:"Warners Athletics", pm:"Jeff", state:"AL", status:"Pending", value:558910, billed:0, health:null, type:"Track", crew:null, margin:48, billedPct:0 },
    { id:"25-306", name:"Tift County Academy", gc:"Parrish Construction", pm:"David", state:"GA", status:"Received", value:598215, billed:0, health:"N/S", type:"Track", crew:null, margin:44, billedPct:0 },
    { id:"25-262", name:"Clayton High School", gc:"Fred Smith Const", pm:"David", state:"NC", status:"Pending", value:466731, billed:0, health:null, type:"Track", crew:null, margin:47, billedPct:0 },
    { id:"26-013", name:"North Garner Middle School", gc:"Fred Smith Const", pm:"—", state:"NC", status:"Pending", value:587663, billed:0, health:null, type:"Track", crew:null, margin:45, billedPct:0 },
    { id:"25-063", name:"Tennis Courts (New Const)", gc:"Jeremy Heidl", pm:"—", state:"GA", status:"Pending", value:0, billed:0, health:null, type:"Tennis", crew:null, margin:null, billedPct:0 },
    { id:"25-001", name:"Chris Allen Driveway Paving", gc:"—", pm:"—", state:"GA", status:"Pending", value:0, billed:0, health:"N/S", type:"Paving", crew:null, margin:null, billedPct:0 },
    { id:"25-897", name:"New Sports Office", gc:"—", pm:"—", state:"GA", status:"Pending", value:0, billed:0, health:null, type:"Build-Out", crew:null, margin:0, billedPct:0, loss:-51000 },
    { id:"30-001", name:"Scruggs Paving (labor only)", gc:"—", pm:"—", state:"GA", status:"Pending", value:0, billed:0, health:"N/S", type:"Paving", crew:null, margin:-13, billedPct:0, loss:-20000 },
  ];

  const kpis = {
    portfolioValue: 13769564,
    totalJobs: 35,
    activeJobs: 9,
    scheduledJobs: 10,
    billedToDate: 4269000,
    fleetAtJobsites: 2,
    fleetTotal: 8,
    missingReports: 1,
    criticalAlerts: 2,
    warnAlerts: 1,
    arOutstanding: 2690000,
    arCurrent: 1312000,
    arOverdue: 618000,
    avgMargin: 46.2,
    marginAtRisk: 70000,
    reworkFYTD: 0,
    changeOrdersFYTD: 0,
  };

  const alerts = [
    { id:1, level:"critical", tag:"NO FIELD REPORT", job:"25-141", name:"Camden County High School", msg:"No report from yesterday. Juan / B3.", pm:"David", time:"2h ago" },
    { id:2, level:"warn", tag:"MATERIAL OVERRUN", job:"25-254", name:"Lakewood High School", msg:"1,717.57t used / 1,520t budgeted (13% over).", pm:"David", time:"4h ago" },
    { id:3, level:"critical", tag:"WEATHER", job:"25-141", name:"Camden County High School", msg:"Drizzle, 31% rain, 21mph wind today.", pm:"David", time:"6h ago" },
    { id:4, level:"warn", tag:"AR AGING", job:"25-897", name:"Camden County SD", msg:"Invoice 61-90 days. No response to last two.", pm:"David", time:"yesterday" },
  ];

  const equipment = [
    { id:"PAV-01", name:"Vögele Paver", type:"Paver", status:"on-job", location:"Wilson's Mill", job:"25-333", hours:2840, service:"in 120h" },
    { id:"PAV-02", name:"Cat AP1055F", type:"Paver", status:"transit", location:"→ Braselton", job:"25-333", hours:1920, service:"in 340h" },
    { id:"ROL-01", name:"Hamm HD12", type:"Roller", status:"on-job", location:"Lake Wylie", job:"25-201", hours:4112, service:"overdue 12h" },
    { id:"ROL-02", name:"Cat CB34", type:"Roller", status:"on-job", location:"Flint Hill", job:"25-283", hours:3208, service:"in 80h" },
    { id:"ROL-03", name:"Hamm DV+70", type:"Roller", status:"yard", location:"Auburn Yard", job:null, hours:2611, service:"due now" },
    { id:"GRD-01", name:"Cat 140M Grader", type:"Grader", status:"on-job", location:"Camden HS", job:"25-141", hours:5201, service:"in 220h" },
    { id:"MEC-01", name:"Mecalac 8MCR", type:"Excavator", status:"on-job", location:"Veterans MS", job:"25-135", hours:1450, service:"in 400h" },
    { id:"SKD-01", name:"Bobcat T770", type:"Skid Steer", status:"transit", location:"→ Braselton", job:"25-201", hours:3100, service:"in 60h" },
    { id:"GRN-01", name:"Grinding Set A", type:"Grinder", status:"on-job", location:"Braselton", job:"26-040", hours:1820, service:"in 180h" },
    { id:"GRN-02", name:"Grinding Set B", type:"Grinder", status:"yard", location:"Auburn Yard", job:null, hours:2990, service:"in 40h" },
    { id:"MIL-01", name:"Wirtgen W100", type:"Mill", status:"yard", location:"Auburn Yard", job:null, hours:3640, service:"in 260h" },
    { id:"PVR-03", name:"Cat AP600F", type:"Paver", status:"on-job", location:"Camden HS", job:"25-141", hours:1210, service:"in 510h" },
  ];

  const fleet = [
    { id:"TRK-01", type:"Lowboy", driver:"David Hudson", status:"in-transit", from:"Reynolds Warren", to:"Braselton", job:"26-040", miles:42850, loc:[33.9,-84.2], mpg:6.8, dvir:"ok", fuelPct:62, idleHrsWk:3.2 },
    { id:"TRK-02", type:"Tractor", driver:"Miguel Ortiz", status:"on-site", from:"Auburn Yard", to:"Lake Wylie HS", job:"25-201", miles:128400, loc:[35.1,-81.1], mpg:5.9, dvir:"ok", fuelPct:78, idleHrsWk:5.1 },
    { id:"TRK-03", type:"Dump",    driver:"Ron Nelson", status:"on-site", from:"Vulcan Pit", to:"Camden HS", job:"25-141", miles:89120, loc:[36.3,-76.3], mpg:6.2, dvir:"defect", fuelPct:34, idleHrsWk:8.9 },
    { id:"TRK-04", type:"Dump",    driver:"Luis Garcia", status:"returning", from:"Veterans MS", to:"Auburn Yard", job:"25-135", miles:54200, loc:[32.6,-83.6], mpg:6.5, dvir:"ok", fuelPct:55, idleHrsWk:4.4 },
    { id:"TRK-05", type:"Pickup",  driver:"Jeff M.", status:"on-site", from:"—", to:"Brewer HS", job:"25-177", miles:61200, loc:[34.5,-86.9], mpg:18.2, dvir:"ok", fuelPct:80, idleHrsWk:2.1 },
    { id:"TRK-06", type:"Pickup",  driver:"David PM", status:"idle", from:"Auburn Yard", to:"—", job:null, miles:44100, loc:[32.6,-85.5], mpg:19.1, dvir:"missing", fuelPct:45, idleHrsWk:0 },
    { id:"TRK-07", type:"Tractor", driver:"Cesar Ramirez",   status:"on-site", from:"Shop", to:"Lakewood HS", job:"25-254", miles:75410, loc:[34.1,-80.9], mpg:6.0, dvir:"ok", fuelPct:71, idleHrsWk:3.8 },
    { id:"TRK-08", type:"Lowboy", driver:"unassigned",   status:"yard", from:"—", to:"Auburn Yard", job:null, miles:92300, loc:[32.6,-85.5], mpg:6.4, dvir:"ok", fuelPct:90, idleHrsWk:0 },
  ];

  // Drivers — full roster with HOS, DOT, certs, duty status
  // FMCSA 60/7 rule: 60h driving in 7 days; 11h drive / 14h on-duty per day; 10h rest; 8-day recap
  const drivers = [
    { id:"DRV-01", name:"David Hudson", photo:"DH", cdl:"Class A", vehicle:"TRK-01", status:"DRIVING",
      hos:{ driveToday:6.5, onDutyToday:9.1, driveLimit:11, onDutyLimit:14, cycle:42.1, cycleLimit:60, breakIn:1.5 },
      dvir:{ last:"Today 05:42", result:"OK" },
      medical:{ expires:"2026-11-08", daysLeft:203 },
      cdlExpires:"2027-04-12",
      last90:{ violations:0, incidents:0, inspections:2 },
      mpg:6.8, milesWk:1420,
      recap:[ 9.1, 10.8, 11.0, 8.2, 0, 0, 9.1 ] // last 7 days on-duty
    },
    { id:"DRV-02", name:"Miguel Ortiz", photo:"MO", cdl:"Class A", vehicle:"TRK-02", status:"ON-DUTY",
      hos:{ driveToday:4.2, onDutyToday:7.0, driveLimit:11, onDutyLimit:14, cycle:38.5, cycleLimit:60, breakIn:3.0 },
      dvir:{ last:"Today 06:10", result:"OK" },
      medical:{ expires:"2026-08-22", daysLeft:125 },
      cdlExpires:"2026-12-01",
      last90:{ violations:0, incidents:0, inspections:1 },
      mpg:5.9, milesWk:1180,
      recap:[ 7.0, 11.2, 10.4, 9.8, 8.0, 0, 7.0 ]
    },
    { id:"DRV-03", name:"Ron Nelson", photo:"RN", cdl:"Class A", vehicle:"TRK-03", status:"VIOLATION",
      hos:{ driveToday:10.8, onDutyToday:13.5, driveLimit:11, onDutyLimit:14, cycle:58.2, cycleLimit:60, breakIn:0.0 },
      dvir:{ last:"Today 06:22", result:"DEFECT — air brake warning" },
      medical:{ expires:"2026-05-02", daysLeft:13, flag:"expiring" },
      cdlExpires:"2026-06-19", cdlFlag:"expiring",
      last90:{ violations:1, incidents:0, inspections:3 },
      mpg:6.2, milesWk:1610,
      recap:[ 13.5, 12.8, 11.9, 10.5, 12.0, 9.8, 13.5 ]
    },
    { id:"DRV-04", name:"Luis Garcia", photo:"LG", cdl:"Class A", vehicle:"TRK-04", status:"OFF-DUTY",
      hos:{ driveToday:0, onDutyToday:0, driveLimit:11, onDutyLimit:14, cycle:31.4, cycleLimit:60, breakIn:null },
      dvir:{ last:"Yesterday 18:40", result:"OK" },
      medical:{ expires:"2027-02-14", daysLeft:301 },
      cdlExpires:"2028-03-05",
      last90:{ violations:0, incidents:1, inspections:2 },
      mpg:6.5, milesWk:980,
      recap:[ 0, 9.2, 8.8, 10.1, 9.4, 0, 0 ]
    },
    { id:"DRV-05", name:"Cesar Ramirez", photo:"CR", cdl:"Class B", vehicle:"TRK-07", status:"DRIVING",
      hos:{ driveToday:3.8, onDutyToday:5.2, driveLimit:11, onDutyLimit:14, cycle:28.9, cycleLimit:60, breakIn:4.8 },
      dvir:{ last:"Today 06:01", result:"OK" },
      medical:{ expires:"2026-09-30", daysLeft:164 },
      cdlExpires:"2027-01-22",
      last90:{ violations:0, incidents:0, inspections:1 },
      mpg:6.0, milesWk:920,
      recap:[ 5.2, 8.1, 7.4, 6.9, 7.0, 0, 5.2 ]
    },
    { id:"DRV-06", name:"Juan Perez", photo:"JP", cdl:"Class A", vehicle:"—", status:"SLEEPER",
      hos:{ driveToday:9.8, onDutyToday:12.1, driveLimit:11, onDutyLimit:14, cycle:48.6, cycleLimit:60, breakIn:null },
      dvir:{ last:"Today 05:55", result:"OK" },
      medical:{ expires:"2026-06-15", daysLeft:57, flag:"approaching" },
      cdlExpires:"2026-10-04",
      last90:{ violations:0, incidents:0, inspections:0 },
      mpg:null, milesWk:1280,
      recap:[ 12.1, 11.8, 10.9, 11.2, 10.5, 9.1, 12.1 ]
    },
    { id:"DRV-07", name:"Rosendo Flores", photo:"RF", cdl:"Class A", vehicle:"—", status:"ON-DUTY",
      hos:{ driveToday:2.1, onDutyToday:3.5, driveLimit:11, onDutyLimit:14, cycle:22.4, cycleLimit:60, breakIn:5.5 },
      dvir:{ last:"Today 06:18", result:"OK" },
      medical:{ expires:"2027-05-11", daysLeft:387 },
      cdlExpires:"2028-08-22",
      last90:{ violations:0, incidents:0, inspections:1 },
      mpg:null, milesWk:740,
      recap:[ 3.5, 8.2, 7.8, 8.1, 7.4, 0, 3.5 ]
    },
    { id:"DRV-08", name:"Martin Lopez", photo:"ML", cdl:"Class B", vehicle:"—", status:"OFF-DUTY",
      hos:{ driveToday:0, onDutyToday:0, driveLimit:11, onDutyLimit:14, cycle:19.8, cycleLimit:60, breakIn:null },
      dvir:{ last:"Yesterday 17:30", result:"OK" },
      medical:{ expires:"2026-07-02", daysLeft:74 },
      cdlExpires:"2027-11-10",
      last90:{ violations:0, incidents:0, inspections:0 },
      mpg:null, milesWk:680,
      recap:[ 0, 7.2, 6.8, 7.1, 6.9, 0, 0 ]
    },
  ];

  // IFTA miles by state (last 30 days)
  const iftaByState = [
    { state:"GA", miles:18420 }, { state:"NC", miles:12180 },
    { state:"SC", miles:9640 }, { state:"AL", miles:11200 },
    { state:"TN", miles:1420 }, { state:"FL", miles:680 },
  ];

  // Safety incidents (last 90d)
  const safetyEvents = [
    { date:"Apr 02", driver:"Luis Garcia", type:"Minor backing incident", severity:"low", job:"25-135", resolved:true },
    { date:"Mar 18", driver:"Ron Nelson", type:"Log violation — 14h exceeded", severity:"med", job:"25-141", resolved:true },
    { date:"Feb 27", driver:"Miguel Ortiz", type:"Pre-trip skipped (reopened)", severity:"low", job:"25-254", resolved:true },
  ];

  const crews = [
    { name:"Rosendo / P1", type:"Paving Crew", pm:"David", headcount:6, job:"25-001 New South MS" },
    { name:"Julio / B1",   type:"Base Crew",   pm:"Jeff",  headcount:5, job:"25-324 Porter Ridge" },
    { name:"Martin / B2",  type:"Base Crew",   pm:"Jeff",  headcount:5, job:"25-135 Veterans MS" },
    { name:"Juan / B3",    type:"Base Crew",   pm:"David", headcount:4, job:"25-141 Camden HS" },
    { name:"Cesar",        type:"Floater",     pm:"Jeff",  headcount:2, job:"25-254 Lakewood" },
  ];

  const lowboyMoves = [
    { day:"MON", date:"Apr 13", label:"Paver → Reynolds Warren. Grinding set Pike → Braselton" },
    { day:"TUE", date:"Apr 14", label:"Mecalec: Carver → Veterans", job:"25-135" },
    { day:"WED", date:"Apr 15", label:"Paving set → Wilson's Mill (Paver fr Braselton, Rollers fr Flint Hill)", job:"30-001" },
    { day:"THU", date:"Apr 16", label:"Skid Steer: Lake Wylie → Braselton", job:"25-201" },
    { day:"FRI", date:"Apr 17", label:"Grinding Set: Braselton → Lakewood", job:"25-254" },
    { day:"SAT", date:"Apr 18", label:null },
    { day:"SUN", date:"Apr 19", label:null },
  ];

  // Stylized SE job pin positions (viewBox 0 0 800 500) — relative SE USA layout
  const mapPins = [
    { job:"25-177", state:"AL", x:260, y:260, status:"ok" },
    { job:"25-141", state:"NC", x:580, y:140, status:"critical" },
    { job:"26-040", state:"GA", x:400, y:280, status:"watch" },
    { job:"25-254", state:"SC", x:520, y:230, status:"warn" },
    { job:"25-201", state:"SC", x:500, y:200, status:"ok" },
    { job:"25-324", state:"NC", x:560, y:180, status:"ns" },
    { job:"25-093", state:"GA", x:380, y:240, status:"ok" },
    { job:"25-135", state:"GA", x:420, y:330, status:"watch" },
    { job:"25-290", state:"AL", x:280, y:220, status:"ok" },
    { job:"24-228", state:"SC", x:470, y:260, status:"ok" },
    { job:"25-001", state:"GA", x:400, y:310, status:"ns" },
  ];

  // Sales pipeline
  const pipeline = [
    { stage:"Lead",      count:14, value:4_200_000 },
    { stage:"Qualified", count:9,  value:3_100_000 },
    { stage:"Proposal",  count:7,  value:2_400_000 },
    { stage:"Negotiation",count:4, value:1_850_000 },
    { stage:"Won",       count:11, value:4_690_000 },
  ];

  const deals = [
    { id:"D-482", client:"Covenant Day School", type:"Turn Key Track", value:730293, stage:"Proposal", prob:60, close:"2026-05-10", owner:"Jeff" },
    { id:"D-491", client:"Pine Lake Prep", type:"Sports Complex", value:649000, stage:"Negotiation", prob:80, close:"2026-05-02", owner:"David" },
    { id:"D-499", client:"North Garner MS", type:"Track Paving", value:587663, stage:"Qualified", prob:30, close:"2026-06-01", owner:"—" },
    { id:"D-503", client:"UAH", type:"Track Paving", value:634525, stage:"Proposal", prob:55, close:"2026-05-20", owner:"Jeff" },
    { id:"D-507", client:"Percy Julian HS", type:"Track", value:440238, stage:"Qualified", prob:25, close:"2026-07-01", owner:"Jeff" },
    { id:"D-512", client:"Madison County HS", type:"Track", value:297828, stage:"Lead", prob:15, close:"2026-08-01", owner:"Jeff" },
  ];

  // Marketing
  const marketing = {
    pipeline: { leads: 142, mql: 48, sql: 22, proposals: 7, won: 11 },
    channels: [
      { name:"Direct Referral", leads:62, cost:0, cpl:0, share:44 },
      { name:"Google Ads", leads:31, cost:4200, cpl:135, share:22 },
      { name:"Trade Show", leads:22, cost:18000, cpl:818, share:15 },
      { name:"LinkedIn", leads:14, cost:1800, cpl:129, share:10 },
      { name:"Organic Search", leads:13, cost:0, cpl:0, share:9 },
    ],
    campaigns: [
      { name:"Q2 High School Outreach", status:"active", budget:12000, spent:7400, leads:18, impressions:142000 },
      { name:"FieldTurf Co-Op Campaign", status:"active", budget:18000, spent:11200, leads:14, impressions:98000 },
      { name:"Tennis Facility Modernization", status:"paused", budget:8000, spent:2100, leads:4, impressions:31000 },
      { name:"Municipal RFP Watchlist", status:"active", budget:5000, spent:2800, leads:6, impressions:0 },
    ],
    social: [
      { channel:"Instagram", followers:4820, growth:+6.2, engagement:4.1 },
      { channel:"LinkedIn", followers:2140, growth:+11.4, engagement:5.8 },
      { channel:"YouTube", followers:612, growth:+3.1, engagement:9.2 },
      { channel:"Facebook", followers:3410, growth:+1.2, engagement:2.0 },
    ],
    caseStudies: [
      { id:"cs-01", title:"Rome Middle School — 8-Lane Track", copy:"474t asphalt, 0 rework, delivered 4 days early.", status:"Featured" },
      { id:"cs-02", title:"Chateau Elan — Road Paving", copy:"Complete road overlay, punch list clear on hand-off.", status:"Published" },
      { id:"cs-03", title:"Lake Wylie HS — Turn Key", copy:"Track + field + stripes, single mobilization.", status:"In Review" },
      { id:"cs-04", title:"Evans HS — Tennis Courts", copy:"6 courts resurfaced in 9 days — 51% margin.", status:"Published" },
    ],
  };

  // Scorecard grades per project (A–F)
  const scorecard = jobs.filter(j=>j.billed>0 || j.health).map(j => {
    const margin = j.margin ?? 0;
    const grade = (v) => v>=90?"A": v>=80?"B": v>=70?"C": v>=60?"D":"F";
    const marginScore = Math.max(0, Math.min(100, 50 + margin*1.2));
    const scheduleScore = j.health==="OK"?92: j.health==="Watch"?74: j.health==="N/S"?62:80;
    const safetyScore = 88 + ((j.id.charCodeAt(3)||0)%10);
    const qualityScore = j.flags?.includes("material-overrun")?68: j.flags?.includes("budget-burn")?74:90;
    const overall = Math.round((marginScore+scheduleScore+safetyScore+qualityScore)/4);
    return {
      ...j,
      grades:{
        margin:grade(marginScore), schedule:grade(scheduleScore),
        safety:grade(safetyScore), quality:grade(qualityScore),
        overall:grade(overall),
      },
      scores:{ margin:Math.round(marginScore), schedule:scheduleScore, safety:safetyScore, quality:qualityScore, overall },
    };
  });

  return { jobs, kpis, alerts, equipment, fleet, drivers, iftaByState, safetyEvents, crews, lowboyMoves, mapPins, pipeline, deals, marketing, scorecard };
})();
