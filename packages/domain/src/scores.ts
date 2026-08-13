import type { ScoreType } from './types';

/**
 * Hidden Catalyst Opportunity Scoring Framework v2.0
 *
 * Opportunity Score = 0.25 × Information Asymmetry
 *                   + 0.20 × Catalyst Strength
 *                   + 0.20 × Evidence Quality
 *                   + 0.15 × Financial Materiality
 *                   + 0.10 × Timing
 *                   + 0.10 × Price-Reaction Score
 *                   − 0.10 × Risk Penalty
 *                   − 0.05 × Liquidity Penalty
 *                   − 0.05 × Dilution Penalty
 *
 * NOTE: Valuation Context removed (was always hardcoded 50).
 * Information Asymmetry weight increased 0.20 → 0.25 to better
 * prioritize genuinely underfollowed companies.
 */

export interface ScoreWeights {
  informationAsymmetry: number;
  catalystStrength: number;
  evidenceQuality: number;
  financialMateriality: number;
  timing: number;
  priceReaction: number;
  relationshipConfidence: number;
  researchConfidence: number;
  riskPenalty: number;
  liquidityPenalty: number;
  dilutionPenalty: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  informationAsymmetry: 0.20,
  catalystStrength: 0.16,
  evidenceQuality: 0.16,
  financialMateriality: 0.14,
  timing: 0.08,
  priceReaction: 0.08,
  relationshipConfidence: 0.10,
  researchConfidence: 0.08,
  riskPenalty: 0.10,
  liquidityPenalty: 0.05,
  dilutionPenalty: 0.05,
};

export interface ScoreInput {
  informationAsymmetry: number; // 1-100
  catalystStrength: number;     // 1-100
  evidenceQuality: number;      // 1-100
  financialMateriality: number; // 1-100
  timing: number;               // 1-100
  priceReaction: number;        // 1-100
  relationshipConfidence: number; // 1-100
  researchConfidence: number;   // 1-100
  risk: number;                 // 1-100 (higher = riskier)
  liquidityPenalty: number;     // 0-100
  dilutionPenalty: number;      // 0-100
}

export interface ScoreResult {
  scoreType: ScoreType;
  value: number;
  factors: Record<string, number>;
  weights: ScoreWeights | Record<string, number>;
  confidence: number;
  modelVersion: string;
}

export const SCORE_MODEL_VERSION = '3.0.0';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function calculateOpportunityScore(
  input: ScoreInput,
  weights: ScoreWeights = DEFAULT_WEIGHTS
): ScoreResult {
  const raw =
    weights.informationAsymmetry * input.informationAsymmetry +
    weights.catalystStrength * input.catalystStrength +
    weights.evidenceQuality * input.evidenceQuality +
    weights.financialMateriality * input.financialMateriality +
    weights.timing * input.timing +
    weights.priceReaction * input.priceReaction +
    weights.relationshipConfidence * input.relationshipConfidence +
    weights.researchConfidence * input.researchConfidence -
    weights.riskPenalty * input.risk -
    weights.liquidityPenalty * input.liquidityPenalty -
    weights.dilutionPenalty * input.dilutionPenalty;

  const value = Math.round(clamp(raw, 1, 100));

  // Confidence decreases when critical factors are missing
  const criticalFactors = [
    input.evidenceQuality > 0,
    input.catalystStrength > 0,
    input.informationAsymmetry > 0,
  ];
  const confidence = criticalFactors.filter(Boolean).length / criticalFactors.length;

  return {
    scoreType: 'opportunity',
    value,
    factors: {
      informationAsymmetry: input.informationAsymmetry,
      catalystStrength: input.catalystStrength,
      evidenceQuality: input.evidenceQuality,
      financialMateriality: input.financialMateriality,
      timing: input.timing,
      priceReaction: input.priceReaction,
      relationshipConfidence: input.relationshipConfidence,
      researchConfidence: input.researchConfidence,
      risk: input.risk,
      liquidityPenalty: input.liquidityPenalty,
      dilutionPenalty: input.dilutionPenalty,
    },
    weights,
    confidence,
    modelVersion: SCORE_MODEL_VERSION,
  };
}

