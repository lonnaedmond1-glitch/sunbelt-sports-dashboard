import { NextResponse } from 'next/server';
import { fetchProjectPrepCenter } from '@/lib/project-prep-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = await fetchProjectPrepCenter();
  return NextResponse.json(payload);
}
