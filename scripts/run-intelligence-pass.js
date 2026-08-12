/**
 * Direct source-agnostic intelligence pass — skips connectors, runs only the
 * research-report engine (buildResearchReport) over existing clusters.
 * Prints [engine] and [research-report] logs.
 */
const { runSourceAgnosticIntelligencePass } = require('../packages/engine/src');

async function main() {
  const intelligence = await runSourceAgnosticIntelligencePass({
    signalLimit: Number(process.env.SIGNAL_LIMIT || 10),
    minPriority: Number(process.env.MIN_RESEARCH_PRIORITY || 1),
    logLevel: process.env.HC_ENGINE_LOG_LEVEL || 'verbose',
  });
  console.log('\n=== Summary ===');
  console.log(JSON.stringify({
    triaged: intelligence.triage,
    evaluated: intelligence.evaluated,
    logs: intelligence.logs,
  }, null, 2));
}

main().catch((e) => { console.error('Fatal:', e && e.message ? e.message : e); process.exit(1); });
