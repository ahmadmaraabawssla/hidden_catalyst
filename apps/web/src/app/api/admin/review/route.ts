import { NextResponse } from 'next/server';
import { getReviewQueue, approveAndPublish, rejectOpportunity, getDashboardStats } from '@hidden-catalyst/db';

const MOCK_ACTOR_ID = 'user_admin_001';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const opportunities = await getReviewQueue({
      status: searchParams.get('status') || 'needs_review',
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 50,
    });

    return NextResponse.json(opportunities);
  } catch (error) {
    console.error('GET /api/admin/review error:', error);
    return NextResponse.json({ error: 'Failed to fetch review queue' }, { status: 500 });
  }
}
