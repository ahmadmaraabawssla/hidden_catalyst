/**
 * Maintenance script: re-score existing `sec_filing` signals with the corrected
 * priority function. The old triage formula didn't recognize SEC form types
 * (8-K / 10-Q / 10-K / S-1 / 13D / 13G) as material events, so every SEC
 * filing scored ~54 — one point below the default MIN_RESEARCH_PRIORITY of 55
 * — and the platform's richest source never reached deep research.
 *
 * This is idempotent: it only writes when the recomputed score differs.
 *
 * Run: pnpm --filter @hidden-catalyst/engine exec tsx src/rescore-sec.ts
 */
import { prisma } from '@hidden-catalyst/db';
import { calculateSignalPriority } from '@hidden-catalyst/connectors';
import type { NormalizedSignal } from '@hidden-catalyst/domain';

async function main() {
  const signals = await prisma.signal.findMany({
    where: { sourceType: 'sec_filing' },
    select: { id: true, title: true, amounts: true, publishedAt: true, eventType: true, entities: true, sourceQuality: true, triageScore: true },
  });

  let updated = 0;
  let unchanged = 0;
  for (const s of signals) {
    const priority = calculateSignalPriority({
      amounts: (s.amounts ?? []) as NormalizedSignal['amounts'],
      publishedAt: s.publishedAt,
      eventType: s.eventType ?? '',
      entities: (s.entities ?? []) as NormalizedSignal['entities'],
      sourceQuality: s.sourceQuality ?? 0,
    } as NormalizedSignal);

    if (priority.score !== s.triageScore) {
      await prisma.signal.update({
        where: { id: s.id },
        data: { triageScore: priority.score, triageFactors: priority.factors as any },
      });
      updated++;
    } else {
      unchanged++;
    }
  }

  console.log(`[rescore-sec] re-scored ${updated} of ${signals.length} sec_filing signals (${unchanged} unchanged)`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[rescore-sec] fatal', err);
  process.exit(1);
});
