import { NextResponse } from 'next/server';
import { fetchLiveFieldReports } from '@/lib/sheets-data';

// API route delegates to the shared dual-source fetcher (Jotform + Google Forms merged)

export async function GET() {
  try {
    const fieldReports = await fetchLiveFieldReports();
    return NextResponse.json({
      data: fieldReports,
      count: fieldReports.length,
      source: 'jotform+google-forms',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[sync/field-reports] Error:', error);
    return NextResponse.json({ error: 'Failed to sync field reports', data: [] }, { status: 500 });
  }
}
