import 'server-only';

import {
  getIntelligenceHealth,
  hashSnapshot,
  readLastDashboardBrief,
  saveDashboardBrief,
  type StoredDashboardBrief,
} from '@/lib/intelligence-store';

export type IntelligenceMode = 'LOCAL' | 'GEMINI' | 'OPENAI';
export type AIProvider = 'LOCAL' | 'GEMINI' | 'OPENAI';
export type SourceConnectionStatus = 'connected' | 'missing' | 'failed';
export type OperationsSourceType = 'QBO' | 'AR' | 'REPORT' | 'FLEET' | 'SCHEDULE' | 'CREW_CAPACITY' | 'RISK' | 'JOB' | 'MANUAL';
export type OperationsPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type OperationsStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'DONE' | 'SNOOZED';
export type OperationsActionType = 'OPEN_SOURCE' | 'OPEN_JOB' | 'CREATE_TASK' | 'ASSIGN_OWNER' | 'SEND_EMAIL_DRAFT' | 'CREATE_REMINDER' | 'ESCALATE' | 'SNOOZE' | 'MARK_RESOLVED';
export type OperationsCategory = 'QBO' | 'AR' | 'REPORTS' | 'FLEET' | 'SCHEDULE' | 'CREW_CAPACITY' | 'LIVE_RISKS';
export type OperationsImpact = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
export type WatchlistCategory = 'CASH' | 'AR' | 'QBO' | 'FLEET' | 'SCHEDULE' | 'CREW' | 'JOB_RISK' | 'REPORTING' | 'OTHER';
export type DashboardModelRoute = 'DEFAULT' | 'EXECUTIVE' | 'DEEP_AUDIT';

export interface DashboardSourceStatus {
  key: string;
  label: string;
  status: SourceConnectionStatus;
  lastUpdated: string;
  recordCount: number;
  summary: string;
  error: string;
  sourceRef: string;
}

export interface OperationsEvidence {
  id: string;
  sourceType: OperationsSourceType;
  sourceId: string | null;
  sourceUrl: string | null;
  title: string;
  summary: string;
  capturedAt: string;
}

export interface OperationsScoreReason {
  category: OperationsCategory;
  impact: OperationsImpact;
  severity: OperationsPriority;
  explanation: string;
  evidenceIds: string[];
  source: string;
  owner: string | null;
  recommendedAction: string;
  timestamp: string;
  scoreImpact: number;
}

export interface OperationsScore {
  overall: number;
  label: 'STABLE' | 'WATCH' | 'AT_RISK' | 'CRITICAL';
  reasons: OperationsScoreReason[];
}

export interface OperationsNextAction {
  id: string;
  title: string;
  priority: OperationsPriority;
  owner: string | null;
  dueDate: string | null;
  reason: string;
  sourceEvidenceIds: string[];
  status: OperationsStatus;
  actionType: OperationsActionType;
  actionPayload: Record<string, unknown>;
  escalationRule: string;
  lastUpdate: string | null;
  completionEvidence: string | null;
}

export interface OperationsWatchlistItem {
  id: string;
  title: string;
  category: WatchlistCategory;
  currentStatus: string;
  whyItMatters: string;
  triggerCondition: string;
  recommendedAction: string;
  owner: string | null;
  sourceEvidenceIds: string[];
}

export interface SourceFreshness {
  source: string;
  lastUpdatedAt: string | null;
  status: 'FRESH' | 'STALE' | 'MISSING';
  warning: string | null;
}

export interface OperationsChange {
  id: string;
  title: string;
  category: string;
  previousValue: string | null;
  currentValue: string | null;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  sourceEvidenceIds: string[];
  changedAt: string;
}

export interface OwnerLoad {
  owner: string;
  openCriticalActions: number;
  openHighActions: number;
  riskNote: string;
}

export interface StaleDataWarning {
  source: string;
  lastUpdatedAt: string | null;
  warning: string;
}

export interface IntelligenceHealth {
  mode: IntelligenceMode;
  primaryProvider: AIProvider;
  providerUsed: AIProvider;
  hasGeminiApiKey: boolean;
  openAIEnabled: boolean;
  hasApiKey: boolean;
  model: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  storeTarget: string;
}

export interface DashboardIntelligenceInput {
  risks: Array<{ level?: string; job?: string; message?: string }>;
  jobs: any[];
  missingReportJobs: any[];
  marginAtRiskDollars: number;
  lossJobCount: number;
  arTotal: number;
  ar91Plus: number;
  avgMargin: number;
  qboUpdatedAt: string;
  qboStale: boolean;
  fleetMismatchCount: number;
  scheduledJobCount: number;
  fleetAtJobsitesCount: number;
  vehicleCount: number;
  capacityRatio: number | null;
  sourceStatuses?: DashboardSourceStatus[];
  dataFreshnessAt?: string;
}

export interface DashboardIntelligence {
  generatedAt: string;
  lastGeneratedAt: string;
  mode: IntelligenceMode;
  providerUsed: AIProvider;
  modelRoute: DashboardModelRoute;
  modelUsed: string | null;
  openAiEnabled: boolean;
  openAiAvailable: boolean;
  fallbackUsed: boolean;
  fallbackReason: string;
  score: OperationsScore;
  executiveSummary: string;
  headline: string;
  summary: string;
  nextActions: OperationsNextAction[];
  topActions: OperationsNextAction[];
  watchlist: OperationsWatchlistItem[];
  ownerLoad: OwnerLoad[];
  staleDataWarnings: StaleDataWarning[];
  sourceFreshness: SourceFreshness[];
  changedSinceLastBrief: OperationsChange[];
  evidence: OperationsEvidence[];
  sourceStatuses: DashboardSourceStatus[];
  sourcesRead: string[];
  sourcesFailed: string[];
  dataFreshnessAt: string;
  confidence: number;
  followUpNeeded: string[];
  rawSourceSnapshotHash: string;
  health: IntelligenceHealth;
  persistence: { ok: boolean; target: string; error: string };
  error: string;
}

interface AIOperationsBrief {
  generatedAt: string;
  mode: IntelligenceMode;
  score: {
    overall: number;
    label: 'STABLE' | 'WATCH' | 'AT_RISK' | 'CRITICAL';
    reasons: Array<{
      category: OperationsCategory;
      impact: OperationsImpact;
      severity: OperationsPriority;
      explanation: string;
      evidenceIds: string[];
    }>;
  };
  executiveSummary: string;
  nextActions: Array<{
    title: string;
    priority: OperationsPriority;
    owner: string | null;
    dueDate: string | null;
    reason: string;
    actionType: OperationsActionType;
    actionPayload: Record<string, unknown>;
    evidenceIds: string[];
  }>;
  watchlist: Array<{
    title: string;
    category: WatchlistCategory;
    currentStatus: string;
    whyItMatters: string;
    triggerCondition: string;
    recommendedAction: string;
    owner: string | null;
    evidenceIds: string[];
  }>;
  ownerLoad: OwnerLoad[];
  staleDataWarnings: StaleDataWarning[];
}

const SCORECARD_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1yNpkY-gcbeZS2hGPyATTkDdt8iMbmOm4mhy7WGidKfY/edit';
const GANTT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/178t9iioyveWqP6o8x2lQwMagexDP0W9FA4I2jfutJmw/edit';

const nowIso = () => new Date().toISOString();

function logBriefEvent(event: string, details: Record<string, unknown> = {}) {
  console.info(JSON.stringify({
    event: `dashboard_intelligence_${event}`,
    at: nowIso(),
    ...details,
  }));
}

