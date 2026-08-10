import { NextResponse } from 'next/server';
import { getSources, getDashboardStats } from '@hidden-catalyst/db';

export async function GET() {
  try {
    const sources = await getSources();
    return NextResponse.json(sources);
  } catch (error) {
    console.error('GET /api/admin/sources error:', error);
    return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 });
  }
}
