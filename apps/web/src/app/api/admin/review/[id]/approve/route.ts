import { NextResponse } from 'next/server';
import { approveAndPublish, rejectOpportunity } from '@hidden-catalyst/db';

const MOCK_ACTOR_ID = 'user_admin_001';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { publish } = await request.json().catch(() => ({ publish: true }));

    if (publish) {
      const updated = await approveAndPublish(params.id, MOCK_ACTOR_ID);
      return NextResponse.json(updated);
    }

    return NextResponse.json({ message: 'Approved (not published)' });
  } catch (error) {
    console.error(`POST /api/admin/review/${params.id}/approve error:`, error);
    return NextResponse.json({ error: 'Failed to approve' }, { status: 500 });
  }
}
