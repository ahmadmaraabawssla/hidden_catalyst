import { NextResponse } from 'next/server';
import { getCompanyByTicker } from '@hidden-catalyst/db';

export async function GET(
  _request: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    const security = await getCompanyByTicker(params.ticker);

    if (!security) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json(security);
  } catch (error) {
    console.error(`GET /api/companies/${params.ticker} error:`, error);
    return NextResponse.json({ error: 'Failed to fetch company' }, { status: 500 });
  }
}
