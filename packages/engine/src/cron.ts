/**
 * Cron job handler — runs connectors, scoring, and digests on schedule.
 * 
 * In production, use a proper job scheduler (BullMQ, Inngest, etc.).
 * For MVP, this can be triggered via a simple HTTP endpoint or CLI.
 */

import { runAllConnectors } from '@hidden-catalyst/connectors';
import { scoreAllPending } from './scoring';
import { sendAllDigests } from './alerts';

export async function runIngestionPipeline() {
  console.log('=== Starting ingestion pipeline ===');
  
  // 1. Run all connectors
  console.log('\n[1/4] Running connectors...');
  const connectorResults = await runAllConnectors();
  const totalNew = Object.values(connectorResults).reduce((sum, r) => sum + r.documentsNew, 0);
  console.log(`  Total new documents: ${totalNew}`);

  // 2. Score pending candidates
  console.log('\n[2/4] Scoring pending candidates...');
  const scoreResults = await scoreAllPending();
  console.log(`  Scored ${scoreResults.scored} opportunities`);

  // 3. Send digests
  console.log('\n[3/4] Sending daily digests...');
  await sendAllDigests();

  console.log('\n=== Pipeline complete ===');
  
  return { connectorResults, scoreResults };
}

// API route handler for cron jobs
export async function handleCronRequest() {
  try {
    const results = await runIngestionPipeline();
    return { success: true, results };
  } catch (err) {
    console.error('Cron job failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

// CLI
if (require.main === module) {
  runIngestionPipeline()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
