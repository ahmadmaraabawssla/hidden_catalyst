import { prisma } from '@hidden-catalyst/db';
import {
  calculateResearchPriority,
  qualifyOpportunity,
  type NormalizedSignal,
  type QualificationGateInput,
  type ResearchPriorityInput,
} from '@hidden-catalyst/domain';
import { computeMateriality, extractLargestAmount } from './materiality';
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
    ? candidates.find((cluster) => cluster.signals.some(({ signal: linked }) => normalizedEntityKey(linked.entities) === entityKey))
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

export async function triageUnclusteredSignals(limit = 100, minPriority = 55) {
  // Freshness-first: signals harvested most recently get clustered before old
  // lingering unclustered signals. This prevents prior runs' leftover signals
  // from monopolizing the triage budget ahead of this run's new harvest.
  const signals = await prisma.signal.findMany({
    where: {
      triageScore: { gte: minPriority },
      clusterSignals: { none: {} },
    },
    orderBy: [{ retrievedAt: 'desc' }, { triageScore: 'desc' }],
    take: limit,
  });

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
  const companyContext: DeepResearchCompanyContext = {
    companyId: security?.companyId,
    securityId: security?.id,
    companyName: security?.company.displayName || companyName,
    ticker: security?.ticker || ticker,
    cik: security?.company.cik || cik,
    sector: security?.company.sector,
    marketCap: security?.marketCap,
    revenue: Number(securityAttributes.revenue || 0) || null,
    cash: Number(securityAttributes.cash || 0) || null,
    assets: Number(securityAttributes.assets || 0) || null,
    enterpriseValue: Number(securityAttributes.enterpriseValue || 0) || security?.marketCap || null,
    currentShares: Number(securityAttributes.currentShares || 0) || null,
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
  const researchReport = buildResearchReport({
    title: cluster.title,
    eventType: cluster.clusterType,
    thesis: deepResearch.thesis || cluster.thesis,
    materiality,
    adversarial,
    priceReactionAvailable: !!cluster.priceReactionJson,
    attentionAvailable: !!cluster.attentionJson,
    relationshipConfidence: deepResearch.relationshipConfidence,
    deepResearch,
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
    materialityScore: materiality.level === 'UNKNOWN' ? 40 : materiality.level === 'LOW' ? 35 : materiality.level === 'MODERATE' ? 60 : 85,
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

  await prisma.catalystCluster.update({
    where: { id: clusterId },
    data: {
      status: finalStatus,
      materialityJson: materiality as any,
      adversarialJson: adversarial as any,
      structuredAttributes: {
        ...jsonObject(cluster.structuredAttributes),
        researchReport,
        deepResearch,
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
    const existing = await prisma.opportunity.findFirst({ where: { clusterId, securityId: security.id } });
    const data = {
      securityId: security.id,
      clusterId,
      title: cluster.title,
      summary: researchReport.summary,
      status: opportunityStatus,
      verificationStatus: researchReport.thesisStatus,
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
    logger.log(`[persist] cluster=${clusterId} opportunity=skipped reason=unresolved_public_security`);
  }

  return { clusterId, materiality, adversarial, qualification, researchReport, deepResearch, completeness, log: evaluationLog };
}

export async function runSourceAgnosticIntelligencePass(params?: {
  signalLimit?: number;
  minPriority?: number;
  logLevel?: EngineLogLevel;
  evalFreshnessHours?: number;
}) {
  const logger = createLogger(params?.logLevel);
  logger.log(`[engine] source-agnostic pass start signalLimit=${params?.signalLimit ?? 100} minPriority=${params?.minPriority ?? 55}`);
  const triage = await triageUnclusteredSignals(params?.signalLimit ?? 100, params?.minPriority ?? 55);
  logger.log(`[engine] triage unclusteredSignals=${triage.signals} clustersCreated=${triage.clusters}`);

  // ── Scheduling: skip clusters already evaluated within the freshness window ──
  // unless they have attached signals newer than their last evaluation. This
  // prevents re-running expensive deep research over unchanged clusters on
  // every pass, and prioritizes never-evaluated + stale clusters.
  const freshnessHours = params?.evalFreshnessHours ?? 12;
  const staleBefore = new Date(Date.now() - freshnessHours * 3600_000);

  const clusters = await prisma.catalystCluster.findMany({
    where: {
      status: { in: ['open', 'triaged'] },
      OR: [
        { lastEvaluatedAt: null },
        { lastEvaluatedAt: { lt: staleBefore } },
        { signals: { some: { signal: { retrievedAt: { gt: staleBefore } } } } },
      ],
    },
    orderBy: [
      { lastEvaluatedAt: { sort: 'asc', nulls: 'first' } },
      { firstSeenAt: 'desc' },
    ],
    take: params?.signalLimit ?? 100,
  });

  const skippedFresh = await prisma.catalystCluster.count({
    where: {
      status: { in: ['open', 'triaged'] },
      lastEvaluatedAt: { gte: staleBefore },
      signals: { none: { signal: { retrievedAt: { gt: staleBefore } } } },
    },
  });

  logger.log(`[engine] evaluating clusters=${clusters.length} skippedFresh=${skippedFresh}`);

  const evaluated = [];
  const logs: ResearchEvaluationLog[] = [];
  for (const cluster of clusters) {
    const result = await evaluateClusterForOpportunity(cluster.id, { logLevel: params?.logLevel });
    evaluated.push(result);
    logs.push(result.log);
  }

  logger.log(`[engine] pass complete evaluated=${evaluated.length} skippedFresh=${skippedFresh}`);
  return { triage, evaluated: evaluated.length, skippedFresh, logs };
}
