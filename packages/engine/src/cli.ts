import { performance } from 'node:perf_hooks';
import { prisma } from '@hidden-catalyst/db';
import { runAllConnectors } from '@hidden-catalyst/connectors';
import { evaluateThesisMonitoring } from './monitoring';
import { runSourceAgnosticIntelligencePass, type EngineLogLevel } from './signal-intelligence';

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function log(level: EngineLogLevel, message: string) {
  if (level !== 'quiet' && level !== 'silent') console.log(message);
}

export function formatCapabilityLog(env: NodeJS.ProcessEnv) {
  return `[engine] capabilities database=${!!env.DATABASE_URL} deepseek=${!!env.DEEPSEEK_API_KEY} secIdentity=${!!env.SEC_USER_AGENT}`;
}

export async function runIntelligenceEngine() {
  const started = performance.now();
  const logLevel = (process.env.HC_ENGINE_LOG_LEVEL || 'normal') as EngineLogLevel;
  const signalLimit = numberEnv('SIGNAL_LIMIT', 100);
  const minPriority = numberEnv('MIN_RESEARCH_PRIORITY', 55);
  const monitorLimit = numberEnv('MONITOR_LIMIT', 100);

  log(logLevel, `[engine] run started level=${logLevel} signalLimit=${signalLimit} minPriority=${minPriority} monitorLimit=${monitorLimit}`);
  log(logLevel, formatCapabilityLog(process.env));

  log(logLevel, '[stage] harvest start');
  const connectorResults = await runAllConnectors();
  const connectorSummary = Object.values(connectorResults).reduce((summary, result) => ({
    fetched: summary.fetched + result.documentsFetched,
    added: summary.added + result.documentsNew,
    duplicates: summary.duplicates + result.duplicates,
    failed: summary.failed + (result.status === 'failed' ? 1 : 0),
  }), { fetched: 0, added: 0, duplicates: 0, failed: 0 });
  log(logLevel, `[stage] harvest complete fetched=${connectorSummary.fetched} added=${connectorSummary.added} duplicates=${connectorSummary.duplicates} failed=${connectorSummary.failed}`);

  log(logLevel, '[stage] intelligence start');
  const intelligence = await runSourceAgnosticIntelligencePass({ signalLimit, minPriority, logLevel });
  log(logLevel, `[stage] intelligence complete clustered=${intelligence.triage.clusters} evaluated=${intelligence.evaluated}`);

  log(logLevel, '[stage] monitoring start');
  const active = await prisma.opportunity.findMany({
    where: { status: 'published', verificationStatus: { in: ['watch', 'candidate', 'verified'] } },
    select: { id: true },
    take: monitorLimit,
  });
  let monitoringFailures = 0;
  for (const opportunity of active) {
    try {
      await evaluateThesisMonitoring(opportunity.id);
    } catch (error) {
      monitoringFailures++;
      if (logLevel === 'verbose' || logLevel === 'debug') log(logLevel, `[monitor] opportunity=${opportunity.id} failed=${(error as Error).message}`);
    }
  }

  const elapsedMs = Math.round(performance.now() - started);
  const summary = { connectorSummary, triage: intelligence.triage, evaluated: intelligence.evaluated, monitored: active.length, monitoringFailures, elapsedMs };
  log(logLevel, `[engine] run complete evaluated=${summary.evaluated} monitored=${summary.monitored} failures=${summary.monitoringFailures} elapsedMs=${elapsedMs}`);
  return summary;
}

if (require.main === module) {
  runIntelligenceEngine()
    .then(async (summary) => {
      if ((process.env.HC_ENGINE_LOG_LEVEL || 'normal') !== 'quiet') console.log(JSON.stringify(summary, null, 2));
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(`[engine] fatal ${(error as Error).message}`);
      try { await prisma.$disconnect(); } catch {}
      process.exitCode = 1;
    });
}
