/**
 * Source-agnostic intelligence pipeline.
 *
 * Runs connectors, normalizes public-source records into signals, clusters
 * high-priority signals, evaluates materiality/adversarial gates, and refreshes
 * monitoring state for active opportunities.
 */

const { runAllConnectors } = require('../packages/connectors/src/runner');
const {
  runSourceAgnosticIntelligencePass,
  evaluateThesisMonitoring,
} = require('../packages/engine/src');
const { prisma } = require('../packages/db/src');

async function main() {
  console.log('=== Hidden Catalyst Source-Agnostic Pipeline ===');

  console.log('\n[1/3] Harvesting public-source signals...');
  const connectorResults = await runAllConnectors();

  console.log('\n[2/3] Triage and cluster evaluation...');
  const intelligence = await runSourceAgnosticIntelligencePass({
    signalLimit: Number(process.env.SIGNAL_LIMIT || 100),
    minPriority: Number(process.env.MIN_RESEARCH_PRIORITY || 55),
  });

  console.log('\n[3/3] Monitoring active opportunities...');
  const active = await prisma.opportunity.findMany({
    where: { status: 'published', verificationStatus: { in: ['watch', 'candidate', 'verified'] } },
    select: { id: true },
    take: Number(process.env.MONITOR_LIMIT || 100),
  });

  const monitoring = [];
  for (const opp of active) {
    try {
      monitoring.push(await evaluateThesisMonitoring(opp.id));
    } catch (err) {
      monitoring.push({ opportunityId: opp.id, state: 'unchanged', reasons: [(err && err.message) || 'monitoring failed'] });
    }
  }

  console.log('\n=== Pipeline Complete ===');
  console.log(JSON.stringify({ connectorResults, intelligence, monitored: monitoring.length }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal:', err && err.message ? err.message : err);
  try { await prisma.$disconnect(); } catch (_) {}
  process.exit(1);
});
