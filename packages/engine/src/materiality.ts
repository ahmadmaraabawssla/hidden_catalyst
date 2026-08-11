export type MaterialityLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' | 'UNKNOWN';

export interface MaterialityInput {
  eventType: string;
  amount?: number | null;
  revenue?: number | null;
  cash?: number | null;
  assets?: number | null;
  enterpriseValue?: number | null;
  currentShares?: number | null;
  potentialShares?: number | null;
  existingCapacity?: number | null;
  newCapacity?: number | null;
}

export interface MaterialityResult {
  metric: string;
  numerator: number | null;
  denominator: number | null;
  ratio: number | null;
  level: MaterialityLevel;
  confidence: number;
  explanation: string;
}

function classifyRatio(ratio: number | null): MaterialityLevel {
  if (ratio == null || !Number.isFinite(ratio)) return 'UNKNOWN';
  if (ratio >= 0.50) return 'EXTREME';
  if (ratio >= 0.20) return 'HIGH';
  if (ratio >= 0.05) return 'MODERATE';
  return 'LOW';
}

function pct(value: number | null) {
  return value == null ? 'unknown' : `${(value * 100).toFixed(1)}%`;
}

export function computeMateriality(input: MaterialityInput): MaterialityResult {
  const eventType = (input.eventType || '').toLowerCase();
  let metric = 'amount / revenue';
  let numerator = input.amount ?? null;
  let denominator = input.revenue ?? null;

  if (/liability|financing|true.?up|dilution|warrant|convertible/.test(eventType)) {
    metric = 'liability / cash';
    denominator = input.cash ?? input.revenue ?? null;
  } else if (/capex|facility|capacity|expansion/.test(eventType)) {
    metric = input.newCapacity && input.existingCapacity ? 'new capacity / existing capacity' : 'capex / assets';
    numerator = input.newCapacity ?? input.amount ?? null;
    denominator = input.existingCapacity ?? input.assets ?? null;
  } else if (/trial|clinical|fda|approval|drug/.test(eventType)) {
    metric = 'market opportunity / enterprise value';
    denominator = input.enterpriseValue ?? input.revenue ?? null;
  } else if (/share|dilution/.test(eventType) && input.potentialShares) {
    metric = 'potential dilution / current shares';
    numerator = input.potentialShares;
    denominator = input.currentShares ?? null;
  } else if (/contract|award|grant|customer/.test(eventType)) {
    metric = /grant/.test(eventType) ? 'grant value / revenue' : 'contract value / revenue';
  }

  const ratio = numerator != null && denominator != null && denominator > 0 ? numerator / denominator : null;
  const level = classifyRatio(ratio);
  const confidence = ratio == null ? 0.35 : input.amount && denominator ? 0.85 : 0.6;

  return {
    metric,
    numerator,
    denominator,
    ratio,
    level,
    confidence,
    explanation: ratio == null
      ? `${metric} could not be computed because a required input is missing.`
      : `${metric} is ${pct(ratio)}, classified as ${level}.`,
  };
}

export function extractLargestAmount(amounts: Array<{ value?: number | null }> | null | undefined): number | null {
  const values = (amounts || []).map((a) => Number(a.value || 0)).filter((v) => v > 0);
  return values.length ? Math.max(...values) : null;
}