function configuredProvider(): AIProvider {
  const provider = (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase();
  if (provider === 'openai') return 'OPENAI';
  if (provider === 'local') return 'LOCAL';
  return 'GEMINI';
}

function geminiModelForRoute(route: DashboardModelRoute) {
  if (route === 'DEEP_AUDIT') return process.env.GEMINI_ESCALATION_MODEL || 'gemini-2.5-pro';
  if (route === 'EXECUTIVE') return process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.5-flash';
  return process.env.GEMINI_FAST_MODEL || process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.5-flash-lite';
}

function openAiModelForRoute(route: DashboardModelRoute) {
  if (route === 'DEEP_AUDIT') return process.env.DASHBOARD_DEEP_AUDIT_MODEL || 'gpt-5.5';
  if (route === 'EXECUTIVE') return process.env.DASHBOARD_EXECUTIVE_MODEL || 'gpt-5.4';
  return process.env.DEFAULT_MODEL || process.env.DASHBOARD_DEFAULT_MODEL || 'gpt-5.4-mini';
}

function modelForProviderRoute(provider: AIProvider, route: DashboardModelRoute) {
  if (provider === 'GEMINI') return geminiModelForRoute(route);
  if (provider === 'OPENAI') return openAiModelForRoute(route);
  return null;
}

function routeForBrief(input: DashboardIntelligenceInput): DashboardModelRoute {
  if (process.env.DASHBOARD_FORCE_DEEP_AUDIT === 'true') return 'DEEP_AUDIT';

  const connectedSources = (input.sourceStatuses || []).filter(source => source.status === 'connected').length;
  const companyWideSourcesPresent = connectedSources >= 4;
  const hasCrossSourceRisk =
    input.lossJobCount > 0 ||
    input.ar91Plus > 0 ||
    input.fleetMismatchCount > 0 ||
    input.missingReportJobs.length > 0 ||
    input.risks.length > 0 ||
    input.capacityRatio === null ||
    (input.capacityRatio !== null && input.capacityRatio < 1);

  if (companyWideSourcesPresent && hasCrossSourceRisk) return 'EXECUTIVE';
  return 'DEFAULT';
}

function money(value: number) {
  if (!Number.isFinite(value)) return '$0';
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function pct(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${(value * 100).toFixed(1)}%`;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function scoreLabel(score: number): OperationsScore['label'] {
  if (score >= 85) return 'STABLE';
  if (score >= 70) return 'WATCH';
  if (score >= 55) return 'AT_RISK';
  return 'CRITICAL';
}

function normalizeSourceStatuses(sourceStatuses: DashboardSourceStatus[] | undefined): DashboardSourceStatus[] {
  if (sourceStatuses?.length) {
    return sourceStatuses.map(s => ({
      key: s.key || 'unknown',
      label: s.label || s.key || 'Unknown source',
      status: s.status || 'missing',
      lastUpdated: s.lastUpdated || '',
      recordCount: Number.isFinite(s.recordCount) ? s.recordCount : 0,
      summary: s.summary || '',
      error: s.error || '',
      sourceRef: s.sourceRef || '',
    }));
  }

  return [
    ['live_risks', 'Live risks', 'Dashboard risk engine'],
    ['qbo', 'QBO', 'Scorecard Hub - QBO Est vs Actuals'],
    ['ar', 'A/R', 'Scorecard Hub - QBO AR Aging'],
    ['reports', 'Reports', 'Jotform + Google Forms field reports'],
    ['fleet', 'Fleet', 'Samsara Fleet API'],
    ['schedule', 'Schedule', 'Microsoft Project schedule sheet'],
    ['crew_capacity', 'Crew capacity', '25-26 Crew Days Sold'],
  ].map(([key, label, sourceRef]) => ({
    key,
    label,
    status: 'missing' as const,
    lastUpdated: '',
    recordCount: 0,
    summary: 'No source status supplied.',
    error: `Dashboard did not provide ${label} source status.`,
    sourceRef,
  }));
}

function sourceTypeFor(key: string): OperationsSourceType {
  if (key === 'qbo') return 'QBO';
  if (key === 'ar') return 'AR';
  if (key === 'reports') return 'REPORT';
  if (key === 'fleet') return 'FLEET';
  if (key === 'schedule') return 'SCHEDULE';
  if (key === 'crew_capacity') return 'CREW_CAPACITY';
  if (key === 'live_risks') return 'RISK';
  return 'MANUAL';
}

function sourceUrlFor(key: string): string | null {
  if (key === 'qbo' || key === 'ar' || key === 'reports' || key === 'live_risks') return SCORECARD_SHEET_URL;
  if (key === 'fleet') return '/fleet';
  if (key === 'schedule') return '/schedule';
  if (key === 'crew_capacity') return GANTT_SHEET_URL;
  return null;
}

function evidenceId(...parts: Array<string | number | null | undefined>) {
  return parts
    .filter(v => v !== null && v !== undefined && String(v).trim())
    .map(v => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .join('-')
    .slice(0, 120);
}

function buildEvidence(input: DashboardIntelligenceInput, sourceStatuses: DashboardSourceStatus[], capturedAt: string): OperationsEvidence[] {
  const evidence: OperationsEvidence[] = sourceStatuses.map(source => ({
    id: `source-${source.key}`,
    sourceType: sourceTypeFor(source.key),
    sourceId: source.key,
    sourceUrl: sourceUrlFor(source.key),
    title: source.label,
    summary: source.error ? `${source.summary} Error: ${source.error}` : source.summary,
    capturedAt: source.lastUpdated || capturedAt,
  }));

  input.risks.slice(0, 10).forEach((risk, index) => {
    evidence.push({
      id: evidenceId('risk', risk.job || index),
      sourceType: risk.job ? 'JOB' : 'RISK',
      sourceId: risk.job || null,
      sourceUrl: risk.job ? `/jobs/${risk.job}` : '/dashboard#risk-alerts',
      title: risk.job ? `Risk on ${risk.job}` : 'Operations risk',
      summary: risk.message || 'Risk engine returned an item without a message.',
      capturedAt,
    });
  });

  input.missingReportJobs.slice(0, 10).forEach((job: any) => {
    const jobNumber = job?.Job_Number || '';
    evidence.push({
      id: evidenceId('missing-report', jobNumber || job?.Job_Name || 'unknown'),
      sourceType: 'REPORT',
      sourceId: jobNumber || null,
      sourceUrl: jobNumber ? `/jobs/${jobNumber}` : '/dashboard#risk-alerts',
      title: jobNumber ? `Missing report - ${jobNumber}` : 'Missing report',
      summary: `${jobNumber ? `${jobNumber} - ` : ''}${job?.Job_Name || 'Scheduled job'} has no matching field report.`,
      capturedAt,
    });
  });

  evidence.push({
    id: 'metric-ar-91-plus',
    sourceType: 'AR',
    sourceId: 'qbo-ar-aging-91-plus',
    sourceUrl: SCORECARD_SHEET_URL,
    title: 'A/R 91+ exposure',
    summary: `${money(input.ar91Plus)} is over 90 days out of ${money(input.arTotal)} total A/R.`,
    capturedAt,
  });

  evidence.push({
    id: 'metric-qbo-margin',
    sourceType: 'QBO',
    sourceId: 'qbo-est-vs-actuals-margin',
    sourceUrl: SCORECARD_SHEET_URL,
    title: 'QBO margin exposure',
    summary: `${input.lossJobCount} losing job(s), ${money(input.marginAtRiskDollars)} margin at risk, ${pct(input.avgMargin)} average margin.`,
    capturedAt,
  });

  evidence.push({
    id: 'metric-crew-capacity',
    sourceType: 'CREW_CAPACITY',
    sourceId: 'crew-capacity-ratio',
    sourceUrl: GANTT_SHEET_URL,
    title: 'Crew capacity ratio',
    summary: input.capacityRatio === null ? 'No paving capacity ratio could be calculated.' : `Crew capacity ratio is ${input.capacityRatio.toFixed(2)}.`,
    capturedAt,
  });

  evidence.push({
    id: 'metric-fleet-status',
    sourceType: 'FLEET',
    sourceId: 'samsara-vehicles',
    sourceUrl: '/fleet',
    title: 'Fleet schedule status',
    summary: `${input.fleetMismatchCount} fleet mismatch(es), ${input.fleetAtJobsitesCount} vehicle(s) near jobsites, ${input.vehicleCount} tracked vehicle(s).`,
    capturedAt,
  });

  return Array.from(new Map(evidence.map(item => [item.id, item])).values());
}

function parseDate(value: string | null | undefined) {
  if (!value) return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isOlderThanHours(value: string | null | undefined, hours: number) {
  const parsed = parseDate(value);
  if (!Number.isFinite(parsed)) return true;
  return Date.now() - parsed > hours * 60 * 60 * 1000;
}

function freshnessThresholdHours(key: string) {
  if (key === 'fleet' || key === 'live_risks') return 1;
  if (key === 'schedule' || key === 'crew_capacity') return 24;
  if (key === 'qbo' || key === 'ar' || key === 'reports') return 36;
  return 24;
}

function buildSourceFreshness(sourceStatuses: DashboardSourceStatus[]): SourceFreshness[] {
  return sourceStatuses.map(source => {
    if (source.status === 'missing') {
      return {
        source: source.label,
        lastUpdatedAt: source.lastUpdated || null,
        status: 'MISSING' as const,
        warning: source.error || `${source.label} did not return data.`,
      };
    }
    if (source.status === 'failed' || isOlderThanHours(source.lastUpdated, freshnessThresholdHours(source.key))) {
      return {
        source: source.label,
        lastUpdatedAt: source.lastUpdated || null,
        status: 'STALE' as const,
        warning: source.error || `${source.label} is older than ${freshnessThresholdHours(source.key)} hours.`,
      };
    }
    return {
      source: source.label,
      lastUpdatedAt: source.lastUpdated || null,
      status: 'FRESH' as const,
      warning: null,
    };
  });
}

function ownerFromRisk(risk: { message?: string }) {
  const match = (risk.message || '').match(/PM:\s*([A-Za-z ]+)/);
  return match?.[1]?.trim() || null;
}

function firstEvidenceId(evidence: OperationsEvidence[], id: string) {
  return evidence.some(item => item.id === id) ? id : evidence[0]?.id || 'source-live-risks';
}

function buildScoreReasons(input: DashboardIntelligenceInput, evidence: OperationsEvidence[], sourceFreshness: SourceFreshness[], capturedAt: string): OperationsScoreReason[] {
  const criticalRisks = input.risks.filter(r => r.level === 'critical').length;
  const warningRisks = input.risks.filter(r => r.level === 'warning').length;
  const arPct = input.arTotal > 0 ? input.ar91Plus / input.arTotal : 0;
  const sourceFreshnessByName = new Map(sourceFreshness.map(item => [item.source.toLowerCase(), item]));
  const sourceProblemPenalty = sourceFreshness.filter(s => s.status !== 'FRESH').length * 2;

  const reason = (
    category: OperationsCategory,
    scoreImpact: number,
    severity: OperationsPriority,
    explanation: string,
    evidenceIds: string[],
    source: string,
    owner: string | null,
    recommendedAction: string
  ): OperationsScoreReason => ({
    category,
    impact: scoreImpact < 0 ? 'NEGATIVE' : scoreImpact > 0 ? 'POSITIVE' : 'NEUTRAL',
    severity,
    explanation,
    evidenceIds: evidenceIds.map(id => firstEvidenceId(evidence, id)),
    source,
    owner,
    recommendedAction,
    timestamp: capturedAt,
    scoreImpact,
  });

  const qboPenalty = Math.min(25, input.lossJobCount * 7 + (input.avgMargin < 0.1 ? 8 : input.avgMargin < 0.2 ? 4 : 0) + (input.qboStale ? 6 : 0));
  const arPenalty = Math.min(18, arPct * 60);
  const reportPenalty = Math.min(15, input.missingReportJobs.length * 4);
  const fleetPenalty = Math.min(15, input.fleetMismatchCount * 6 + (sourceFreshnessByName.get('fleet')?.status !== 'FRESH' ? 4 : 0));
  const riskPenalty = Math.min(30, criticalRisks * 12 + warningRisks * 5);
  const schedulePenalty = sourceFreshnessByName.get('schedule')?.status !== 'FRESH' ? 8 : input.scheduledJobCount === 0 ? 4 : 0;
  const crewPenalty = input.capacityRatio === null ? 6 : input.capacityRatio < 0.75 ? 12 : input.capacityRatio < 1 ? 7 : 0;

  return [
    reason(
      'LIVE_RISKS',
      -(riskPenalty + sourceProblemPenalty),
      criticalRisks > 0 ? 'CRITICAL' : warningRisks > 0 ? 'HIGH' : 'LOW',
      `${criticalRisks} critical and ${warningRisks} warning live risk(s) are active.`,
      ['source-live_risks', ...input.risks.slice(0, 3).map((r, i) => evidenceId('risk', r.job || i))],
      'Dashboard risk engine',
      'Operations',
      criticalRisks > 0 || warningRisks > 0 ? 'Review the risk queue and clear blockers today.' : 'Keep monitoring live risks.'
    ),
    reason(
      'QBO',
      -qboPenalty,
      qboPenalty >= 18 ? 'CRITICAL' : qboPenalty >= 10 ? 'HIGH' : qboPenalty > 0 ? 'MEDIUM' : 'LOW',
      `${input.lossJobCount} losing job(s), ${money(input.marginAtRiskDollars)} margin at risk, ${pct(input.avgMargin)} average job margin.`,
      ['source-qbo', 'metric-qbo-margin'],
      'Scorecard Hub - QBO Est vs Actuals',
      'Finance',
      qboPenalty > 0 ? 'Review losing jobs and update the cost/billing plan.' : 'Keep QBO margin checks running.'
    ),
    reason(
      'AR',
      -arPenalty,
      arPct >= 0.2 ? 'CRITICAL' : arPct >= 0.1 ? 'HIGH' : arPct > 0 ? 'MEDIUM' : 'LOW',
      `${money(input.ar91Plus)} is over 90 days, equal to ${pct(arPct)} of total A/R.`,
      ['source-ar', 'metric-ar-91-plus'],
      'Scorecard Hub - QBO AR Aging',
      'Finance',
      input.ar91Plus > 0 ? 'Send A/R follow-up and escalate overdue items.' : 'Keep A/R review current.'
    ),
    reason(
      'REPORTS',
      -reportPenalty,
      reportPenalty >= 12 ? 'HIGH' : reportPenalty > 0 ? 'MEDIUM' : 'LOW',
      `${input.missingReportJobs.length} scheduled job(s) are missing a field report.`,
      ['source-reports', ...input.missingReportJobs.slice(0, 3).map((j: any) => evidenceId('missing-report', j?.Job_Number || j?.Job_Name || 'unknown'))],
      'Jotform + Google Forms field reports',
      'Field Ops',
      reportPenalty > 0 ? 'Collect missing reports before billing and production review.' : 'Keep daily report follow-up running.'
    ),
    reason(
      'FLEET',
      -fleetPenalty,
      fleetPenalty >= 12 ? 'HIGH' : fleetPenalty > 0 ? 'MEDIUM' : 'LOW',
      `${input.fleetMismatchCount} schedule deviation(s), ${input.fleetAtJobsitesCount} vehicle(s) near jobsites, ${input.vehicleCount} tracked vehicle(s).`,
      ['source-fleet', 'metric-fleet-status'],
      'Samsara Fleet API',
      'Dispatch',
      fleetPenalty > 0 ? 'Review fleet exceptions and confirm dispatch plan.' : 'Keep fleet tracking aligned with schedule.'
    ),
    reason(
      'SCHEDULE',
      -schedulePenalty,
      schedulePenalty >= 8 ? 'HIGH' : schedulePenalty > 0 ? 'MEDIUM' : 'LOW',
      `${input.scheduledJobCount} job(s) are scheduled now.`,
      ['source-schedule'],
      'Microsoft Project schedule export sheet',
      'Operations',
      schedulePenalty > 0 ? 'Refresh the schedule feed or confirm no work is planned.' : 'Keep schedule current.'
    ),
    reason(
      'CREW_CAPACITY',
      -crewPenalty,
      crewPenalty >= 12 ? 'HIGH' : crewPenalty > 0 ? 'MEDIUM' : 'LOW',
      input.capacityRatio === null ? 'Crew capacity ratio could not be calculated.' : `Crew capacity ratio is ${input.capacityRatio.toFixed(2)}.`,
      ['source-crew_capacity', 'metric-crew-capacity'],
      'Gantt workbook - 25-26 Crew Days Sold',
      'Operations',
      crewPenalty > 0 ? 'Confirm crew availability and resequence work before it becomes a schedule miss.' : 'Keep crew capacity monitoring active.'
    ),
  ];
}

function buildSnapshot(input: DashboardIntelligenceInput, sourceFreshness: SourceFreshness[]) {
  const criticalRisks = input.risks.filter(r => r.level === 'critical').length;
  const warningRisks = input.risks.filter(r => r.level === 'warning').length;
  return {
    criticalRisks,
    warningRisks,
    marginAtRiskDollars: Math.round(input.marginAtRiskDollars),
    lossJobCount: input.lossJobCount,
    arTotal: Math.round(input.arTotal),
    ar91Plus: Math.round(input.ar91Plus),
    avgMargin: Number(input.avgMargin.toFixed(4)),
    fleetMismatchCount: input.fleetMismatchCount,
    missingReportCount: input.missingReportJobs.length,
    scheduledJobCount: input.scheduledJobCount,
    capacityRatio: input.capacityRatio === null ? null : Number(input.capacityRatio.toFixed(4)),
    staleSourceCount: sourceFreshness.filter(s => s.status !== 'FRESH').length,
  };
}

function buildChanges(snapshot: Record<string, unknown>, previous: StoredDashboardBrief | null, evidence: OperationsEvidence[], capturedAt: string): OperationsChange[] {
  if (!previous?.snapshot) {
    return [{
      id: 'first-persisted-brief',
      title: 'First saved operations brief',
      category: 'SYSTEM',
      previousValue: null,
      currentValue: 'Baseline saved',
      impact: 'NEUTRAL',
      sourceEvidenceIds: [evidence[0]?.id || 'source-live_risks'],
      changedAt: capturedAt,
    }];
  }

  const comparisons: Array<{ key: string; title: string; category: string; evidenceId: string; goodWhenDown?: boolean }> = [
    { key: 'criticalRisks', title: 'Critical risk count changed', category: 'LIVE_RISKS', evidenceId: 'source-live_risks', goodWhenDown: true },
    { key: 'warningRisks', title: 'Warning risk count changed', category: 'LIVE_RISKS', evidenceId: 'source-live_risks', goodWhenDown: true },
    { key: 'ar91Plus', title: 'A/R 91+ exposure changed', category: 'AR', evidenceId: 'metric-ar-91-plus', goodWhenDown: true },
    { key: 'marginAtRiskDollars', title: 'Margin at risk changed', category: 'QBO', evidenceId: 'metric-qbo-margin', goodWhenDown: true },
    { key: 'fleetMismatchCount', title: 'Fleet mismatch count changed', category: 'FLEET', evidenceId: 'metric-fleet-status', goodWhenDown: true },
    { key: 'missingReportCount', title: 'Missing report count changed', category: 'REPORTS', evidenceId: 'source-reports', goodWhenDown: true },
    { key: 'capacityRatio', title: 'Crew capacity ratio changed', category: 'CREW_CAPACITY', evidenceId: 'metric-crew-capacity', goodWhenDown: false },
    { key: 'staleSourceCount', title: 'Stale source count changed', category: 'SOURCE_FRESHNESS', evidenceId: 'source-live_risks', goodWhenDown: true },
  ];

  const changes = comparisons.flatMap(item => {
    const previousValue = previous.snapshot[item.key];
    const currentValue = snapshot[item.key];
    if (JSON.stringify(previousValue) === JSON.stringify(currentValue)) return [];

    const prevNum = typeof previousValue === 'number' ? previousValue : Number(previousValue);
    const currNum = typeof currentValue === 'number' ? currentValue : Number(currentValue);
    let impact: OperationsChange['impact'] = 'NEUTRAL';
    if (Number.isFinite(prevNum) && Number.isFinite(currNum)) {
      if (currNum === prevNum) impact = 'NEUTRAL';
      else if (item.goodWhenDown) impact = currNum < prevNum ? 'POSITIVE' : 'NEGATIVE';
      else impact = currNum > prevNum ? 'POSITIVE' : 'NEGATIVE';
    }

    return [{
      id: evidenceId('change', item.key, capturedAt),
      title: item.title,
      category: item.category,
      previousValue: previousValue === null || previousValue === undefined ? null : String(previousValue),
      currentValue: currentValue === null || currentValue === undefined ? null : String(currentValue),
      impact,
      sourceEvidenceIds: [firstEvidenceId(evidence, item.evidenceId)],
      changedAt: capturedAt,
    }];
  });

  return changes.length ? changes : [{
    id: evidenceId('change', 'no-material-change', capturedAt),
    title: 'No major operating change since last saved brief',
    category: 'SYSTEM',
    previousValue: null,
    currentValue: 'No material change',
    impact: 'NEUTRAL',
    sourceEvidenceIds: [evidence[0]?.id || 'source-live_risks'],
    changedAt: capturedAt,
  }];
}

function defaultActionPayload(actionType: OperationsActionType, href: string, jobNumber = ''): Record<string, unknown> {
  return {
    href,
    jobNumber,
    sourceId: '',
    owner: '',
    emailTo: '',
    emailSubject: '',
    emailBody: '',
    snoozeUntil: '',
    reminderAt: '',
    note: '',
    actionType,
  };
}

function actionDueDate(priority: OperationsPriority) {
  if (priority === 'CRITICAL' || priority === 'HIGH') return new Date().toISOString().slice(0, 10);
  return null;
}

function makeAction(
  id: string,
  title: string,
  priority: OperationsPriority,
  owner: string | null,
  reason: string,
  sourceEvidenceIds: string[],
  actionType: OperationsActionType,
  actionPayload: Record<string, unknown>
): OperationsNextAction {
  return {
    id,
    title,
    priority,
    owner,
    dueDate: actionDueDate(priority),
    reason,
    sourceEvidenceIds,
    status: 'OPEN',
    actionType,
    actionPayload,
    escalationRule: priority === 'CRITICAL' ? 'Escalate if not updated today.' : priority === 'HIGH' ? 'Escalate if not updated by tomorrow morning.' : 'Review during next operations check.',
    lastUpdate: null,
    completionEvidence: null,
  };
}

function buildNextActions(input: DashboardIntelligenceInput, evidence: OperationsEvidence[], scoreReasons: OperationsScoreReason[]): OperationsNextAction[] {
  const actions: OperationsNextAction[] = [];
  const criticalRisks = input.risks.filter(r => r.level === 'critical');
  const arPct = input.arTotal > 0 ? input.ar91Plus / input.arTotal : 0;

  criticalRisks.slice(0, 2).forEach((risk, index) => {
    const job = risk.job || '';
    const owner = ownerFromRisk(risk);
    actions.push(makeAction(
      evidenceId('action', 'risk', job || index),
      job ? `Clear blocker on ${job}` : 'Clear critical operations risk',
      'CRITICAL',
      owner,
      risk.message || 'Critical risk needs review.',
      [firstEvidenceId(evidence, evidenceId('risk', job || index))],
      job ? 'OPEN_JOB' : 'OPEN_SOURCE',
      defaultActionPayload(job ? 'OPEN_JOB' : 'OPEN_SOURCE', job ? `/jobs/${job}` : '/dashboard#risk-alerts', job)
    ));
  });

  if (input.ar91Plus > 0) {
    actions.push(makeAction(
      'action-ar-follow-up',
      'Send A/R follow-up',
      arPct >= 0.2 ? 'CRITICAL' : 'HIGH',
      'Finance',
      `${money(input.ar91Plus)} is over 90 days. Waiting increases collection risk.`,
      ['source-ar', 'metric-ar-91-plus'],
      'SEND_EMAIL_DRAFT',
      {
        ...defaultActionPayload('SEND_EMAIL_DRAFT', SCORECARD_SHEET_URL),
        emailSubject: `A/R follow-up needed - ${money(input.ar91Plus)} over 90 days`,
        emailBody: `${money(input.ar91Plus)} is over 90 days out of ${money(input.arTotal)} total A/R. Please confirm follow-up status and next collection step.`,
      }
    ));
  }

  if (input.lossJobCount > 0) {
    actions.push(makeAction(
      'action-qbo-margin-review',
      'Review losing jobs',
      input.marginAtRiskDollars > 250_000 ? 'CRITICAL' : 'HIGH',
      'Finance',
      `${input.lossJobCount} job(s) are losing money, with ${money(input.marginAtRiskDollars)} at risk.`,
      ['source-qbo', 'metric-qbo-margin'],
      'CREATE_TASK',
      defaultActionPayload('CREATE_TASK', SCORECARD_SHEET_URL)
    ));
  }

  if (input.missingReportJobs.length > 0) {
    const job = input.missingReportJobs[0] || {};
    const jobNumber = job.Job_Number || '';
    actions.push(makeAction(
      'action-missing-field-reports',
      `Collect ${input.missingReportJobs.length} missing field report${input.missingReportJobs.length === 1 ? '' : 's'}`,
      'HIGH',
      job.Project_Manager || null,
      'Missing reports block billing checks, production review, and schedule proof.',
      ['source-reports', firstEvidenceId(evidence, evidenceId('missing-report', jobNumber || job.Job_Name || 'unknown'))],
      jobNumber ? 'OPEN_JOB' : 'CREATE_TASK',
      defaultActionPayload(jobNumber ? 'OPEN_JOB' : 'CREATE_TASK', jobNumber ? `/jobs/${jobNumber}` : '/dashboard#risk-alerts', jobNumber)
    ));
  }

  if (input.fleetMismatchCount > 0) {
    actions.push(makeAction(
      'action-fleet-exceptions',
      'Resolve fleet schedule exception',
      'HIGH',
      'Dispatch',
      `${input.fleetMismatchCount} GPS schedule deviation(s) found.`,
      ['source-fleet', 'metric-fleet-status'],
      'OPEN_SOURCE',
      defaultActionPayload('OPEN_SOURCE', '/fleet')
    ));
  }

  if (input.capacityRatio === null || input.capacityRatio < 1) {
    actions.push(makeAction(
      'action-crew-capacity',
      'Confirm crew capacity',
      input.capacityRatio !== null && input.capacityRatio < 0.75 ? 'HIGH' : 'MEDIUM',
      'Operations',
      input.capacityRatio === null ? 'Crew capacity could not be calculated.' : `Crew capacity ratio is ${input.capacityRatio.toFixed(2)}.`,
      ['source-crew_capacity', 'metric-crew-capacity'],
      'CREATE_REMINDER',
      defaultActionPayload('CREATE_REMINDER', GANTT_SHEET_URL)
    ));
  }

  scoreReasons
    .filter(reason => reason.impact === 'NEGATIVE' && reason.category === 'SCHEDULE' && reason.severity !== 'LOW')
    .forEach(reason => {
      actions.push(makeAction(
        'action-refresh-schedule',
        'Refresh schedule source',
        reason.severity,
        reason.owner,
        reason.explanation,
        reason.evidenceIds,
        'OPEN_SOURCE',
        defaultActionPayload('OPEN_SOURCE', '/schedule')
      ));
    });

  return Array.from(new Map(actions.map(action => [action.id, action])).values()).slice(0, 6);
}

function buildWatchlist(input: DashboardIntelligenceInput, evidence: OperationsEvidence[]): OperationsWatchlistItem[] {
  const arPct = input.arTotal > 0 ? input.ar91Plus / input.arTotal : 0;
  return [
    {
      id: 'watch-ar',
      title: 'A/R aging pressure',
      category: 'AR',
      currentStatus: `${money(input.ar91Plus)} over 90 days (${pct(arPct)} of total A/R).`,
      whyItMatters: 'Old receivables reduce cash options and create collection risk.',
      triggerCondition: 'Urgent if 91+ A/R reaches 20% of total A/R or increases from the last brief.',
      recommendedAction: 'Confirm follow-up owner and next collection step today.',
      owner: 'Finance',
      sourceEvidenceIds: ['source-ar', 'metric-ar-91-plus'].map(id => firstEvidenceId(evidence, id)),
    },
    {
      id: 'watch-crew-capacity',
      title: 'Crew capacity balance',
      category: 'CREW',
      currentStatus: input.capacityRatio === null ? 'Capacity ratio unavailable.' : `Capacity ratio ${input.capacityRatio.toFixed(2)}.`,
      whyItMatters: 'Base/site work must stay ahead of paving demand.',
      triggerCondition: 'Urgent if ratio drops below 1.00 or source becomes stale.',
      recommendedAction: 'Confirm crew availability before the next schedule move.',
      owner: 'Operations',
      sourceEvidenceIds: ['source-crew_capacity', 'metric-crew-capacity'].map(id => firstEvidenceId(evidence, id)),
    },
    {
      id: 'watch-fleet',
      title: 'Fleet schedule alignment',
      category: 'FLEET',
      currentStatus: `${input.fleetMismatchCount} mismatch(es), ${input.vehicleCount} tracked vehicle(s).`,
      whyItMatters: 'A truck in the wrong place creates schedule and lowboy risk.',
      triggerCondition: 'Urgent if any mismatch stays open after today.',
      recommendedAction: 'Dispatch should clear or explain each mismatch.',
      owner: 'Dispatch',
      sourceEvidenceIds: ['source-fleet', 'metric-fleet-status'].map(id => firstEvidenceId(evidence, id)),
    },
    {
      id: 'watch-reporting',
      title: 'Field report completion',
      category: 'REPORTING',
      currentStatus: `${input.missingReportJobs.length} missing report(s).`,
      whyItMatters: 'Missing reports weaken billing proof and hide production issues.',
      triggerCondition: 'Urgent if any scheduled job is missing a report by next morning.',
      recommendedAction: 'Collect the missing report or mark the schedule as not worked.',
      owner: 'Field Ops',
      sourceEvidenceIds: ['source-reports'].map(id => firstEvidenceId(evidence, id)),
    },
  ];
}

function buildOwnerLoad(actions: OperationsNextAction[]): OwnerLoad[] {
  const byOwner = new Map<string, OperationsNextAction[]>();
  actions.forEach(action => {
    const owner = action.owner || 'Owner missing';
    byOwner.set(owner, [...(byOwner.get(owner) || []), action]);
  });

  return Array.from(byOwner.entries()).map(([owner, items]) => {
    const critical = items.filter(i => i.priority === 'CRITICAL' && i.status !== 'DONE').length;
    const high = items.filter(i => i.priority === 'HIGH' && i.status !== 'DONE').length;
    return {
      owner,
      openCriticalActions: critical,
      openHighActions: high,
      riskNote: owner === 'Owner missing'
        ? 'Owner missing - assign now.'
        : critical > 0
          ? 'Critical action needs same-day update.'
          : high > 1
            ? 'Multiple high-priority actions open.'
            : 'Load is manageable.',
    };
  });
}

function confidenceFromSources(sourceFreshness: SourceFreshness[]) {
  const staleOrMissing = sourceFreshness.filter(s => s.status !== 'FRESH').length;
  return Math.max(0.35, Math.min(0.95, 0.95 - staleOrMissing * 0.08));
}

function buildExecutiveSummary(score: OperationsScore, actions: OperationsNextAction[], staleDataWarnings: StaleDataWarning[]) {
  const negative = score.reasons
    .filter(reason => reason.impact === 'NEGATIVE')
    .sort((a, b) => a.scoreImpact - b.scoreImpact)
    .slice(0, 5)
    .map(reason => reason.category.replace('_', ' ').toLowerCase());
  const parts = negative.length ? negative.join(', ') : 'no major negative score drivers';
  return `Score ${score.overall}/100 because of ${parts}. ${actions.length} action(s) are open. ${staleDataWarnings.length} source warning(s) need review.`;
}

function buildLocalBrief(
  input: DashboardIntelligenceInput,
  previous: StoredDashboardBrief | null,
  modeReason: string,
  openAiEnabled: boolean,
  openAiAvailable: boolean,
  health: IntelligenceHealth,
  providerUsed: AIProvider,
  modelRoute: DashboardModelRoute,
  modelUsed: string | null
): DashboardIntelligence {
  const capturedAt = nowIso();
  const sourceStatuses = normalizeSourceStatuses(input.sourceStatuses);
  const sourcesRead = sourceStatuses.filter(s => s.status === 'connected').map(s => s.label);
  const sourcesFailed = sourceStatuses.filter(s => s.status !== 'connected').map(s => s.label);
  const evidence = buildEvidence(input, sourceStatuses, capturedAt);
  const sourceFreshness = buildSourceFreshness(sourceStatuses);
  const staleDataWarnings = sourceFreshness
    .filter(source => source.status !== 'FRESH')
    .map(source => ({
      source: source.source,
      lastUpdatedAt: source.lastUpdatedAt,
      warning: source.warning || `${source.source} is not fresh.`,
    }));
  const scoreReasons = buildScoreReasons(input, evidence, sourceFreshness, capturedAt);
  const overall = clampScore(100 + scoreReasons.reduce((sum, reason) => sum + Math.min(0, reason.scoreImpact), 0));
  const score: OperationsScore = { overall, label: scoreLabel(overall), reasons: scoreReasons };
  const nextActions = buildNextActions(input, evidence, scoreReasons);
  const watchlist = buildWatchlist(input, evidence);
  const ownerLoad = buildOwnerLoad(nextActions);
  const snapshot = buildSnapshot(input, sourceFreshness);
  const rawSourceSnapshotHash = hashSnapshot(snapshot);
  const changedSinceLastBrief = buildChanges(snapshot, previous, evidence, capturedAt);
  const confidence = confidenceFromSources(sourceFreshness);
  const executiveSummary = buildExecutiveSummary(score, nextActions, staleDataWarnings);

  return {
    generatedAt: capturedAt,
    lastGeneratedAt: capturedAt,
    mode: openAiAvailable ? providerUsed : 'LOCAL',
    providerUsed: openAiAvailable ? providerUsed : 'LOCAL',
    modelRoute,
    modelUsed,
    openAiEnabled,
    openAiAvailable,
    fallbackUsed: !openAiAvailable,
    fallbackReason: modeReason,
    score,
    executiveSummary,
    headline: score.label === 'STABLE' ? 'Operations are stable.' : score.label === 'WATCH' ? 'Operations need review today.' : score.label === 'AT_RISK' ? 'Operations are at risk.' : 'Operations need action now.',
    summary: executiveSummary,
    nextActions,
    topActions: nextActions.slice(0, 5),
    watchlist,
    ownerLoad,
    staleDataWarnings,
    sourceFreshness,
    changedSinceLastBrief,
    evidence,
    sourceStatuses,
    sourcesRead,
    sourcesFailed,
    dataFreshnessAt: input.dataFreshnessAt || capturedAt,
    confidence,
    followUpNeeded: [
      ...staleDataWarnings.map(w => `Fix stale source: ${w.source}`),
      ...nextActions.filter(a => !a.owner).map(a => `Assign owner: ${a.title}`),
    ],
    rawSourceSnapshotHash,
    health,
    persistence: { ok: false, target: 'not_saved_yet', error: '' },
    error: '',
  };
}

const actionPayloadSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['href', 'jobNumber', 'sourceId', 'owner', 'emailTo', 'emailSubject', 'emailBody', 'snoozeUntil', 'reminderAt', 'note', 'actionType'],
  properties: {
    href: { type: 'string' },
    jobNumber: { type: 'string' },
    sourceId: { type: 'string' },
    owner: { type: 'string' },
    emailTo: { type: 'string' },
    emailSubject: { type: 'string' },
    emailBody: { type: 'string' },
    snoozeUntil: { type: 'string' },
    reminderAt: { type: 'string' },
    note: { type: 'string' },
    actionType: { type: 'string' },
  },
};

const aiOperationsBriefSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['generatedAt', 'mode', 'score', 'executiveSummary', 'nextActions', 'watchlist', 'ownerLoad', 'staleDataWarnings'],
  properties: {
    generatedAt: { type: 'string' },
    mode: { type: 'string', enum: ['LOCAL', 'GEMINI', 'OPENAI'] },
    score: {
      type: 'object',
      additionalProperties: false,
      required: ['overall', 'label', 'reasons'],
      properties: {
        overall: { type: 'number' },
        label: { type: 'string', enum: ['STABLE', 'WATCH', 'AT_RISK', 'CRITICAL'] },
        reasons: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['category', 'impact', 'severity', 'explanation', 'evidenceIds'],
            properties: {
              category: { type: 'string', enum: ['QBO', 'AR', 'REPORTS', 'FLEET', 'SCHEDULE', 'CREW_CAPACITY', 'LIVE_RISKS'] },
              impact: { type: 'string', enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] },
              severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
              explanation: { type: 'string' },
              evidenceIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    executiveSummary: { type: 'string' },
    nextActions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'priority', 'owner', 'dueDate', 'reason', 'actionType', 'actionPayload', 'evidenceIds'],
        properties: {
          title: { type: 'string' },
          priority: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          owner: { type: ['string', 'null'] },
          dueDate: { type: ['string', 'null'] },
          reason: { type: 'string' },
          actionType: { type: 'string', enum: ['OPEN_SOURCE', 'OPEN_JOB', 'CREATE_TASK', 'ASSIGN_OWNER', 'SEND_EMAIL_DRAFT', 'CREATE_REMINDER', 'ESCALATE', 'SNOOZE', 'MARK_RESOLVED'] },
          actionPayload: actionPayloadSchema,
          evidenceIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    watchlist: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'category', 'currentStatus', 'whyItMatters', 'triggerCondition', 'recommendedAction', 'owner', 'evidenceIds'],
        properties: {
          title: { type: 'string' },
          category: { type: 'string', enum: ['CASH', 'AR', 'QBO', 'FLEET', 'SCHEDULE', 'CREW', 'JOB_RISK', 'REPORTING', 'OTHER'] },
          currentStatus: { type: 'string' },
          whyItMatters: { type: 'string' },
          triggerCondition: { type: 'string' },
          recommendedAction: { type: 'string' },
          owner: { type: ['string', 'null'] },
          evidenceIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    ownerLoad: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['owner', 'openCriticalActions', 'openHighActions', 'riskNote'],
        properties: {
          owner: { type: 'string' },
          openCriticalActions: { type: 'number' },
          openHighActions: { type: 'number' },
          riskNote: { type: 'string' },
        },
      },
    },
    staleDataWarnings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['source', 'lastUpdatedAt', 'warning'],
        properties: {
          source: { type: 'string' },
          lastUpdatedAt: { type: ['string', 'null'] },
          warning: { type: 'string' },
        },
      },
    },
  },
};

const AI_OUTPUT_TOKEN_LIMIT = 8192;
const aiOutputRules = [
  'Return strict JSON only.',
  'Every claim must use evidenceIds from the provided evidence list.',
  'Do not invent owners, jobs, customers, vendors, crews, dates, links, or evidence IDs.',
  'If evidence is missing, make the action ASSIGN_OWNER or OPEN_SOURCE instead of inventing facts.',
  'Keep the output practical and action-ready.',
  'Keep score.reasons to one item per source category.',
  'Return no more than 5 nextActions, 5 watchlist items, 6 ownerLoad rows, and 6 staleDataWarnings.',
];

function extractResponseText(json: any): string {
  if (typeof json?.output_text === 'string') return json.output_text;
  const parts: string[] = [];
  for (const item of json?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('').trim();
}

function parseStructuredAiJson(text: string, provider: string): AIOperationsBrief {
  try {
    return JSON.parse(text) as AIOperationsBrief;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${provider} returned invalid JSON: ${message}`);
  }
}

