import { NextResponse } from 'next/server';
import { getRelationshipGraph } from '@hidden-catalyst/db';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const graph = await getRelationshipGraph(params.id);

    if (!graph) {
      return NextResponse.json({ error: 'No relationships found' }, { status: 404 });
    }

    return NextResponse.json(graph);
  } catch (error) {
    console.error(`GET /api/opportunities/${params.id}/relationships error:`, error);
    return NextResponse.json({ error: 'Failed to fetch relationships' }, { status: 500 });
  }
}
