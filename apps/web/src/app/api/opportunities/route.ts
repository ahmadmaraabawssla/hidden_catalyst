import { NextResponse } from 'next/server';
import { getPublishedOpportunities } from '@hidden-catalyst/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const { opportunities, total } = await getPublishedOpportunities({
      status: searchParams.get('status') || 'published',
      minScore: searchParams.get('minScore') ? Number(searchParams.get('minScore')) : undefined,
      maxRisk: searchParams.get('maxRisk') ? Number(searchParams.get('maxRisk')) : undefined,
      sector: searchParams.get('sector') || undefined,
      catalystType: searchParams.get('catalystType') || undefined,
      marketCapMin: searchParams.get('marketCapMin') ? Number(searchParams.get('marketCapMin')) : undefined,
      marketCapMax: searchParams.get('marketCapMax') ? Number(searchParams.get('marketCapMax')) : undefined,
      sort: (searchParams.get('sort') as any) || 'opportunity',
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 20,
      offset: searchParams.get('offset') ? Number(searchParams.get('offset')) : 0,
    });

    return NextResponse.json({ opportunities, total });
  } catch (error) {
    console.error('GET /api/opportunities error:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 });
  }
}
