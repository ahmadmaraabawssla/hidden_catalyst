import { NextResponse } from 'next/server';
import { handleCronRequest } from '@hidden-catalyst/engine';

// Secured by a simple bearer token — replace with proper auth
const CRON_SECRET = process.env.CRON_SECRET || 'dev-secret';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await handleCronRequest();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
