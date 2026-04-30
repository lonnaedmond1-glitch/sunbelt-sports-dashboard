import 'server-only';

import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

export interface StoredDashboardBrief {
  id: string;
  generatedAt: string;
  mode: string;
  providerUsed: string;
  modelRoute: string;
  modelUsed: string | null;
  score: unknown;
  summary: string;
  nextActions: unknown[];
  watchlist: unknown[];
  evidence: unknown[];
  sourceFreshness: unknown[];
  changedSinceLastBrief: unknown[];
  errors: string[];
  rawSourceSnapshotHash: string;
  snapshot: Record<string, unknown>;
}

export interface DashboardActionEvent {
  id: string;
  actionId: string;
  actionTitle: string;
  actionType: string;
  owner: string | null;
  status: string;
  note: string;
  actionPayload: Record<string, unknown>;
  sourceEvidenceIds: string[];
  createdAt: string;
}

interface IntelligenceStoreFile {
  briefs: StoredDashboardBrief[];
  actionEvents: DashboardActionEvent[];
  actionState: Record<string, DashboardActionEvent>;
  health: {
    lastRunAt: string | null;
    lastError: string | null;
  };
}

const EMPTY_STORE: IntelligenceStoreFile = {
  briefs: [],
  actionEvents: [],
  actionState: {},
  health: { lastRunAt: null, lastError: null },
};

export function hashSnapshot(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function storeDir() {
  return process.env.INTELLIGENCE_STORE_DIR || path.join(process.cwd(), '.sunbelt-runtime');
}

function fallbackStoreDir() {
  return path.join(os.tmpdir(), 'sunbelt-runtime');
}

async function ensureStorePath() {
  const primary = storeDir();
  try {
    await mkdir(primary, { recursive: true });
    return path.join(primary, 'operations-intelligence-store.json');
  } catch {
    const fallback = fallbackStoreDir();
    await mkdir(fallback, { recursive: true });
    return path.join(fallback, 'operations-intelligence-store.json');
  }
}

async function readStore(): Promise<IntelligenceStoreFile> {
  try {
    const filePath = await ensureStorePath();
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as IntelligenceStoreFile;
    return {
      briefs: Array.isArray(parsed.briefs) ? parsed.briefs : [],
      actionEvents: Array.isArray(parsed.actionEvents) ? parsed.actionEvents : [],
      actionState: parsed.actionState && typeof parsed.actionState === 'object' ? parsed.actionState : {},
      health: parsed.health || EMPTY_STORE.health,
    };
  } catch {
    return { ...EMPTY_STORE, briefs: [], actionEvents: [], actionState: {}, health: { ...EMPTY_STORE.health } };
  }
}

async function writeStore(store: IntelligenceStoreFile) {
  const filePath = await ensureStorePath();
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf-8');
  return filePath;
}

async function postWebhook(action: string, payload: Record<string, unknown>) {
  const webhookUrl = process.env.OPERATIONS_INTELLIGENCE_WEBHOOK_URL;
  if (!webhookUrl) return { ok: false, skipped: true, error: 'OPERATIONS_INTELLIGENCE_WEBHOOK_URL is not set.' };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        secret: process.env.OPERATIONS_INTELLIGENCE_WEBHOOK_SECRET || '',
        payload,
      }),
    });
    if (!res.ok) return { ok: false, skipped: false, error: `Webhook HTTP ${res.status}` };
    return { ok: true, skipped: false, error: '' };
  } catch (error) {
    return { ok: false, skipped: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function readLastDashboardBrief(): Promise<StoredDashboardBrief | null> {
  const store = await readStore();
  return store.briefs.length ? store.briefs[store.briefs.length - 1] : null;
}

export async function saveDashboardBrief(brief: StoredDashboardBrief) {
  const store = await readStore();
  store.briefs = [...store.briefs, brief].slice(-50);
  store.health = {
    lastRunAt: brief.generatedAt,
    lastError: brief.errors[0] || null,
  };
  const filePath = await writeStore(store);
  const webhook = await postWebhook('saveDashboardBrief', { brief });
  return {
    ok: true,
    target: webhook.ok ? 'webhook_and_local_file' : 'local_file',
    filePath,
    webhook,
  };
}

export async function appendDashboardActionEvent(event: DashboardActionEvent) {
  const store = await readStore();
  store.actionEvents = [...store.actionEvents, event].slice(-500);
  store.actionState[event.actionId] = event;
  const filePath = await writeStore(store);
  const webhook = await postWebhook('appendDashboardAction', { event });
  return {
    ok: true,
    target: webhook.ok ? 'webhook_and_local_file' : 'local_file',
    filePath,
    webhook,
  };
}

export async function getIntelligenceHealth() {
  const store = await readStore();
  const lastBrief = store.briefs.length ? store.briefs[store.briefs.length - 1] : null;
  const requestedProvider = (process.env.AI_PROVIDER || 'gemini').trim().toUpperCase();
  const primaryProvider = requestedProvider === 'OPENAI' || requestedProvider === 'LOCAL' ? requestedProvider : 'GEMINI';
  const hasGeminiApiKey = Boolean(process.env.GEMINI_API_KEY);
  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
  const openAIEnabled = hasOpenAiKey;
  const mode =
    primaryProvider === 'LOCAL' ? 'LOCAL' :
    primaryProvider === 'GEMINI' && hasGeminiApiKey ? 'GEMINI' :
    hasOpenAiKey ? 'OPENAI' :
    'LOCAL';
  return {
    mode: lastBrief?.mode || mode,
    primaryProvider,
    providerUsed: lastBrief?.providerUsed || mode,
    hasGeminiApiKey,
    openAIEnabled,
    hasApiKey: hasOpenAiKey,
    model: lastBrief?.modelUsed || null,
    lastRunAt: store.health.lastRunAt,
    lastError: store.health.lastError,
    storeTarget: process.env.OPERATIONS_INTELLIGENCE_WEBHOOK_URL ? 'webhook_and_local_file' : 'local_file',
  };
}