export interface ResearchPriorityInput {
  dollarAmountScore: number;
  companyScaleScore: number;
  eventTypeScore: number;
  sourceQuality: number;
  unusualKeywordScore: number;
  indirectRelationshipScore: number;
  newRelationshipScore: number;
  recencyScore: number;
  apparentMagnitudeScore: number;
}

export interface QualificationGateInput {
  primaryEvidenceExists: boolean;
  hiddenAngleExists: boolean;
  relationshipConfidence: number;
  materialityScore: number;
  liquidityAcceptable: boolean;
  dataFreshnessScore: number;
  fatalContradiction: boolean;
  evidenceQuality: number;
  researchCompleteness: number;
}

export function calculateResearchPriority(input: ResearchPriorityInput): ScoreResult {
  const weights = {
    dollarAmountScore: 0.16,
    companyScaleScore: 0.12,
    eventTypeScore: 0.14,
    sourceQuality: 0.14,
    unusualKeywordScore: 0.08,
    indirectRelationshipScore: 0.10,
    newRelationshipScore: 0.10,
    recencyScore: 0.08,
    apparentMagnitudeScore: 0.08,
  };

  const raw = Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + weight * input[key as keyof ResearchPriorityInput];
  }, 0);

  return {
    scoreType: 'research_priority',
    value: Math.round(clamp(raw, 1, 100)),
    factors: { ...input },
    weights,
    confidence: 1,
    modelVersion: SCORE_MODEL_VERSION,
  };
}

export function qualifyOpportunity(input: QualificationGateInput): {
  status: 'reject' | 'watch' | 'candidate' | 'verified';
  reasons: string[];
} {
  const reasons: string[] = [];

  if (!input.primaryEvidenceExists) reasons.push('No primary evidence');
  if (!input.hiddenAngleExists) reasons.push('No hidden angle');
  if (input.relationshipConfidence < 70) reasons.push('Weak economic relationship');
  if (input.materialityScore < 35) reasons.push('Materiality below threshold');
  if (!input.liquidityAcceptable) reasons.push('Liquidity below threshold');
  if (input.dataFreshnessScore < 40) reasons.push('Evidence is stale');
  if (input.fatalContradiction) reasons.push('Fatal contradiction found');
  if (input.evidenceQuality < 55) reasons.push('Evidence quality below threshold');

  if (input.fatalContradiction || !input.primaryEvidenceExists || input.evidenceQuality < 40) {
    return { status: 'reject', reasons };
  }

  if (reasons.length > 0 || input.researchCompleteness < 55) {
    return { status: 'watch', reasons };
  }

  if (
    input.relationshipConfidence >= 90 &&
    input.materialityScore >= 70 &&
    input.evidenceQuality >= 80 &&
    input.researchCompleteness >= 85
  ) {
    return { status: 'verified', reasons };
  }

  return { status: 'candidate', reasons };
}

/**
 * Publication gate checks. Threshold lowered from 80→70 to allow
 * more opportunities through while scoring is being calibrated.
 */
export function canAutoPublish(
  evidenceQuality: number,
  mappingConfidence: number,
  relationshipConfidence: number,
  riskScore: number,
  hasProhibitedFlags: boolean,
  liquidityAboveThreshold: boolean
): { canPublish: boolean; reason?: string } {
  if (evidenceQuality < 70) {
    return { canPublish: false, reason: 'Evidence quality below threshold (70)' };
  }
  if (mappingConfidence < 0.95) {
    return { canPublish: false, reason: 'Security mapping confidence below 0.95' };
  }
  if (relationshipConfidence < 0.85) {
    return { canPublish: false, reason: 'Relationship confidence below 0.85' };
  }
  if (riskScore > 65) {
    return { canPublish: false, reason: 'Risk score exceeds threshold (65)' };
  }
  if (hasProhibitedFlags) {
    return { canPublish: false, reason: 'Prohibited risk flags present' };
  }
  if (!liquidityAboveThreshold) {
    return { canPublish: false, reason: 'Liquidity below threshold' };
  }
  return { canPublish: true };
}

/**
 * Calculate Information Asymmetry from real data points.
 *
 * Components (each contributing to 1-100 score, higher = more overlooked):
 * - Market cap: smaller = more overlooked (0-40 points)
 * - Analyst coverage: fewer analysts = more overlooked (0-30 points)
 * - Institutional ownership: lower = more overlooked (0-15 points)
 * - Staleness: older news = more overlooked (0-15 points)
 */
