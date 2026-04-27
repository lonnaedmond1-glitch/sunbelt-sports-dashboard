import { NextResponse } from 'next/server';
import { fetchScheduleData } from '@/lib/sheets-data';

export async function GET() {
  try {
    const schedule = await fetchScheduleData();
    return NextResponse.json({
      ...schedule,
      source: 'shared_schedule_reader',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[sync/schedule] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch schedule', currentWeek: { days: [] }, nextWeek: { days: [] } },
      { status: 500 }
    );
  }
}
