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
  /** Date the event occurred. Used to detect stale catalysts (see below). */
  eventDate?: Date | null;
  /** As-of date for the financial denominator. Defaults to now. */
  denominatorAsOf?: Date | null;
}

/**
 * Comparing a decades-old event amount against *current* financials produces a
 * misleading ratio (e.g. a 1993 contract ceiling vs 2026 revenue). If the event
 * predates the denominator by more than this window, materiality is UNKNOWN —
 * we don't have contemporaneous financials to make a defensible comparison.
 */
const DENOMINATOR_STALENESS_MS = 18 * 30 * 86400000; // ~18 months

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

  // ── Staleness guard ──
  // A ratio is only meaningful when the event and the denominator are
  // contemporaneous. If the event predates the financial denominator by more
  // than the staleness window, downgrade to UNKNOWN rather than reporting a
  // misleading HIGH/MODERATE.
  const denominatorAsOf = input.denominatorAsOf ?? new Date();
  const eventTime = input.eventDate ? input.eventDate.getTime() : null;
  const denominatorTime = denominatorAsOf.getTime();
  const isStaleDenominator = eventTime != null && Number.isFinite(eventTime)
    ? denominatorTime - eventTime > DENOMINATOR_STALENESS_MS
    : false;

  const effectiveRatio = isStaleDenominator ? null : ratio;
  const level = classifyRatio(effectiveRatio);
  const confidence = effectiveRatio == null ? 0.35 : input.amount && denominator ? 0.85 : 0.6;

  return {
    metric,
    numerator,
    denominator,
    ratio: effectiveRatio,
    level,
    confidence,
    explanation: isStaleDenominator
      ? `${metric} could not be computed: the event predates the financial denominator by more than 18 months, so a contemporaneous comparison is not defensible.`
      : effectiveRatio == null
        ? `${metric} could not be computed because a required input is missing.`
        : `${metric} is ${pct(effectiveRatio)}, classified as ${level}.`,
  };
}

export function extractLargestAmount(amounts: Array<{ value?: number | null }> | null | undefined): number | null {
  const values = (amounts || []).map((a) => Number(a.value || 0)).filter((v) => v > 0);
  return values.length ? Math.max(...values) : null;
}
