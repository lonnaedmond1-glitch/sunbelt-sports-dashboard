export const SHEET_IDS = {
  scorecardHub: '1yNpkY-gcbeZS2hGPyATTkDdt8iMbmOm4mhy7WGidKfY',
  projectSetup: '1eIwv3pK0BBH3n4Uds6YZu4GWdMrlS3SAEFzsU3OKS5I',
  projectPrepAutomation: '1wBHDEtBLUPA-aCWfh9NvBIGVBbBWNMTiZaVu73Jb5QA',
  level10: '1WAxsAA7aSjA4OA6KLG1PvY34ImCuDixxiluN2-JRfzQ',
  gantt: '178t9iioyveWqP6o8x2lQwMagexDP0W9FA4I2jfutJmw',
  estimating: '1uvHDu3GmBpJhXLNw_bm-rYqXGcQxO1tbBUBSvhsz2zw',
  bidLog: '1RhHIJooRFj-ChTwQlIl-EYx8IIcW02QT',
  legacyQbo: '1LYmHPUfoSW_UQq0mtQ7s9APvDJlymh_9trYRxc3lSss',
} as const;

export const SCORECARD_TABS = {
  dashboard: 'SCORECARD DASHBOARD',
  masterJobs: 'MASTER JOB INDEX',
  estVsActual: 'Est vs Actual',
  qboEstVsActuals: 'QBO Est vs Actuals',
  qboArAging: 'QBO AR Aging',
  rework: 'REWORK_LOG',
  fieldLegacy: 'JOTFORM_FIELD_RAW',
  fieldForms: 'Form Responses 1',
  msProjectScheduleLive: 'MS_PROJECT_SCHEDULE_LIVE',
  weatherWatch: 'Weather_Watch',
  visionLinkEquipment: 'VisionLink_Equipment',
  visionLinkLive: 'VisionLink_Live',
  onRent: 'ON RENT',
  projectScorecardsLive: 'Project_Scorecards_Live',
  marketingLeads: 'Marketing_Leads',
} as const;

export const PROJECT_SETUP_TABS = {
  activeJobs: 'Active_Jobs',
  jobPrepBoard: 'Job_Prep_Board',
  jobDocs: 'Job Docs',
  rentalStatusOverrides: 'Rental_Status_Overrides',
  sunbeltRentalsLive: 'Sunbelt Rentals Live',
  unitedRentalsLive: 'United Rentals Live',
} as const;

export const PREP_AUTOMATION_TABS = {
  parsedJobs: 'Parsed_Jobs',
  jobSetup: 'Job_Setup',
  taskBoard: 'Task_Board',
} as const;

export const REQUIRED_HEADERS = {
  scorecardDashboard: [
    'Job #',
    'Job Name',
    'PM',
    'Status',
    'Estimated Asphalt Tons',
    'Actual Asphalt Tons',
    'Variance Tons',
    'Variance %',
    'Man Hours',
    'Efficiency',
  ],
  masterJobs: [
    'Job #',
    'Job Name',
    'Job Status',
    'Contract Amount',
    'Estimated GAB Tons',
    'Estimated Binder Tons',
    'Estimated Topping Tons',
    'Estimated Asphalt Tons',
    'PM',
    'PM Email',
  ],
  estVsActual: [
    'Job #',
    'Job Name',
    'PM',
    'Estimated GAB Tons',
    'Actual GAB Tons',
    'Estimated Binder Tons',
    'Actual Binder Tons',
    'Estimated Topping Tons',
    'Actual Topping Tons',
    'Estimated Asphalt Tons',
    'Actual Asphalt Tons',
    'Man Hours',
    'Status',
  ],
  qboEstVsActuals: [
    'Job_Number',
    'Project_Name',
    'Est_Cost',
    'Act_Cost',
    'Est_Income',
    'Act_Income',
    'Profit',
    'Profit_Margin',
    'Updated_At',
  ],
  qboArAging: [
    'Job_Number',
    'Project_Name',
    'Customer',
    'Current',
    'Days_1_30',
    'Days_31_60',
    'Days_61_90',
    'Days_91_Plus',
    'Total',
    'Updated_At',
  ],
  msProjectScheduleLive: [
    'Job_Number',
    'Job_Name',
    'Task_Name',
    'Task_Type',
    'Duration_Days',
    'Percent_Complete',
    'Start_Date',
    'Finish_Date',
    'Actual_Start_Date',
    'Actual_Finish_Date',
    'Snapshot_Date',
    'Source_File',
    'Matched_Master_Job',
    'Schedule_Status',
    'Parse_Status',
  ],
  projectSetupActiveJobs: [
    'Job Number',
    'Job Name',
    'WIP Status',
    'City',
    'State',
    'Latitude',
    'Longitude',
  ],
  projectSetupPrepBoard: [
    'Prep_ID',
    'Job Number',
    'Job Name',
    'Prep Item',
    'Work Order Need / Vendor',
    'Account Status',
    'Status',
    'Next Action',
  ],
  prepAutomationParsedJobs: [
    'Job Number',
    'Job Name',
    'Work Order Link',
    'Job Folder Link',
    'Asphalt Scope',
    'Base/GAB Scope',
  ],
} as const;

