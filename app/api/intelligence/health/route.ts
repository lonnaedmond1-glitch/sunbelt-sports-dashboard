import { NextResponse } from 'next/server';
import { getIntelligenceHealth } from '@/lib/intelligence-store';

export async function GET() {
  const health = await getIntelligenceHealth();
  return NextResponse.json(health);
}
