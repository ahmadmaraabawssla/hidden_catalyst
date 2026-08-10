import { NextResponse } from 'next/server';
import { globalSearch } from '@hidden-catalyst/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.length < 1) {
    return NextResponse.json({ companies: [], opportunities: [], documents: [] });
  }

  try {
    const results = await globalSearch(query);
    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
