import { NextResponse } from 'next/server';
import { getOpportunityById, getOpportunityEvidence } from '@hidden-catalyst/db';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const opportunity = await getOpportunityById(params.id);

    if (!opportunity) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
    }

    const evidence = await getOpportunityEvidence(params.id);

    return NextResponse.json({ ...opportunity, evidence });
  } catch (error) {
    console.error(`GET /api/opportunities/${params.id} error:`, error);
    return NextResponse.json({ error: 'Failed to fetch opportunity' }, { status: 500 });
  }
}
