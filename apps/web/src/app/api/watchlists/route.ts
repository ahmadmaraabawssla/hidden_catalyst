import { NextResponse } from 'next/server';
import { getUserWatchlists, createWatchlist } from '@hidden-catalyst/db';

// TODO: get userId from session when auth is enabled
const MOCK_USER_ID = 'user_mock_001';

export async function GET() {
  try {
    const watchlists = await getUserWatchlists(MOCK_USER_ID);
    return NextResponse.json(watchlists);
  } catch (error) {
    console.error('GET /api/watchlists error:', error);
    return NextResponse.json({ error: 'Failed to fetch watchlists' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const watchlist = await createWatchlist(MOCK_USER_ID, name);
    return NextResponse.json(watchlist, { status: 201 });
  } catch (error) {
    console.error('POST /api/watchlists error:', error);
    return NextResponse.json({ error: 'Failed to create watchlist' }, { status: 500 });
  }
}
