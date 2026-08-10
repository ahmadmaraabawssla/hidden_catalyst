import { NextResponse } from 'next/server';
import { getConnectorRegistry } from '@hidden-catalyst/connectors';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const connectors = getConnectorRegistry();
    const connector = connectors.find(c => c.config.sourceId === params.id);

    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    const result = await connector.run();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
