import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { clearSheetsDataCache } from '@/lib/sheets-data';

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const refreshedAt = new Date().toISOString();
  clearSheetsDataCache();
  revalidatePath('/dashboard');

  console.info(JSON.stringify({
    event: 'dashboard_intelligence_brief_regenerate_requested',
    at: refreshedAt,
    source: body.source || 'unknown',
  }));

  return NextResponse.json({ ok: true, refreshedAt });
}
