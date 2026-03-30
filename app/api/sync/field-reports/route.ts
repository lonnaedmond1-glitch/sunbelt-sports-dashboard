import { NextResponse } from 'next/server';
import { fetchLiveFieldReports } from '@/lib/sheets-data';

// API route now delegates to the shared Google Sheets-based fetcher
// Source: Google Form "Sunbelt Sports Daily Field Report" → Form Responses 1 tab

export async function GET() {
  try {
    const fieldReports = await fetchLiveFieldReports();
    return NextResponse.json({
      data: fieldReports,
      count: fieldReports.length,
      source: 'google-forms',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[sync/field-reports] Error:', error);
    return NextResponse.json({ error: 'Failed to sync field reports', data: [] }, { status: 500 });
  }
}
