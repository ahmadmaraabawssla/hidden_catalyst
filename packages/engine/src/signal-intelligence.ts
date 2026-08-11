import { prisma } from '@hidden-catalyst/db';
import {
  calculateResearchPriority,
  qualifyOpportunity,
  type NormalizedSignal,
  type QualificationGateInput,
  type ResearchPriorityInput,
} from '@hidden-catalyst/domain';

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