function extractGeminiResponseText(json: any): string {
  const parts: string[] = [];
  for (const candidate of json?.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      if (typeof part?.text === 'string') parts.push(part.text);
    }
  }
  return parts.join('').trim();
}

function toGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const next: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties') continue;
    if (key === 'type') {
      if (Array.isArray(value)) {
        const nonNull = value.find(v => v !== 'null') || 'string';
        next.type = String(nonNull).toUpperCase();
        if (value.includes('null')) next.nullable = true;
      } else {
        next.type = String(value).toUpperCase();
      }
      continue;
    }
    if (key === 'properties' && value && typeof value === 'object') {
      next.properties = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, toGeminiSchema(child)]));
      continue;
    }
    if (key === 'items') {
      next.items = toGeminiSchema(value);
      continue;
    }
    if (Array.isArray(value)) {
      next[key] = value.map(item => toGeminiSchema(item));
      continue;
    }
    next[key] = value && typeof value === 'object' ? toGeminiSchema(value) : value;
  }
  return next;
}

function assertSupportedEvidence(ai: AIOperationsBrief, validEvidenceIds: Set<string>) {
  const allEvidenceGroups = [
    ...ai.score.reasons.map(reason => reason.evidenceIds),
    ...ai.nextActions.map(action => action.evidenceIds),
    ...ai.watchlist.map(item => item.evidenceIds),
  ];
  const unsupported = allEvidenceGroups.some(ids => ids.length === 0 || ids.some(id => !validEvidenceIds.has(id)));
  if (unsupported) throw new Error('AI output included unsupported evidence IDs.');
}

