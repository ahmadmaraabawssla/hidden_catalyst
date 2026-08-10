import { NextResponse } from 'next/server';
import { invalidateOpportunity } from '@hidden-catalyst/db';

const MOCK_ACTOR_ID = 'user_admin_001';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { reason } = await request.json();

    if (!reason) {
      return NextResponse.json({ error: 'Reason is required for invalidation' }, { status: 400 });
    }

    const updated = await invalidateOpportunity(params.id, MOCK_ACTOR_ID, reason);
    return NextResponse.json(updated);
  } catch (error) {
    console.error(`POST /api/admin/opportunities/${params.id}/invalidate error:`, error);
    return NextResponse.json({ error: 'Failed to invalidate' }, { status: 500 });
  }
}