export function calculateInformationAsymmetry(params: {
  marketCap: number | null;
  analystCount: number | null;
  institutionalOwnership: number | null;
  daysSinceLastNews: number | null;
}): number {
  const mc = params.marketCap ?? 1_000_000_000;

  let mcScore: number;
  if (mc < 100_000_000) mcScore = 40;
  else if (mc < 300_000_000) mcScore = 38;
  else if (mc < 500_000_000) mcScore = 35;
  else if (mc < 1_000_000_000) mcScore = 30;
  else if (mc < 2_000_000_000) mcScore = 25;
  else if (mc < 5_000_000_000) mcScore = 18;
  else if (mc < 10_000_000_000) mcScore = 10;
  else if (mc < 50_000_000_000) mcScore = 5;
  else mcScore = 2;

  const analysts = params.analystCount ?? -1;
  let analystScore: number;
  if (analysts < 0) analystScore = 10;
  else if (analysts === 0) analystScore = 30;
  else if (analysts <= 2) analystScore = 28;
  else if (analysts <= 4) analystScore = 24;
  else if (analysts <= 7) analystScore = 18;
  else if (analysts <= 12) analystScore = 10;
  else if (analysts <= 20) analystScore = 5;
  else analystScore = 2;

  const instOwn = params.institutionalOwnership ?? -1;
  let instScore: number;
  if (instOwn < 0) instScore = 5;
  else if (instOwn < 10) instScore = 15;
  else if (instOwn < 30) instScore = 12;
  else if (instOwn < 50) instScore = 8;
  else if (instOwn < 70) instScore = 4;
  else instScore = 2;

  const daysSince = params.daysSinceLastNews ?? -1;
  let newsScore: number;
  if (daysSince < 0) newsScore = 5;
  else if (daysSince > 30) newsScore = 15;
  else if (daysSince > 14) newsScore = 12;
  else if (daysSince > 7) newsScore = 8;
  else if (daysSince > 3) newsScore = 5;
  else newsScore = 2;

  return clamp(mcScore + analystScore + instScore + newsScore, 1, 100);
}

/**
 * Calculate Evidence Quality from source characteristics.
 */
export function calculateEvidenceQuality(params: {
  sourceType: 'sec_8k' | 'sec_10k' | 'sec_10q' | 'sec_other' | 'government' | 'press_release' | 'news' | 'patent' | 'clinical_trial' | 'other';
  daysSincePublication: number;
  hasDollarAmounts: boolean;
  hasNamedParties: boolean;
  corroboratingSources: number;
}): number {
  const sourceBase: Record<string, number> = {
    sec_8k: 88, sec_10k: 85, sec_10q: 82, sec_other: 78,
    government: 95, patent: 90, clinical_trial: 90,
    press_release: 75, news: 65, other: 50,
  };
  let score = sourceBase[params.sourceType] || 65;

  const days = params.daysSincePublication;
  if (days <= 1) score += 5;
  else if (days <= 3) score += 3;
  else if (days <= 7) score += 0;
  else if (days <= 14) score -= 3;
  else if (days <= 30) score -= 8;
  else score -= 15;

  if (params.hasDollarAmounts) score += 4;
  if (params.hasNamedParties) score += 3;
  if (params.corroboratingSources >= 2) score += 5;
  else if (params.corroboratingSources >= 1) score += 2;

  return clamp(score, 10, 100);
}

/**
 * Calculate Price Reaction score.
 * Higher = market has NOT priced in the information.
 */
export function calculatePriceReaction(params: {
  priceChangePercent: number | null;
  sectorChangePercent: number | null;
  volumeChangeRatio: number | null;
}): number {
  const priceChange = Math.abs(params.priceChangePercent ?? 5);

  let score: number;
  if (priceChange < 0.5) score = 95;
  else if (priceChange < 1) score = 88;
  else if (priceChange < 2) score = 75;
  else if (priceChange < 3) score = 60;
  else if (priceChange < 5) score = 40;
  else score = 20;

  const volRatio = params.volumeChangeRatio ?? 1;
  if (volRatio < 0.8) score += 3;
  if (volRatio > 3) score -= 5;

  return clamp(score, 5, 100);
}