function normalizeAiBrief(ai: AIOperationsBrief, local: DashboardIntelligence, providerUsed: Exclude<AIProvider, 'LOCAL'>): DashboardIntelligence {
  const validEvidenceIds = new Set(local.evidence.map(item => item.id));
  assertSupportedEvidence(ai, validEvidenceIds);

  const generatedAt = nowIso();
  const localReasonsByCategory = new Map(local.score.reasons.map(reason => [reason.category, reason]));
  const scoreReasons: OperationsScoreReason[] = ai.score.reasons.map(reason => {
    const localReason = localReasonsByCategory.get(reason.category);
    return {
      ...localReason,
      category: reason.category,
      impact: reason.impact,
      severity: reason.severity,
      explanation: reason.explanation,
      evidenceIds: reason.evidenceIds,
      source: localReason?.source || reason.category,
      owner: localReason?.owner || null,
      recommendedAction: localReason?.recommendedAction || 'Review source evidence.',
      timestamp: generatedAt,
      scoreImpact: localReason?.scoreImpact || 0,
    };
  });

  const nextActions: OperationsNextAction[] = ai.nextActions.slice(0, 6).map((action, index) => ({
    id: evidenceId('openai-action', index, action.title),
    title: action.title,
    priority: action.priority,
    owner: action.owner,
    dueDate: action.dueDate,
    reason: action.reason,
    sourceEvidenceIds: action.evidenceIds,
    status: 'OPEN',
    actionType: action.actionType,
    actionPayload: action.actionPayload,
    escalationRule: action.priority === 'CRITICAL' ? 'Escalate if not updated today.' : action.priority === 'HIGH' ? 'Escalate if not updated by tomorrow morning.' : 'Review during next operations check.',
    lastUpdate: null,
    completionEvidence: null,
  }));

  const scoreOverall = clampScore(ai.score.overall);
  const score = {
    overall: scoreOverall,
    label: ai.score.label || scoreLabel(scoreOverall),
    reasons: scoreReasons.length ? scoreReasons : local.score.reasons,
  };

  const watchlist: OperationsWatchlistItem[] = ai.watchlist.map((item, index) => ({
    id: evidenceId('openai-watch', index, item.title),
    title: item.title,
    category: item.category,
    currentStatus: item.currentStatus,
    whyItMatters: item.whyItMatters,
    triggerCondition: item.triggerCondition,
    recommendedAction: item.recommendedAction,
    owner: item.owner,
    sourceEvidenceIds: item.evidenceIds,
  }));

  return {
    ...local,
    generatedAt,
    lastGeneratedAt: generatedAt,
    mode: providerUsed,
    providerUsed,
    openAiAvailable: true,
    fallbackUsed: false,
    fallbackReason: '',
    score,
    headline: score.label === 'STABLE' ? `${providerUsed} sees stable operations.` : score.label === 'WATCH' ? `${providerUsed} sees items to review.` : score.label === 'AT_RISK' ? `${providerUsed} sees operations at risk.` : `${providerUsed} sees action needed now.`,
    executiveSummary: ai.executiveSummary || local.executiveSummary,
    summary: ai.executiveSummary || local.summary,
    nextActions: nextActions.length ? nextActions : local.nextActions,
    topActions: (nextActions.length ? nextActions : local.nextActions).slice(0, 5),
    watchlist: watchlist.length ? watchlist : local.watchlist,
    ownerLoad: ai.ownerLoad.length ? ai.ownerLoad : buildOwnerLoad(nextActions.length ? nextActions : local.nextActions),
    staleDataWarnings: ai.staleDataWarnings.length ? ai.staleDataWarnings : local.staleDataWarnings,
    confidence: local.confidence,
    followUpNeeded: local.followUpNeeded,
    error: '',
  };
}

