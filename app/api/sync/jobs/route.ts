import { NextResponse } from 'next/server';
import { fetchLiveJobs } from '@/lib/sheets-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = await fetchLiveJobs();
    return NextResponse.json({ data: jobs, count: jobs.length, source: 'google_sheets', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[sync/jobs] Error:', error);
    return NextResponse.json({ error: 'Failed to sync job list', data: [] }, { status: 500 });
  }
}
