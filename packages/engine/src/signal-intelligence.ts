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
  const signals = await prisma.signal.findMany({
    where: {
      triageScore: { gte: minPriority },
      clusterSignals: { none: {} },
    },
    orderBy: [{ triageScore: 'desc' }, { publishedAt: 'desc' }],
    take: limit,
  });

  const clusters = [];
  for (const signal of signals) {
    clusters.push(await createCatalystClusterFromSignal(signal.id));
  }
  return { signals: signals.length, clusters: clusters.length };
}

export async function evaluateClusterForOpportunity(clusterId: string) {
  const cluster = await prisma.catalystCluster.findUnique({
    where: { id: clusterId },
    include: { signals: { include: { signal: true } } },
  });
  if (!cluster) throw new Error(`Cluster ${clusterId} not found`);

  const primary = cluster.signals[0]?.signal;
  const amounts = primary?.amounts as Array<{ value?: number }> | undefined;
  const largestAmount = extractLargestAmount(amounts);
  const materiality = computeMateriality({
    eventType: cluster.clusterType,
    amount: largestAmount,
  });
  const adversarial = runDeterministicAdversarialCheck({
    eventType: cluster.clusterType,
    title: cluster.title,
    thesis: cluster.thesis,
    materialityRatio: materiality.ratio,
    evidenceQuality: primary?.sourceQuality || 50,
    relationshipConfidence: 70,
    priceReactionScore: 50,
  });
  const researchReport = buildResearchReport({
    title: cluster.title,
    eventType: cluster.clusterType,
    thesis: cluster.thesis,
    materiality,
    adversarial,
    priceReactionAvailable: !!cluster.priceReactionJson,
    attentionAvailable: !!cluster.attentionJson,
    relationshipConfidence: 70,
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
    relationshipConfidence: 70,
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

  await prisma.catalystCluster.update({
    where: { id: clusterId },
    data: {
      status: finalStatus,
      materialityJson: materiality as any,
      adversarialJson: adversarial as any,
      structuredAttributes: {
        ...jsonObject(cluster.structuredAttributes),
        researchReport,
      } as any,
      researchCompleteness: completeness,
      researchConfidence: researchReport.confidence,
      lastEvaluatedAt: new Date(),
    },
  });

  return { clusterId, materiality, adversarial, qualification, researchReport, completeness };
}

export async function runSourceAgnosticIntelligencePass(params?: {
  signalLimit?: number;
  minPriority?: number;
}) {
  const triage = await triageUnclusteredSignals(params?.signalLimit ?? 100, params?.minPriority ?? 55);
  const clusters = await prisma.catalystCluster.findMany({
    where: { status: { in: ['open', 'triaged'] } },
    orderBy: [{ priorityScore: 'desc' }, { firstSeenAt: 'desc' }],
    take: params?.signalLimit ?? 100,
  });

  const evaluated = [];
  for (const cluster of clusters) {
    evaluated.push(await evaluateClusterForOpportunity(cluster.id));
  }

  return { triage, evaluated: evaluated.length };
}