async function runOpenAiBrief(
  input: DashboardIntelligenceInput,
  local: DashboardIntelligence,
  modelRoute: DashboardModelRoute,
  modelUsed: string
): Promise<DashboardIntelligence> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing.');
  logBriefEvent('model_selected', { provider: 'OPENAI', modelRoute, modelUsed });

  const payload = {
    modelRoute,
    provider: 'OPENAI',
    rules: aiOutputRules,
    evidence: local.evidence,
    localBrief: {
      score: local.score,
      executiveSummary: local.executiveSummary,
      nextActions: local.nextActions,
      watchlist: local.watchlist,
      ownerLoad: local.ownerLoad,
      staleDataWarnings: local.staleDataWarnings,
      changedSinceLastBrief: local.changedSinceLastBrief,
    },
    sourceFreshness: local.sourceFreshness,
    sourceStatuses: local.sourceStatuses,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelUsed,
        store: false,
        instructions: 'You are the Sunbelt Sports operations intelligence layer. Produce a source-backed chief-of-staff operations brief. Use only the evidence IDs provided. Return JSON that matches the schema.',
        input: JSON.stringify(payload),
        text: {
          format: {
            type: 'json_schema',
            name: 'ai_operations_brief',
            strict: true,
            schema: aiOperationsBriefSchema,
          },
        },
        max_output_tokens: AI_OUTPUT_TOKEN_LIMIT,
      }),
    }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
  }

  const json = await res.json();
  const text = extractResponseText(json);
  if (!text) throw new Error('OpenAI returned no JSON text.');
  return normalizeAiBrief(parseStructuredAiJson(text, 'OpenAI'), local, 'OPENAI');
}

