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

export function validateProductionConfig(env: NodeJS.ProcessEnv) {
  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!env.SEC_USER_AGENT || !/@/.test(env.SEC_USER_AGENT)) missing.push('SEC_USER_AGENT with contact email');
  if (env.NODE_ENV === 'production') {
    if (!env.DEEPSEEK_API_KEY) missing.push('DEEPSEEK_API_KEY');
    if (!env.FMP_API_KEY) missing.push('FMP_API_KEY');
  }
  if (missing.length) throw new Error(`Engine configuration invalid: missing ${missing.join(', ')}`);
}

async function runIntelligenceEngineUnlocked() {
  validateProductionConfig(process.env);
  const started = performance.now();
  const logLevel = (process.env.HC_ENGINE_LOG_LEVEL || 'normal') as EngineLogLevel;
  const signalLimit = numberEnv('SIGNAL_LIMIT', 100);
  const minPriority = numberEnv('MIN_RESEARCH_PRIORITY', 55);
  const monitorLimit = numberEnv('MONITOR_LIMIT', 100);
  const evalFreshnessHours = numberEnv('EVAL_FRESHNESS_HOURS', 12);
  const maxConnectorFailures = numberEnv('MAX_CONNECTOR_FAILURES', 0);
  const maxPartialConnectors = numberEnv('MAX_PARTIAL_CONNECTORS', 1);
  const maxEvaluationFailureRate = numberEnv('MAX_EVALUATION_FAILURE_RATE', 0.05);
  const maxFamilyShare = numberEnv('MAX_SOURCE_FAMILY_SHARE', 0.5);

  log(logLevel, `[engine] run started level=${logLevel} signalLimit=${signalLimit} minPriority=${minPriority} monitorLimit=${monitorLimit} evalFreshnessHours=${evalFreshnessHours}`);
  log(logLevel, formatCapabilityLog(process.env));

  log(logLevel, '[stage] harvest start');
  const connectorResults = await runAllConnectors();
  const connectorSummary = Object.values(connectorResults).reduce((summary, result) => ({
    fetched: summary.fetched + result.documentsFetched,
    added: summary.added + result.documentsNew,
    duplicates: summary.duplicates + result.duplicates,
    failed: summary.failed + (result.status === 'failed' ? 1 : 0),
    partial: summary.partial + (result.status === 'partial' ? 1 : 0),
  }), { fetched: 0, added: 0, duplicates: 0, failed: 0, partial: 0 });
  log(logLevel, `[stage] harvest complete fetched=${connectorSummary.fetched} added=${connectorSummary.added} duplicates=${connectorSummary.duplicates} partial=${connectorSummary.partial} failed=${connectorSummary.failed}`);

  log(logLevel, '[stage] intelligence start');
  const intelligence = await runSourceAgnosticIntelligencePass({ signalLimit, minPriority, logLevel, evalFreshnessHours, maxFamilyShare });
  log(logLevel, `[stage] intelligence complete clustered=${intelligence.triage.clusters} evaluated=${intelligence.evaluated} skippedFresh=${intelligence.skippedFresh ?? 0}`);

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
  const attemptedEvaluations = intelligence.evaluated + intelligence.failures.length;
  const evaluationFailureRate = attemptedEvaluations > 0 ? intelligence.failures.length / attemptedEvaluations : 0;
  const healthy = connectorSummary.failed <= maxConnectorFailures && connectorSummary.partial <= maxPartialConnectors && evaluationFailureRate <= maxEvaluationFailureRate && monitoringFailures === 0;
  const summary = { connectorSummary, triage: intelligence.triage, evaluated: intelligence.evaluated, evaluationFailures: intelligence.failures, evaluationFailureRate, monitored: active.length, monitoringFailures, healthy, elapsedMs };
  log(logLevel, `[engine] run complete evaluated=${summary.evaluated} monitored=${summary.monitored} failures=${summary.monitoringFailures} elapsedMs=${elapsedMs}`);
  if (!healthy) throw new Error(`Engine health gate failed: connectorFailures=${connectorSummary.failed}, partialConnectors=${connectorSummary.partial}, evaluationFailureRate=${evaluationFailureRate.toFixed(3)}, monitoringFailures=${monitoringFailures}`);
  return summary;
}

export async function runIntelligenceEngine() {
  const lockId = 742_091_337;
  const rows = await prisma.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_lock(${lockId}) AS acquired`;
  if (!rows[0]?.acquired) throw new Error('Another intelligence-engine run already holds the production lock.');
  try {
    return await runIntelligenceEngineUnlocked();
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})`.catch(() => undefined);
  }
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
