import { prisma } from '@hidden-catalyst/db';
import {
  calculateResearchPriority,
  qualifyOpportunity,
  type NormalizedSignal,
  type QualificationGateInput,
  type ResearchPriorityInput,
} from '@hidden-catalyst/domain';
import { computeMateriality, extractLargestAmount } from './materiality';
import { enrichFinancialDenominators } from './market-data';
import { measureAttention } from './catalyst-attention';
import { fetchPriceReaction } from './price-reaction';
import { runDeterministicAdversarialCheck } from './adversarial';
import { buildResearchReport } from './research-report';
import type { ResearchReport } from './research-report';
import { createDefaultResearchRegistry, mergeDeepResearch, type DeepResearchCompanyContext } from './deep-research';

const MATERIAL_EVENT_TYPES = new Set([
  'contract_award',
  'contract_modification',
  'regulatory_approval',
  'regulatory_decision',
  'clinical_trial_result',
  'patent_grant',
  'merger_acquisition',
  'legal_development',
]);

function clamp(value: number, min = 1, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function daysSince(date: Date) {
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000));
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Normalize a company name for matching: lowercase, strip punctuation and
 * common legal suffixes, so "CorVista Medical, Inc." ≈ "corvistamedical".
 * Returns null if the resulting stem is too short to be a safe match key.
 */
function normalizeCompanyName(name: unknown): string | null {
  let stem = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  // Strip leading definite article ("THE BOEING COMPANY" → "boeingcompany").
  stem = stem.replace(/^the/, '');
  // Strip trailing legal suffixes repeatedly (handles stacked "Inc. Co." etc).
  const suffixes = [
    'incorporated', 'corporation', 'company', 'limited', 'holdings', 'holding',
    'group', 'inc', 'corp', 'llc', 'ltd', 'plc', 'co', 'sa', 'ag', 'nv', 'gmbh', 'spa',
    'adr', 'fi', // EDGAR foreign-issuer markers ("PLC /FI/", "(ADR)")
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of suffixes) {
      if (stem.endsWith(suffix)) {
        stem = stem.slice(0, -suffix.length);
        changed = true;
      }
    }
  }
  return stem.length >= 3 ? stem : null;
}

/**
 * Map a cluster type / source type to a coarse source family for scheduling
 * diversity. Ensures no single source (e.g. regulatory/clinical) monopolizes
 * the research budget when other families have eligible clusters.
 */
function sourceFamily(clusterTypeOrSource: string): string {
  const t = String(clusterTypeOrSource || '').toLowerCase();
  if (/sec_filing|8-?k|10-?k|10-?q|s-?1|13d|proxy|filing/.test(t)) return 'sec';
  if (/contract|award|grant|customer|sam/.test(t)) return 'contracts';
  if (/patent|uspto/.test(t)) return 'patents';
  if (/clinical|trial|fda|approval|drug|device|regulatory|clearance/.test(t)) return 'regulatory';
  if (/merger|acquisition|legal/.test(t)) return 'corporate';
  return 'other';
}

/**
 * The known sourceType values that belong to a coarse source family. Used to
 * draw a per-family candidate pool at triage (see triageUnclusteredSignals),
 * so no family is excluded from the pool before the round-robin runs.
 */
function sourceTypesForFamily(family: string): string[] {
  switch (family) {
    case 'sec':
      return ['sec_filing'];
    case 'contracts':
      return ['federal_contract', 'contract_award', 'contract_modification', 'grant'];
    case 'regulatory':
      return ['clinical_trial', 'fda_document', 'device_clearance', 'regulatory_approval', 'regulatory_decision', 'clinical_trial_result', 'clinical_trial_update'];
    case 'patents':
      return ['patent_grant', 'patent_assignment'];
    case 'corporate':
      return ['merger_acquisition', 'legal_development', 'public_signal'];
    default:
      return [];
  }
}

/**
 * Extract a small set of search keywords from a cluster title for attention
 * matching (press-release / news keyword lookups). Returns the company name
 * plus the most distinctive title tokens.
 */
function extractKeywords(title: string, companyName?: string): string[] {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'inc', 'corp', 'llc', 'ltd', 'co', 'company', 'corporation', 'new', 'update', 'federal', 'contract']);
  const tokens = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length >= 4 && !stop.has(word));
  const keywords = new Set<string>();
  if (companyName) keywords.add(String(companyName).toLowerCase());
  for (const token of tokens) {
    if (keywords.size >= 8) break;
    keywords.add(token);
  }
  return [...keywords];
}

export type EngineLogLevel = 'quiet' | 'normal' | 'verbose' | 'debug' | 'silent' | 'summary';

interface EngineLogger {
  level: EngineLogLevel;
  log: (line: string) => void;
}

export interface ResearchEvaluationLog {
  clusterId: string;
  title: string;
  signalCount: number;
  thesisStatus: string;
  finalStatus: string;
  completeness: number;
  confidence: number;
  materialityLevel: string;
  materialityMetric: string;
  rejectedClaims: number;
  unverifiedClaims: number;
  checks: Record<string, number>;
  pendingChecks: string[];
}

function createLogger(level: EngineLogLevel | undefined): EngineLogger {
  const requested = level || (process.env.HC_ENGINE_LOG_LEVEL as EngineLogLevel | undefined) || 'normal';
  const selected: EngineLogLevel = requested === 'silent' ? 'quiet' : requested === 'summary' ? 'normal' : requested;
  return {
    level: selected,
    log(line: string) {
      if (selected !== 'quiet') console.log(line);
    },
  };
}

