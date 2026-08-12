/**
 * Cron job handler — runs connectors, scoring, and digests on schedule.
 * 
 * In production, use a proper job scheduler (BullMQ, Inngest, etc.).
 * For MVP, this can be triggered via a simple HTTP endpoint or CLI.
 */

import { sendAllDigests } from './alerts';
import { runIntelligenceEngine } from './cli';

export async function runIngestionPipeline() {
  console.log('=== Starting ingestion pipeline ===');
  
  const engine = await runIntelligenceEngine();

  console.log('\nSending daily digests...');
  await sendAllDigests();

  console.log('\n=== Pipeline complete ===');
  
  return { engine };
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