async function runGeminiBrief(
  input: DashboardIntelligenceInput,
  local: DashboardIntelligence,
  modelRoute: DashboardModelRoute,
  modelUsed: string
): Promise<DashboardIntelligence> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing.');
  logBriefEvent('model_selected', { provider: 'GEMINI', modelRoute, modelUsed });

  const payload = {
    modelRoute,
    provider: 'GEMINI',
    rules: aiOutputRules,
    evidence: local.evidence,
    localBrief: {
      score: local.score,
      executiveSummary: local.executiveSummary,
      nextActions: local.nextActions,
      watchlist: local.watchlist,
      ownerLoad: local.ownerLoad,
      staleDataWarnings: local.staleDataWarnings,
      changedSinceLastBrief: local.changedSinceLastBrief,
    },
    sourceFreshness: local.sourceFreshness,
    sourceStatuses: local.sourceStatuses,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelUsed)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: 'You are the Sunbelt Sports operations intelligence layer. Produce a source-backed chief-of-staff operations brief. Use only the evidence IDs provided. Return JSON that matches the schema.',
        }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: JSON.stringify(payload) }],
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: toGeminiSchema(aiOperationsBriefSchema),
        maxOutputTokens: AI_OUTPUT_TOKEN_LIMIT,
      },
    }),
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
  }

  const json = await res.json();
  const finishReason = json?.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== 'STOP') {
    throw new Error(`Gemini finishReason ${finishReason}.`);
  }
  const text = extractGeminiResponseText(json);
  if (!text) throw new Error('Gemini returned no JSON text.');
  return normalizeAiBrief(parseStructuredAiJson(text, 'Gemini'), local, 'GEMINI');
}