function checkCounts(report: ResearchReport): Record<string, number> {
  return report.researchChecks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function summarizeEvaluation(args: {
  clusterId: string;
  title: string;
  signalCount: number;
  finalStatus: string;
  materiality: ReturnType<typeof computeMateriality>;
  researchReport: ResearchReport;
}): ResearchEvaluationLog {
  return {
    clusterId: args.clusterId,
    title: args.title,
    signalCount: args.signalCount,
    thesisStatus: args.researchReport.thesisStatus,
    finalStatus: args.finalStatus,
    completeness: args.researchReport.completeness,
    confidence: args.researchReport.confidence,
    materialityLevel: args.materiality.level,
    materialityMetric: args.materiality.metric,
    rejectedClaims: args.researchReport.rejectedClaims.length,
    unverifiedClaims: args.researchReport.unverifiedClaims.length,
    checks: checkCounts(args.researchReport),
    pendingChecks: args.researchReport.researchChecks
      .filter((check) => check.status === 'pending' || check.status === 'partial')
      .map((check) => `${check.check}: ${check.result}`),
  };
}

function logEvaluation(summary: ResearchEvaluationLog, report: ResearchReport, logger: EngineLogger) {
  if (logger.level === 'quiet') return;
  logger.log(`[research-report] cluster=${summary.clusterId} signals=${summary.signalCount} thesis=${summary.thesisStatus} final=${summary.finalStatus} completeness=${summary.completeness} confidence=${summary.confidence}`);
  logger.log(`[research-report] materiality=${summary.materialityLevel} metric="${summary.materialityMetric}" rejected=${summary.rejectedClaims} unverified=${summary.unverifiedClaims} checks=${JSON.stringify(summary.checks)}`);
  if (logger.level === 'verbose' || logger.level === 'debug') {
    for (const claim of report.rejectedClaims) logger.log(`[research-report] rejected: ${claim.text}${claim.reason ? ` — ${claim.reason}` : ''}`);
    for (const claim of report.unverifiedClaims) logger.log(`[research-report] unverified: ${claim.text}${claim.reason ? ` — ${claim.reason}` : ''}`);
    for (const check of report.researchChecks.filter((c) => c.status === 'pending' || c.status === 'partial')) {
      logger.log(`[research-report] ${check.status}: ${check.check} — ${check.result}`);
    }
  }
}

export function buildResearchPriorityInput(signal: NormalizedSignal, marketCap?: number | null): ResearchPriorityInput {
  const largestAmount = Math.max(0, ...signal.amounts.map((amount) => amount.value || 0));
  const amountScore =
    largestAmount >= 100_000_000 ? 95 :
    largestAmount >= 25_000_000 ? 80 :
    largestAmount >= 5_000_000 ? 65 :
    largestAmount > 0 ? 45 :
    20;

  const companyScaleScore =
    marketCap == null ? 50 :
    marketCap < 100_000_000 ? 90 :
    marketCap < 300_000_000 ? 82 :
    marketCap < 1_000_000_000 ? 70 :
    marketCap < 5_000_000_000 ? 50 :
    25;

  const text = `${signal.title} ${signal.rawText}`.toLowerCase();
  const unusualKeywordScore = [
    'sole source',
    'award',
    'clearance',
    'approval',
    'termination',
    'suspension',
    'patent assignment',
    'strategic alternative',
    'material definitive agreement',
  ].some((term) => text.includes(term)) ? 80 : 35;

  const sourceQuality = clamp(signal.sourceQuality);
  const recency = daysSince(signal.publishedAt);
  const recencyScore = recency <= 1 ? 95 : recency <= 3 ? 85 : recency <= 7 ? 70 : recency <= 30 ? 45 : 20;
  const eventTypeScore = MATERIAL_EVENT_TYPES.has(String(signal.eventType)) ? 85 : 45;
  const indirectRelationshipScore = signal.entities.length > 1 ? 70 : 35;
  const newRelationshipScore = signal.entities.some((entity) => (entity.confidence ?? 1) < 0.75) ? 75 : 45;
  const apparentMagnitudeScore = marketCap && largestAmount ? clamp((largestAmount / marketCap) * 250) : amountScore;

  return {
    dollarAmountScore: amountScore,
    companyScaleScore,
    eventTypeScore,
    sourceQuality,
    unusualKeywordScore,
    indirectRelationshipScore,
    newRelationshipScore,
    recencyScore,
    apparentMagnitudeScore,
  };
}

export function defaultResearchQuestions(signal: NormalizedSignal): string[] {
  return [
    'What exactly changed in the public record?',
    'Which listed companies are economically exposed?',
    'How direct is the company relationship to the signal?',
    'What is the measurable financial magnitude?',
    'Has management already disclosed or promoted this event?',
    'Has major financial media or analyst coverage discussed this exact catalyst?',
    'Did price or volume already react abnormally?',
    'What evidence weakens or invalidates the thesis?',
  ];
}

function normalizedEntityKey(entities: unknown) {
  if (!Array.isArray(entities)) return null;
  const company = entities.find((entity: any) => entity?.type === 'company') || entities[0];
  if (!company) return null;
  return String(company?.identifiers?.cik || company?.identifiers?.ticker || company?.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Two events are the "same" catalyst only if they are close in time. Without
 * this guard, a 1993 NASA contract and a 2019 NASA contract to the same
 * recipient are merged into one cluster (both share the company entity key),
 * producing a nonsensical multi-decade "opportunity". Signals further apart
 * than CLUSTER_MERGE_WINDOW_MS are treated as distinct events.
 */
const CLUSTER_MERGE_WINDOW_MS = 180 * 86400000; // 180 days

function eventsAreContemporaneous(a: Date, b: Date): boolean {
  const diff = Math.abs(a.getTime() - b.getTime());
  return diff <= CLUSTER_MERGE_WINDOW_MS;
}

export async function storeNormalizedSignal(sourceId: string, signal: NormalizedSignal, documentId?: string) {
  const priority = calculateResearchPriority(buildResearchPriorityInput(signal));

  return prisma.signal.upsert({
    where: {
      sourceId_externalId: {
        sourceId,
        externalId: signal.externalId || signal.sourceUrl,
      },
    },
    update: {
      title: signal.title,
      rawText: signal.rawText,
      entities: signal.entities as any,
      eventType: signal.eventType,
      amounts: signal.amounts as any,
      dates: signal.dates as any,
      locations: signal.locations as any,
      sourceQuality: signal.sourceQuality,
      rawMetadata: signal.rawMetadata as any,
      triageScore: priority.value,
      triageFactors: priority.factors as any,
      triagedAt: new Date(),
      documentId,
    },
    create: {
      sourceId,
      documentId,
      sourceType: signal.sourceType,
      externalId: signal.externalId || signal.sourceUrl,
      publishedAt: signal.publishedAt,
      retrievedAt: signal.retrievedAt,
      title: signal.title,
      rawText: signal.rawText,
      entities: signal.entities as any,
      eventType: signal.eventType,
      amounts: signal.amounts as any,
      dates: signal.dates as any,
      locations: signal.locations as any,
      sourceUrl: signal.sourceUrl,
      sourceQuality: signal.sourceQuality,
      rawMetadata: signal.rawMetadata as any,
      triageScore: priority.value,
      triageFactors: priority.factors as any,
      triagedAt: new Date(),
    },
  });
}

export async function createCatalystClusterFromSignal(signalId: string) {
  const signal = await prisma.signal.findUnique({ where: { id: signalId } });
  if (!signal) throw new Error(`Signal ${signalId} not found`);

  const entityKey = normalizedEntityKey(signal.entities);

  // ── Tier 0: same source record ──
  // The same underlying record (same NCT, accession number, or award ID) is the
  // SAME catalyst regardless of how its eventType changed between harvests
  // (e.g. a trial's `clinical_trial_update` → `clinical_trial_result`, or an
  // award amendment). Consolidate by externalId first so a re-harvested record
  // merges into its existing cluster instead of spawning a duplicate.
  const externalId = signal.externalId || null;
  if (externalId) {
    const byRecord = await prisma.catalystCluster.findFirst({
      where: { signals: { some: { signal: { externalId } } } },
      include: { signals: { include: { signal: true } } },
      orderBy: { firstSeenAt: 'desc' },
    });
    if (byRecord) {
      await prisma.catalystClusterSignal.upsert({
        where: { clusterId_signalId: { clusterId: byRecord.id, signalId } },
        update: { role: 'corroborating', confidence: 0.85 },
        create: { clusterId: byRecord.id, signalId, role: 'corroborating', confidence: 0.85 },
      });
      await prisma.catalystCluster.update({
        where: { id: byRecord.id },
        data: {
          priorityScore: Math.max(byRecord.priorityScore || 0, signal.triageScore || 0),
          status: byRecord.status === 'rejected' ? 'triaged' : byRecord.status,
        },
      });
      return byRecord;
    }
  }

  const candidates = await prisma.catalystCluster.findMany({
    where: {
      clusterType: signal.eventType || signal.sourceType,
      firstSeenAt: { gte: new Date(signal.publishedAt.getTime() - 30 * 86400000) },
    },
    include: { signals: { include: { signal: true } } },
    orderBy: { firstSeenAt: 'desc' },
    take: 25,
  });
  const existing = entityKey
    ? candidates.find((cluster) => cluster.signals.some(({ signal: linked }) =>
        normalizedEntityKey(linked.entities) === entityKey &&
        eventsAreContemporaneous(linked.publishedAt, signal.publishedAt)
      ))
    : null;

  if (existing) {
    await prisma.catalystClusterSignal.upsert({
      where: { clusterId_signalId: { clusterId: existing.id, signalId } },
      update: { role: 'corroborating', confidence: 0.85 },
      create: { clusterId: existing.id, signalId, role: 'corroborating', confidence: 0.85 },
    });
    await prisma.catalystCluster.update({
      where: { id: existing.id },
      data: {
        priorityScore: Math.max(existing.priorityScore || 0, signal.triageScore || 0),
        status: existing.status === 'rejected' ? 'triaged' : existing.status,
      },
    });
    return existing;
  }

  const cluster = await prisma.catalystCluster.create({
    data: {
      title: signal.title,
      thesis: null,
      clusterType: signal.eventType || signal.sourceType,
      status: 'triaged',
      priorityScore: signal.triageScore,
      priorityFactors: signal.triageFactors || {},
      researchQuestions: defaultResearchQuestions({
        source: 'other',
        sourceType: signal.sourceType,
        publishedAt: signal.publishedAt,
        retrievedAt: signal.retrievedAt,
        title: signal.title,
        rawText: signal.rawText || '',
        entities: signal.entities as any,
        eventType: signal.eventType || undefined,
        amounts: signal.amounts as any,
        dates: signal.dates as any,
        locations: signal.locations as any,
        sourceUrl: signal.sourceUrl,
        sourceQuality: signal.sourceQuality || 50,
        rawMetadata: signal.rawMetadata as Record<string, unknown>,
      }) as any,
    },
  });

  await prisma.catalystClusterSignal.create({
    data: {
      clusterId: cluster.id,
      signalId,
      role: 'primary',
      confidence: 1,
    },
  });

  return cluster;
}

export function classifyQualification(input: QualificationGateInput) {
  return qualifyOpportunity(input);
}

export async function triageUnclusteredSignals(limit = 100, minPriority = 55, logger?: EngineLogger) {
  // ── Source-normalized triage ──
  // The candidate pool must be drawn PER source family, not from a single
  // globally-fresh `take limit*4` slice. A global recency sort lets the most
  // recently harvested family (often SEC) fill the entire pool before any
  // other family is even loaded — so regulatory/contracts signals never reach
  // the round-robin. We fetch up to `limit` eligible signals PER family (each
  // ordered fresh-first internally), then round-robin across families. Every
  // family is guaranteed representation in the pool; within a family, recency
  // and triage score still order the candidates.
  const families = ['sec', 'contracts', 'regulatory', 'patents', 'corporate', 'other'];
  const buckets: Array<{ family: string; signals: Awaited<ReturnType<typeof prisma.signal.findMany>> }> = [];

  for (const family of families) {
    const familySignals = await prisma.signal.findMany({
      where: {
        triageScore: { gte: minPriority },
        clusterSignals: { none: {} },
        sourceType: { in: sourceTypesForFamily(family) },
      },
      orderBy: [{ retrievedAt: 'desc' }, { triageScore: 'desc' }],
      take: limit,
    });
    if (familySignals.length > 0) buckets.push({ family, signals: familySignals });
  }

  const signals: typeof buckets[number]['signals'] = [];
  let advanced = true;
  while (signals.length < limit && advanced) {
    advanced = false;
    for (const bucket of buckets) {
      if (signals.length >= limit) break;
      const next = bucket.signals.shift();
      if (next) {
        signals.push(next);
        advanced = true;
      }
    }
  }

  const pool = signals;

  // Log why each signal was selected (age, source, score) for auditability.
  if (logger) {
    for (const signal of signals) {
      const ageHours = Math.round((Date.now() - signal.retrievedAt.getTime()) / 3600_000);
      const family = sourceFamily(signal.sourceType || '');
      logger.log(`[triage] signal=${signal.id} source=${signal.sourceType} family=${family} score=${signal.triageScore} retrievedAgeHours=${ageHours} title="${String(signal.title || '').slice(0, 60)}"`);
    }
    const families = [...new Set(signals.map((s) => sourceFamily(s.sourceType || '')))];
    logger.log(`[triage] selected ${signals.length} unclustered signals across families=[${families.join(', ')}]`);
  }

  const clusters = [];
  for (const signal of signals) {
    clusters.push(await createCatalystClusterFromSignal(signal.id));
  }
  return { signals: signals.length, clusters: clusters.length };
}

export async function evaluateClusterForOpportunity(clusterId: string, options?: {
  logLevel?: EngineLogLevel;
}) {
  const logger = createLogger(options?.logLevel);
  const cluster = await prisma.catalystCluster.findUnique({
    where: { id: clusterId },
    include: { signals: { include: { signal: true } } },
  });
  if (!cluster) throw new Error(`Cluster ${clusterId} not found`);

  const primary = cluster.signals[0]?.signal;
  const signalEntities = cluster.signals.flatMap(({ signal }) => Array.isArray(signal.entities) ? signal.entities as any[] : []);
  const cik = signalEntities.map((entity) => entity?.identifiers?.cik).find(Boolean);
  const ticker = signalEntities.map((entity) => entity?.identifiers?.ticker).find(Boolean);
  const companyName = signalEntities.find((entity) => entity?.type === 'company')?.name;

  // ── Entity resolution: ticker → cik → exact name → normalized name ──
  let security = null;
  if (ticker) {
    security = await prisma.security.findFirst({
      where: { ticker: String(ticker).toUpperCase(), active: true },
      include: { company: true },
    });
  }
  if (!security && cik) {
    security = await prisma.security.findFirst({
      where: { company: { cik: String(cik).padStart(10, '0') }, active: true },
      include: { company: true },
    });
  }
  if (!security && companyName) {
    // Exact-ish match on displayName or legalName
    security = await prisma.security.findFirst({
      where: {
        active: true,
        company: {
          OR: [
            { displayName: { equals: String(companyName), mode: 'insensitive' } },
            { legalName: { equals: String(companyName), mode: 'insensitive' } },
          ],
        },
      },
      include: { company: true },
    });
  }
  if (!security && companyName) {
    // Normalized-stem match against displayName / legalName.
    const stem = normalizeCompanyName(companyName);
    if (stem) {
      const candidates = await prisma.security.findMany({
        where: { active: true },
        select: { id: true, ticker: true, company: { select: { displayName: true, legalName: true } } },
      });
      let matched: (typeof candidates)[number] | undefined;
      let matchKind: 'exact' | 'subsidiary' = 'exact';
      // Tier 1: exact normalized-stem match.
      matched = candidates.find((candidate) =>
        normalizeCompanyName(candidate.company.displayName) === stem ||
        normalizeCompanyName(candidate.company.legalName) === stem
      );
      // Tier 2: subsidiary/prefix match — one stem is a prefix of the other,
      // e.g. "BAE Systems Space & Mission Systems Inc" → "BAE Systems PLC".
      // Requires a >=6-char shared prefix to avoid false positives.
      if (!matched && stem.length >= 6) {
        matched = candidates.find((candidate) => {
          const cs = normalizeCompanyName(candidate.company.displayName) ||
            normalizeCompanyName(candidate.company.legalName);
          if (!cs) return false;
          const shorter = cs.length < stem.length ? cs : stem;
          return shorter.length >= 6 && (stem.startsWith(cs) || cs.startsWith(stem));
        });
        if (matched) matchKind = 'subsidiary';
      }
      if (matched) {
        security = await prisma.security.findFirst({
          where: { id: matched.id, active: true },
          include: { company: true },
        });
        logger.log(`[research] cluster=${clusterId} entity_resolved=${String(companyName)} → ${matched.ticker} via ${matchKind === 'exact' ? 'normalized name' : 'subsidiary name'}`);
      }
    }
  }
  const securityAttributes = jsonObject(security?.attributes);
  // Financial denominators (revenue/cash/assets/shares) drive materiality.
  // Enrich on demand from FMP when they are missing, and cache the result
  // back into security.attributes so later passes don't re-fetch.
  let revenue = Number(securityAttributes.revenue || 0) || null;
  let cash = Number(securityAttributes.cash || 0) || null;
  let assets = Number(securityAttributes.assets || 0) || null;
  let currentShares = Number(securityAttributes.currentShares || 0) || null;
  let enterpriseValue = Number(securityAttributes.enterpriseValue || 0) || null;

  if (security && revenue == null && cash == null && assets == null && currentShares == null) {
    const enriched = await enrichFinancialDenominators(security);
    if (enriched.revenue != null || enriched.cash != null || enriched.assets != null || enriched.currentShares != null) {
      revenue = enriched.revenue;
      cash = enriched.cash;
      assets = enriched.assets;
      currentShares = enriched.currentShares;
      enterpriseValue = enriched.enterpriseValue;
      logger.log(`[research] cluster=${clusterId} financials_enriched=${security.ticker} revenue=${revenue} cash=${cash} assets=${assets} ev=${enterpriseValue}`);
    }
  }
  if (security && enterpriseValue == null) enterpriseValue = security.marketCap ?? null;

  const companyContext: DeepResearchCompanyContext = {
    companyId: security?.companyId,
    securityId: security?.id,
    companyName: security?.company.displayName || companyName,
    ticker: security?.ticker || ticker,
    cik: security?.company.cik || cik,
    sector: security?.company.sector,
    marketCap: security?.marketCap,
    revenue,
    cash,
    assets,
    enterpriseValue,
    currentShares,
  };
  const registry = createDefaultResearchRegistry();
  const deepResults = await registry.run({
    clusterId,
    title: cluster.title,
    clusterType: cluster.clusterType,
    thesis: cluster.thesis,
    company: companyContext,
    signals: cluster.signals.map(({ signal }) => ({
      id: signal.id,
      title: signal.title,
      sourceType: signal.sourceType,
      sourceUrl: signal.sourceUrl,
      publishedAt: signal.publishedAt,
      rawText: signal.rawText,
      entities: signal.entities,
      amounts: signal.amounts,
      rawMetadata: signal.rawMetadata,
      sourceQuality: signal.sourceQuality,
    })),
    log(message, detail) {
      if (logger.level === 'verbose' || logger.level === 'debug') logger.log(`[research] cluster=${clusterId} ${message} ${JSON.stringify(detail || {})}`);
    },
  });
  const deepResearch = mergeDeepResearch(deepResults);
  if (!deepResults.length) logger.log(`[research] cluster=${clusterId} skipped reason=no_registered_researcher`);

  const largestAmount = Math.max(0,
    ...cluster.signals.flatMap(({ signal }) => (Array.isArray(signal.amounts) ? signal.amounts as Array<{ value?: number }> : [])).map((amount) => Number(amount.value || 0)),
    ...deepResearch.amounts.map((amount) => amount.value),
  ) || null;
  const materiality = computeMateriality({
    eventType: cluster.clusterType,
    amount: largestAmount,
    revenue: companyContext.revenue,
    cash: companyContext.cash,
    assets: companyContext.assets,
    enterpriseValue: companyContext.enterpriseValue,
    currentShares: companyContext.currentShares,
    eventDate: primary?.publishedAt ?? null,
  });
  const adversarial = runDeterministicAdversarialCheck({
    eventType: cluster.clusterType,
    title: cluster.title,
    thesis: deepResearch.thesis || cluster.thesis,
    materialityRatio: materiality.ratio,
    evidenceQuality: primary?.sourceQuality || 50,
    relationshipConfidence: deepResearch.relationshipConfidence,
    priceReactionScore: 50,
  });

  // ── Attention + event-window price reaction (best-effort, cached) ──
  let attentionProfile = jsonObject(cluster.attentionJson) as any;
  let priceReaction = jsonObject(cluster.priceReactionJson) as any;
  if (security && !attentionProfile?.attentionScore) {
    try {
      const keywords = extractKeywords(cluster.title, companyContext.companyName);
      attentionProfile = await measureAttention(security.ticker, process.env.FMP_API_KEY, security.marketCap, keywords);
      logger.log(`[research] cluster=${clusterId} attention=${attentionProfile.attentionScore} measured=${attentionProfile.measured} pressRelease=${attentionProfile.pressRelease?.found} news=${attentionProfile.news?.count} source=${attentionProfile.source}`);
    } catch {
      attentionProfile = null;
    }
  }
  if (security && !priceReaction?.eventDate) {
    try {
      const eventDate = primary?.publishedAt ?? cluster.firstSeenAt ?? new Date();
      priceReaction = await fetchPriceReaction(security.ticker, new Date(eventDate));
      logger.log(`[research] cluster=${clusterId} price_reaction=${priceReaction?.marketReaction ?? 'unavailable'} measured=${priceReaction?.measured ?? false}`);
    } catch {
      priceReaction = null;
    }
  }

  const researchReport = buildResearchReport({
    title: cluster.title,
    eventType: cluster.clusterType,
    thesis: deepResearch.thesis || cluster.thesis,
    materiality,
    adversarial,
    priceReactionAvailable: !!priceReaction,
    priceReactionMeasured: !!priceReaction?.measured,
    attentionAvailable: !!attentionProfile,
    attentionMeasured: !!attentionProfile?.measured,
    relationshipConfidence: deepResearch.relationshipConfidence,
    deepResearch: {
      ...deepResearch,
      direction: deepResearch.direction,
      isRoutine: deepResearch.isRoutine,
    },
    signals: cluster.signals.map(({ signal }) => ({
      title: signal.title,
      sourceType: signal.sourceType,
      sourceUrl: signal.sourceUrl,
      publishedAt: signal.publishedAt,
      rawText: signal.rawText,
      entities: signal.entities,
      amounts: signal.amounts,
      sourceQuality: signal.sourceQuality,
    })),
  });
  const completeness = Math.max(25, Math.min(100,
    researchReport.completeness
  ));
  const qualification = qualifyOpportunity({
    primaryEvidenceExists: !!primary,
    hiddenAngleExists: !!cluster.thesis || !!primary?.title,
    relationshipConfidence: deepResearch.relationshipConfidence,
    materialityScore: materiality.level === 'UNKNOWN' ? 40 : materiality.level === 'IMMATERIAL' ? 10 : materiality.level === 'LOW' ? 35 : materiality.level === 'MODERATE' ? 60 : 85,
    liquidityAcceptable: true,
    dataFreshnessScore: primary ? 80 : 30,
    fatalContradiction: adversarial.fatalContradiction,
    evidenceQuality: primary?.sourceQuality || 50,
    researchCompleteness: completeness,
  });
  const finalStatus = researchReport.thesisStatus === 'reject'
    ? 'rejected'
    : researchReport.thesisStatus === 'watch'
      ? 'triaged'
      : researchReport.thesisStatus === 'verified'
        ? 'qualified'
        : qualification.status === 'reject'
          ? 'rejected'
          : qualification.status === 'watch'
            ? 'triaged'
            : 'qualified';
  const evaluationLog = summarizeEvaluation({
    clusterId,
    title: cluster.title,
    signalCount: cluster.signals.length,
    finalStatus,
    materiality,
    researchReport,
  });
  logEvaluation(evaluationLog, researchReport, logger);

  // ── Upgrade detection ──
  // Record when a re-evaluation meaningfully improves the thesis (e.g. price
  // reaction flips proxy→measured, or watch→candidate→verified). This is the
  // "the market had a chance to react, and it's still underfollowed" moment.
  const prevReport = jsonObject(cluster.structuredAttributes);
  const prevThesis = (prevReport.researchReport as any)?.thesisStatus ?? null;
  const prevPriceMeasured = !!(jsonObject(cluster.priceReactionJson) as any)?.measured;
  const thesisRank: Record<string, number> = { reject: 0, watch: 1, candidate: 2, verified: 3 };
  const priceNowMeasured = !!(priceReaction as any)?.measured;
  const upgradedThesis = prevThesis != null && (thesisRank[researchReport.thesisStatus] ?? 0) > (thesisRank[prevThesis] ?? 0);
  const upgradedPrice = !prevPriceMeasured && priceNowMeasured;
  const lastUpgrade = (upgradedThesis || upgradedPrice)
    ? {
        at: new Date().toISOString(),
        from: { thesis: prevThesis, priceMeasured: prevPriceMeasured },
        to: { thesis: researchReport.thesisStatus, priceMeasured: priceNowMeasured },
      }
    : (prevReport.lastUpgrade ?? null);
  if (upgradedThesis || upgradedPrice) {
    logger.log(`[upgrade] cluster=${clusterId} thesis=${prevThesis ?? 'none'}→${researchReport.thesisStatus} priceMeasured=${prevPriceMeasured}→${priceNowMeasured}`);
  }

  await prisma.catalystCluster.update({
    where: { id: clusterId },
    data: {
      status: finalStatus,
      materialityJson: materiality as any,
      adversarialJson: adversarial as any,
      ...(attentionProfile ? { attentionJson: attentionProfile as any } : {}),
      ...(priceReaction ? { priceReactionJson: priceReaction as any } : {}),
      structuredAttributes: {
        ...jsonObject(cluster.structuredAttributes),
        researchReport,
        deepResearch,
        ...(lastUpgrade ? { lastUpgrade } : {}),
      } as any,
      researchCompleteness: completeness,
      researchConfidence: researchReport.confidence,
      lastEvaluatedAt: new Date(),
    },
  });

  if (security) {
    const opportunityStatus = researchReport.thesisStatus === 'reject'
      ? 'rejected'
      : researchReport.thesisStatus === 'verified'
        ? 'published'
        : 'candidate';
    // Map engine thesis status ('reject') to the DB's user-facing value
    // ('rejected') — the verification_status column only allows 'rejected'.
    const verificationStatus = researchReport.thesisStatus === 'reject' ? 'rejected' : researchReport.thesisStatus;
    const existing = await prisma.opportunity.findFirst({ where: { clusterId, securityId: security.id } });
    const data = {
      securityId: security.id,
      clusterId,
      title: cluster.title,
      summary: researchReport.summary,
      status: opportunityStatus,
      verificationStatus,
      confidence: researchReport.confidence,
      researchCompleteness: researchReport.completeness,
      engineVersion: 'source-agnostic-v2',
      lastResearchedAt: new Date(),
      publishedAt: opportunityStatus === 'published' ? new Date() : null,
    };
    if (existing) await prisma.opportunity.update({ where: { id: existing.id }, data });
    else await prisma.opportunity.create({ data });
    logger.log(`[persist] cluster=${clusterId} opportunity=${existing?.id || 'created'} status=${opportunityStatus} verification=${researchReport.thesisStatus}`);
  } else {
    // ── Close stale opportunities on reject even when security is unresolved ──
    // Entity re-resolution can fail on a re-evaluation (e.g. a fuzzy-matched
    // company name that no longer resolves), which would otherwise leave a stale
    // "watch"/"candidate" opportunity pointing at a now-rejected cluster. On a
    // reject verdict, close any orphaned opportunity for this cluster so the
    // feed and the cluster status never diverge.
    if (researchReport.thesisStatus === 'reject') {
      const stale = await prisma.opportunity.findMany({ where: { clusterId, verificationStatus: { in: ['watch', 'candidate', 'verified'] } } });
      for (const opp of stale) {
        await prisma.opportunity.update({
          where: { id: opp.id },
          data: { status: 'rejected', verificationStatus: 'rejected', lastResearchedAt: new Date(), publishedAt: null },
        });
      }
      if (stale.length) logger.log(`[persist] cluster=${clusterId} closedStaleOpportunities=${stale.length} reason=unresolved_public_security_reject`);
      else logger.log(`[persist] cluster=${clusterId} opportunity=skipped reason=unresolved_public_security`);
    } else {
      logger.log(`[persist] cluster=${clusterId} opportunity=skipped reason=unresolved_public_security`);
    }
  }

  return { clusterId, materiality, adversarial, qualification, researchReport, deepResearch, completeness, log: evaluationLog };
}

export async function runSourceAgnosticIntelligencePass(params?: {
  signalLimit?: number;
  minPriority?: number;
  logLevel?: EngineLogLevel;
  evalFreshnessHours?: number;
  deepResearchTopN?: number;
}) {
  const logger = createLogger(params?.logLevel);
  logger.log(`[engine] source-agnostic pass start signalLimit=${params?.signalLimit ?? 100} minPriority=${params?.minPriority ?? 55}`);
  const triage = await triageUnclusteredSignals(params?.signalLimit ?? 100, params?.minPriority ?? 55, logger);
  logger.log(`[engine] triage unclusteredSignals=${triage.signals} clustersCreated=${triage.clusters}`);

  // ── Scheduling: skip clusters already evaluated within the freshness window ──
  // unless they have attached signals newer than their last evaluation. This
  // prevents re-running expensive deep research over unchanged clusters on
  // every pass, and prioritizes never-evaluated + stale clusters.
  const freshnessHours = params?.evalFreshnessHours ?? 12;
  const staleBefore = new Date(Date.now() - freshnessHours * 3600_000);

  const clusterLimit = params?.signalLimit ?? 100;
  // Fetch a larger candidate pool than the budget so diversity filtering has
  // enough material to round-robin across source families.
  const candidates = await prisma.catalystCluster.findMany({
    where: {
      status: { in: ['open', 'triaged'] },
      OR: [
        { lastEvaluatedAt: null },
        { lastEvaluatedAt: { lt: staleBefore } },
        { signals: { some: { signal: { retrievedAt: { gt: staleBefore } } } } },
      ],
    },
    include: { signals: { include: { signal: true } } },
    orderBy: [
      { lastEvaluatedAt: { sort: 'asc', nulls: 'first' } },
      { firstSeenAt: 'desc' },
    ],
    take: clusterLimit * 4,
  });

  // ── Source-family diversity: round-robin across families so no single
  // source (e.g. regulatory/clinical) monopolizes the budget. Within each
  // family, preserve the scheduling order (never-evaluated first, then stale).
  const buckets = new Map<string, typeof candidates>();
  for (const cluster of candidates) {
    const family = sourceFamily(cluster.clusterType || '');
    const bucket = buckets.get(family) || [];
    bucket.push(cluster);
    buckets.set(family, bucket);
  }
  const familySizes = [...buckets.entries()].map(([family, bucket]) => `${family}:${bucket.length}`).join(', ');
  const clusters = [];
  const entries = [...buckets.entries()];
  let progress = true;
  while (clusters.length < clusterLimit && progress) {
    progress = false;
    for (const [, bucket] of entries) {
      if (clusters.length >= clusterLimit) break;
      if (bucket.length > 0) {
        clusters.push(bucket.shift()!);
        progress = true;
      }
    }
  }
  logger.log(`[scheduling] candidates=${candidates.length} selected=${clusters.length} families=[${familySizes}]`);

  // ── AI budget: deep-research the top-N by normalized discovery value ──
  // Deep research is the expensive step (LLM), bounded to deepResearchTopN.
  // Signals COMPETE on a source-normalized "expected discovery value" (not on
  // per-source quotas): a tiny underfollowed biotech with a phase change should
  // outrank a stack of boring 10-Qs. The score is deliberately source-agnostic —
  // it rewards materiality potential, information asymmetry (underfollowed-ness),
  // and specificity regardless of which source produced the signal. A light
  // diversity floor ensures no family with eligible candidates is entirely
  // excluded, but beyond that it is pure value competition.
  const deepTopN = params?.deepResearchTopN ?? 20;
  const deferred: typeof clusters = [];
  let toEvaluate: typeof clusters = clusters;
  if (clusters.length > deepTopN) {
    const byFamily = new Map<string, typeof clusters>();
    for (const cluster of clusters) {
      const family = sourceFamily(cluster.clusterType || '');
      const bucket = byFamily.get(family) || [];
      bucket.push(cluster);
      byFamily.set(family, bucket);
    }
    for (const bucket of byFamily.values()) {
      bucket.sort((a, b) => clusterDiscoveryValue(b) - clusterDiscoveryValue(a));
    }
    // 1) Diversity floor: take the top cluster from each family (if present).
    toEvaluate = [];
    for (const [, bucket] of byFamily) {
      const top = bucket.shift();
      if (top) toEvaluate.push(top);
    }
    // 2) Value competition for the remaining slots across all families.
    const remainingBuckets = [...byFamily.values()];
    const rest = remainingBuckets.flat().sort((a, b) => clusterDiscoveryValue(b) - clusterDiscoveryValue(a));
    for (const cluster of rest) {
      if (toEvaluate.length >= deepTopN) break;
      toEvaluate.push(cluster);
    }
    const evaluatedSet = new Set(toEvaluate);
    deferred.push(...remainingBuckets.flat().filter((c) => !evaluatedSet.has(c)));
    const kept = [...new Set(toEvaluate.map((c) => sourceFamily(c.clusterType || '')))].join(', ');
    logger.log(`[budget] deepResearchTopN=${deepTopN} evaluated=${toEvaluate.length} deferred=${deferred.length} families=[${kept}] (normalized discovery value)`);
  }

  const skippedFresh = await prisma.catalystCluster.count({
    where: {
      status: { in: ['open', 'triaged'] },
      lastEvaluatedAt: { gte: staleBefore },
      signals: { none: { signal: { retrievedAt: { gt: staleBefore } } } },
    },
  });

  logger.log(`[engine] evaluating clusters=${toEvaluate.length} skippedFresh=${skippedFresh} deferred=${deferred.length}`);

  const evaluated = [];
  const logs: ResearchEvaluationLog[] = [];
  for (const cluster of toEvaluate) {
    const result = await evaluateClusterForOpportunity(cluster.id, { logLevel: params?.logLevel });
    evaluated.push(result);
    logs.push(result.log);
  }

  logger.log(`[engine] pass complete evaluated=${evaluated.length} deferred=${deferred.length} skippedFresh=${skippedFresh}`);

  // ── Per-source funnel report ──
  // For every source family, report the whole funnel so a reviewer can see
  // WHERE signals are lost: harvested → eligible (≥ minPriority) → triaged →
  // scheduled → researched → qualified vs rejected. This turns "ClinicalTrials
  // produced 56 docs but 0 reached research" from a mystery into an auditable
  // number per stage.
  const harvested = await prisma.signal.findMany({
    where: { retrievedAt: { gte: new Date(Date.now() - 48 * 3600_000) } },
    select: { sourceType: true, triageScore: true },
  });
  const minPri = params?.minPriority ?? 55;
  const famStats = new Map<string, { harvested: number; eligible: number }>();
  for (const s of harvested) {
    const fam = sourceFamily(s.sourceType || '');
    const entry = famStats.get(fam) || { harvested: 0, eligible: 0 };
    entry.harvested++;
    if ((s.triageScore ?? 0) >= minPri) entry.eligible++;
    famStats.set(fam, entry);
  }
  const triagedMap = new Map<string, number>();
  for (const c of clusters) {
    for (const cs of c.signals) {
      const fam = sourceFamily(cs.signal.sourceType || '');
      triagedMap.set(fam, (triagedMap.get(fam) || 0) + 1);
    }
  }
  const scheduledMap = new Map<string, number>();
  for (const c of clusters) {
    const fam = sourceFamily(c.clusterType || '');
    scheduledMap.set(fam, (scheduledMap.get(fam) || 0) + 1);
  }
  const researchedMap = new Map<string, number>();
  for (const c of toEvaluate) {
    const fam = sourceFamily(c.clusterType || '');
    researchedMap.set(fam, (researchedMap.get(fam) || 0) + 1);
  }
  for (const fam of [...famStats.keys()].sort()) {
    const st = famStats.get(fam)!;
    logger.log(`[funnel] family=${fam} harvested48h=${st.harvested} eligible(>=${minPri})=${st.eligible} triaged=${triagedMap.get(fam) || 0} scheduled=${scheduledMap.get(fam) || 0} researched=${researchedMap.get(fam) || 0}`);
  }

  return { triage, evaluated: evaluated.length, deferred: deferred.length, skippedFresh, logs };
}

/**
 * A cluster's ignored score — the max ignoredScore across its linked signals.
 * SEC-filing signals carry this on rawMetadata.ignoredScore (set by the
 * connector). Other source families default to 0 (no ignored signal), so SEC
 * discoveries with real ignored data rank above un-scored families.
 */
function clusterIgnoredScore(cluster: { signals: Array<{ signal: { rawMetadata?: unknown } }> }): number {
  let best = 0;
  for (const { signal } of cluster.signals) {
    const meta = signal.rawMetadata as Record<string, unknown> | null | undefined;
    const score = Number(meta?.ignoredScore);
    if (Number.isFinite(score) && score > best) best = score;
  }
  return best;
}

/**
 * Source-normalized "expected discovery value" for a cluster.
 *
 * This is the cross-source ranking key for the deep-research budget. It is
 * deliberately source-agnostic: a cluster from any family is scored on the same
 * dimensions, so signals COMPETE on value rather than being assigned quotas.
 * The dimensions (each 0..1, weighted) are:
 *
 *   - materialityPotential : does the cluster carry a dollar amount? (bigger →
 *     more likely a financially meaningful event). Source-agnostic — a contract
 *     award and an SEC 8-K both carry amounts; a bare clinical trial does not.
 *   - asymmetry            : underfollowed-ness (ignored score), the core
 *     "hidden catalyst" thesis. High = genuinely under the market's radar.
 *   - specificity          : how specific the event type is (a concrete
 *     `contract_award` / `clinical_trial_result` / `8-K` beats a generic
 *     `public_signal`). Rewards mechanism specificity.
 *   - recency              : fresher signals are worth more (staleness penalty).
 *
 * No single dimension dominates, and no source is inherently favored: a tiny
 * underfollowed biotech with a phase change can outrank a stack of routine
 * 10-Qs, which is exactly the point of the product thesis.
 */
function clusterDiscoveryValue(cluster: { clusterType?: string | null; firstSeenAt?: Date | null; signals: Array<{ signal: { rawMetadata?: unknown; amounts?: unknown; publishedAt?: Date | null } }> }): number {
  // 1. Materiality potential: largest dollar amount across linked signals (log-scaled).
  let maxAmount = 0;
  for (const { signal } of cluster.signals) {
    const amounts = Array.isArray(signal.amounts) ? signal.amounts as Array<{ value?: number | null }> : [];
    for (const a of amounts) {
      const v = Number(a?.value || 0);
      if (v > maxAmount) maxAmount = v;
    }
  }
  // log10 scale: $0 → 0, $10K → 0.25, $1M → 0.5, $100M → 0.75, $1B+ → 1.0
  const materialityPotential = maxAmount <= 0 ? 0 : Math.min(1, Math.log10(maxAmount) / 9);

  // 2. Information asymmetry (underfollowed-ness), 0..100 → 0..1.
  const asymmetry = clusterIgnoredScore(cluster) / 100;

  // 3. Mechanism specificity: concrete event types score higher than generic.
  const t = String(cluster.clusterType || '').toLowerCase();
  let specificity = 0.3; // generic fallback
  if (/contract_award|contract_modification|clinical_trial_result|regulatory_approval|patent_grant|merger_acquisition|acquisition|material_agreement/.test(t)) specificity = 1.0;
  else if (/8-?k|10-?k|10-?q|s-?1|13d|13g|clinical_trial_update|device_clearance|regulatory_decision|federal_contract/.test(t)) specificity = 0.75;
  else if (/clinical_trial|regulatory|fda|patent|contract|award|grant|merger|legal/.test(t)) specificity = 0.5;

  // 4. Recency: fresher is better (0..1).
  const ageDays = cluster.firstSeenAt
    ? Math.max(0, (Date.now() - cluster.firstSeenAt.getTime()) / 86400000)
    : 30;
  const recency = ageDays <= 1 ? 1 : ageDays <= 7 ? 0.85 : ageDays <= 30 ? 0.6 : ageDays <= 90 ? 0.35 : 0.15;

  // Weighted, source-normalized expected discovery value (0..1).
  return 0.35 * materialityPotential + 0.30 * asymmetry + 0.20 * specificity + 0.15 * recency;
}
