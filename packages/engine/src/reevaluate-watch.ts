/**
 * Maintenance script: re-evaluate clusters whose opportunity is parked in
 * "watch" (verification_status = 'watch') so deterministic qualification fixes
 * (no-amount clinical/regulatory closure, watch shelf-life) are re-applied
 * without waiting for the 12h freshness window to lapse.
 *
 * Run: pnpm --filter @hidden-catalyst/engine exec tsx src/reevaluate-watch.ts
 */
import { prisma } from '@hidden-catalyst/db';
import { evaluateClusterForOpportunity } from './signal-intelligence';

async function main() {
  const opportunities = await prisma.opportunity.findMany({
    where: {
      engineVersion: 'source-agnostic-v2',
      verificationStatus: 'watch',
      clusterId: { not: null },
    },
    select: { id: true, clusterId: true, title: true },
  });

  console.log(`[reevaluate] found ${opportunities.length} watch opportunities`);

  let rejected = 0;
  let promoted = 0;
  let unchanged = 0;
  const failures: string[] = [];

  for (const opp of opportunities) {
    if (!opp.clusterId) continue;
    try {
      const result = await evaluateClusterForOpportunity(opp.clusterId, { logLevel: 'quiet' });
      const status = result.researchReport.thesisStatus;
      if (status === 'reject') rejected++;
      else if (status === 'candidate' || status === 'verified') promoted++;
      else unchanged++;
      console.log(`[reevaluate] ${opp.title.slice(0, 55).padEnd(55)} → ${status}`);
    } catch (err) {
      failures.push(`${opp.clusterId}: ${(err as Error).message}`);
      console.log(`[reevaluate] ${opp.title.slice(0, 55).padEnd(55)} → ERROR`);
    }
  }

  console.log(`\n[reevaluate] done rejected=${rejected} promoted=${promoted} unchanged=${unchanged} failures=${failures.length}`);
  for (const f of failures) console.log(`  ! ${f}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[reevaluate] fatal', err);
  process.exit(1);
});