export const STATUS_CONTRACT = {
  dashboardAction: ['Open', 'In Progress', 'Waiting', 'Done'],
  jobLifecycle: ['Active', 'Pending', 'Closed', 'Complete', 'Done'],
  contract: ['Received', 'Pending', 'Signed', 'Executed'],
  scheduleExecution: ['Not Started', 'In Progress', 'Complete', 'Blocked', 'Delayed'],
  prepReadiness: ['READY', 'REVIEW', 'BLOCKED'],
  sourceConnection: ['connected', 'missing', 'failed'],
} as const;

export type CanonicalJobLifecycle = 'ACTIVE' | 'PENDING' | 'CLOSED' | 'UNKNOWN';
export type CanonicalContractStatus = 'RECEIVED' | 'PENDING' | 'SIGNED' | 'EXECUTED' | 'UNKNOWN';
export type CanonicalScheduleStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'BLOCKED' | 'DELAYED' | 'UNKNOWN';
export type CanonicalActionStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'DONE' | 'SNOOZED';

function compactStatus(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function normalizeJobLifecycleStatus(value: unknown): CanonicalJobLifecycle {
  const status = compactStatus(value);
  if (!status) return 'UNKNOWN';
  if (['active', 'open', 'inprogress', 'started', 'working'].includes(status)) return 'ACTIVE';
  if (['pending', 'received', 'signed', 'bid', 'notstarted'].includes(status)) return 'PENDING';
  if (['closed', 'complete', 'completed', 'done', 'cancelled', 'canceled'].includes(status)) return 'CLOSED';
  return 'UNKNOWN';
}

export function normalizeContractStatus(value: unknown): CanonicalContractStatus {
  const status = compactStatus(value);
  if (status === 'received') return 'RECEIVED';
  if (status === 'pending') return 'PENDING';
  if (status === 'signed') return 'SIGNED';
  if (status === 'executed') return 'EXECUTED';
  return 'UNKNOWN';
}

export function normalizeScheduleStatus(value: unknown, percentComplete?: unknown): CanonicalScheduleStatus {
  const status = compactStatus(value);
  const percent = Number(String(percentComplete || '').replace(/[^0-9.-]+/g, ''));
  if (status === 'complete' || status === 'completed' || percent >= 100) return 'COMPLETE';
  if (status === 'inprogress' || (Number.isFinite(percent) && percent > 0)) return 'IN_PROGRESS';
  if (status === 'blocked') return 'BLOCKED';
  if (status === 'delayed' || status === 'atrisk') return 'DELAYED';
  if (status === 'notstarted' || status === 'pending') return 'NOT_STARTED';
  return 'UNKNOWN';
}

export function normalizeActionStatus(value: unknown): CanonicalActionStatus {
  const status = compactStatus(value);
  if (status === 'inprogress' || status === 'working') return 'IN_PROGRESS';
  if (status === 'waiting' || status === 'blocked') return 'WAITING';
  if (status === 'done' || status === 'complete' || status === 'completed' || status === 'resolved') return 'DONE';
  if (status === 'snoozed') return 'SNOOZED';
  return 'OPEN';
}

export function isTerminalJobStatus(value: unknown): boolean {
  return normalizeJobLifecycleStatus(value) === 'CLOSED';
}

export function displayJobLifecycleStatus(value: unknown): string {
  const status = normalizeJobLifecycleStatus(value);
  if (status === 'ACTIVE') return 'Active';
  if (status === 'PENDING') return 'Pending';
  if (status === 'CLOSED') return 'Closed';
  return String(value || '').trim() || 'Unknown';
}

export function displayScheduleStatus(value: unknown, percentComplete?: unknown): string {
  const status = normalizeScheduleStatus(value, percentComplete);
  if (status === 'COMPLETE') return 'Complete';
  if (status === 'IN_PROGRESS') return 'In Progress';
  if (status === 'BLOCKED') return 'Blocked';
  if (status === 'DELAYED') return 'Delayed';
  if (status === 'NOT_STARTED') return 'Not Started';
  return String(value || '').trim() || 'Unknown';
}
