import { NextRequest, NextResponse } from 'next/server';
import { runAllConnectors } from '@hidden-catalyst/connectors';
import { evaluateThesisMonitoring, runSourceAgnosticIntelligencePass } from '@hidden-catalyst/engine';
import { prisma } from '@hidden-catalyst/db';

export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest) {
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) return process.env.NODE_ENV !== 'production';
  return req.headers.get('x-admin-api-key') === configured;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const skipConnectors = body.skipConnectors === true;

  const steps: string[] = [];
  try {
    let connectorResult: unknown = null;
    if (!skipConnectors) {
      steps.push('Harvesting normalized public signals from configured sources.');
      connectorResult = await runAllConnectors();
    }

    steps.push('Triage unclustered signals and evaluate catalyst clusters.');
    const intelligence = await runSourceAgnosticIntelligencePass({
      signalLimit: Number(body.signalLimit || 100),
      minPriority: Number(body.minPriority || 55),
    });

    steps.push('Re-evaluating monitored opportunities.');
    const monitored = await prisma.opportunity.findMany({
      where: { verificationStatus: { in: ['watch', 'candidate', 'verified', 'monitoring'] } },
      select: { id: true },
      take: Number(body.monitorLimit || 100),
    });

    const monitoring = [];
    for (const opp of monitored) {
      monitoring.push(await evaluateThesisMonitoring(opp.id).catch((error) => ({
        opportunityId: opp.id,
        state: 'error',
        reasons: [(error as Error).message],
      })));
    }

    return NextResponse.json({
      ok: true,
      steps,
      connectorResult,
      intelligence,
      monitoring,
    });
  } catch (error) {
    console.error('POST /api/admin/run-source-agnostic error:', error);
    return NextResponse.json({
      ok: false,
      steps,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