async function persistBrief(brief: DashboardIntelligence, snapshot: Record<string, unknown>) {
  try {
    const result = await saveDashboardBrief({
      id: `dashboard-brief-${brief.generatedAt}`,
      generatedAt: brief.generatedAt,
      mode: brief.mode,
      providerUsed: brief.providerUsed,
      modelRoute: brief.modelRoute,
      modelUsed: brief.modelUsed,
      score: brief.score,
      summary: brief.executiveSummary,
      nextActions: brief.nextActions,
      watchlist: brief.watchlist,
      evidence: brief.evidence,
      sourceFreshness: brief.sourceFreshness,
      changedSinceLastBrief: brief.changedSinceLastBrief,
      errors: brief.error ? [brief.error] : [],
      rawSourceSnapshotHash: brief.rawSourceSnapshotHash,
      snapshot,
    });
    brief.persistence = { ok: result.ok, target: result.target, error: result.webhook?.error || '' };
  } catch (error) {
    brief.persistence = {
      ok: false,
      target: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return brief;
}

export async function getDashboardIntelligence(input: DashboardIntelligenceInput): Promise<DashboardIntelligence> {
  const sourceStatuses = normalizeSourceStatuses(input.sourceStatuses);
  const primaryProvider = configuredProvider();
  const aiEnabled = primaryProvider !== 'LOCAL';
  const health = await getIntelligenceHealth() as IntelligenceHealth;
  const previous = await readLastDashboardBrief();
  const modelRoute = routeForBrief({ ...input, sourceStatuses });
  const primaryModel = modelForProviderRoute(primaryProvider, modelRoute);
  const openAiModel = openAiModelForRoute(modelRoute);
  const geminiModel = geminiModelForRoute(modelRoute);
  const providerErrors: string[] = [];

  logBriefEvent('started', { primaryProvider, aiEnabled, modelRoute, modelUsed: aiEnabled ? primaryModel : null });
  logBriefEvent('sources_loaded', {
    sourcesRead: sourceStatuses.filter(s => s.status === 'connected').map(s => s.label),
    sourcesFailed: sourceStatuses.filter(s => s.status !== 'connected').map(s => s.label),
  });

  const disabledReason = aiEnabled
    ? `${primaryProvider} unavailable. Local intelligence used.`
    : 'AI_PROVIDER is local. Local intelligence used.';

  const local = buildLocalBrief(
    { ...input, sourceStatuses },
    previous,
    disabledReason,
    aiEnabled,
    false,
    health,
    primaryProvider === 'LOCAL' ? 'LOCAL' : primaryProvider,
    modelRoute,
    aiEnabled ? primaryModel : null
  );
  const snapshot = buildSnapshot(input, local.sourceFreshness);

  if (!aiEnabled) {
    logBriefEvent('local_fallback_used', { reason: local.fallbackReason });
    logBriefEvent('output_generated', { mode: local.mode, score: local.score.overall });
    return persistBrief(local, snapshot);
  }

  async function tryGemini() {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing.');
    let usedModel = geminiModel;
    let brief: DashboardIntelligence;
    try {
      brief = await runGeminiBrief(input, local, modelRoute, usedModel);
    } catch (error) {
      const firstMessage = error instanceof Error ? error.message : String(error);
      const fastModel = process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite';
      if (fastModel === usedModel) throw error;
      logBriefEvent('gemini_fast_retry', { modelRoute, failedModel: usedModel, retryModel: fastModel, reason: firstMessage });
      usedModel = fastModel;
      try {
        brief = await runGeminiBrief(input, local, modelRoute, usedModel);
        brief.fallbackUsed = true;
        brief.fallbackReason = 'Gemini primary model unavailable. Gemini fast model used.';
      } catch (retryError) {
        const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
        throw new Error(`${firstMessage} | Gemini fast retry: ${retryMessage}`);
      }
    }
    brief.health = { ...health, mode: 'GEMINI', providerUsed: 'GEMINI', hasGeminiApiKey: true };
    brief.modelRoute = modelRoute;
    brief.modelUsed = usedModel;
    logBriefEvent('gemini_used', { modelRoute, modelUsed: usedModel });
    return brief;
  }

  async function tryOpenAi() {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing.');
    const brief = await runOpenAiBrief(input, local, modelRoute, openAiModel);
    brief.health = { ...health, mode: 'OPENAI', providerUsed: 'OPENAI', openAIEnabled: true, hasApiKey: true };
    brief.modelRoute = modelRoute;
    brief.modelUsed = openAiModel;
    logBriefEvent('openai_used', { modelRoute, modelUsed: openAiModel });
    return brief;
  }

  try {
    let brief: DashboardIntelligence | null = null;

    if (primaryProvider === 'GEMINI') {
      try {
        brief = await tryGemini();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        providerErrors.push(`Gemini: ${message}`);
        logBriefEvent('error', { provider: 'GEMINI', message });
        try {
          brief = await tryOpenAi();
          brief.fallbackUsed = true;
          brief.fallbackReason = 'Gemini unavailable. OpenAI fallback used.';
        } catch (openAiError) {
          const openAiMessage = openAiError instanceof Error ? openAiError.message : String(openAiError);
          providerErrors.push(`OpenAI: ${openAiMessage}`);
          logBriefEvent('error', { provider: 'OPENAI', message: openAiMessage });
        }
      }
    } else if (primaryProvider === 'OPENAI') {
      try {
        brief = await tryOpenAi();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        providerErrors.push(`OpenAI: ${message}`);
        logBriefEvent('error', { provider: 'OPENAI', message });
      }
    }

    if (brief) {
      logBriefEvent('output_generated', { mode: brief.mode, providerUsed: brief.providerUsed, score: brief.score.overall, fallbackUsed: brief.fallbackUsed });
      return persistBrief(brief, snapshot);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    providerErrors.push(message);
  }

  const fallbackMessage = providerErrors.join(' | ') || `${primaryProvider} unavailable.`;
  const fallback = buildLocalBrief(
    { ...input, sourceStatuses },
    previous,
    'Gemini and OpenAI unavailable. Local intelligence used.',
    true,
    false,
    { ...health, mode: 'LOCAL', providerUsed: 'LOCAL', lastError: fallbackMessage },
    'LOCAL',
    modelRoute,
    primaryModel
  );
  fallback.error = fallbackMessage;
  logBriefEvent('local_fallback_used', { reason: fallback.fallbackReason });
  logBriefEvent('output_generated', { mode: fallback.mode, providerUsed: fallback.providerUsed, score: fallback.score.overall });
  return persistBrief(fallback, snapshot);
}
