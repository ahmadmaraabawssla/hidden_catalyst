export type MaterialityLevel = 'IMMATERIAL' | 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' | 'UNKNOWN';

/**
 * Below this ratio an event is economically negligible — no coverage is the
 * efficient-market response to an irrelevant record, NOT information asymmetry.
 * A $2M contract at a $44B-revenue company (~0.0045%) must never surface as
 * "worth a look". This is the hard floor for investment relevance.
 */
export const IMMATERIAL_RATIO = 0.0025; // 0.25%

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
  /** Clinical-trial phase (e.g. "PHASE1"/"PHASE2"/"PHASE3"). Source-specific. */
  clinicalPhase?: string | null;
  /** Clinical-trial enrollment count. Source-specific. */
  enrollment?: number | null;
  /** Clinical-trial overall status (COMPLETED / RECRUITING / etc.). */
  clinicalStatus?: string | null;
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
  if (ratio >= IMMATERIAL_RATIO) return 'LOW';
  return 'IMMATERIAL';
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
    // ── Source-specific: clinical/regulatory materiality is NOT a dollar ratio ──
    // A pre-revenue biotech's single Phase III asset has no "event amount", yet
    // a status change is enormously material. Forcing "market opportunity / EV"
    // onto a bare clinical trial produces UNKNOWN (and then a wrong reject).
    // Instead, materiality derives from the trial's stage, size, and status —
    // the dimensions that actually move a biotech's value. If a real dollar
    // amount IS present (e.g. a partnered milestone), fall through to the ratio.
    const clinical = computeClinicalMateriality(input);
    if (clinical) return clinical;
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

/**
 * Clinical/regulatory materiality — qualitative, not a dollar ratio.
 *
 * For a clinical trial or FDA event, the economically meaningful dimensions are
 * the trial's stage, size, and what changed — not a dollar amount (there isn't
 * one). A single Phase III asset at a pre-revenue biotech can be worth the
 * whole company. This maps those qualitative signals onto the same
 * MaterialityLevel scale so downstream qualification works unchanged.
 *
 * Heuristic (conservative — never inflates routine registry data):
 *   - A STATUS CHANGE (COMPLETED / primary completion / TERMINATED / approved)
 *     is the strongest signal — it means something happened, not just a record.
 *   - Phase 3 + a status change → MODERATE (registrational, near-approval).
 *   - Phase 2 + a status change, or Phase 3 without a change → LOW.
 *   - Phase 1 / no phase / no status → IMMATERIAL (routine registry data).
 *   - Large enrollment nudges up; tiny enrollment nudges down.
 *
 * Returns null when there is no clinical signal at all (so callers fall through
 * to the dollar-ratio path), or a MaterialityResult when a qualitative
 * assessment applies.
 */
function computeClinicalMateriality(input: MaterialityInput): MaterialityResult | null {
  const phase = (input.clinicalPhase || '').toUpperCase();
  const status = (input.clinicalStatus || '').toUpperCase();
  const enrollment = input.enrollment ?? 0;
  const isClinical = /trial|clinical|fda|approval|drug/.test((input.eventType || '').toLowerCase());
  if (!isClinical) return null;

  const hasPhase = !!phase;
  const hasStatus = !!status;
  // Only assess qualitatively when there is no dollar amount to ratio against.
  const hasDollarAmount = input.amount != null && input.amount > 0;
  if (hasDollarAmount) return null;

  const statusChange = /COMPLETED|TERMINATED|SUSPENDED|WITHDRAWN|APPROVED|PRIMARY.?COMPLETION|ACTIVE_NOT_RECRUITING/i.test(status);
  const isPhase3 = /PHASE\s*3|PHASE\s*III|PHASE\s*IV/i.test(phase);
  const isPhase2 = /PHASE\s*2|PHASE\s*II/i.test(phase);
  const isPhase1 = /PHASE\s*1|PHASE\s*I|EARLY.?PHASE/i.test(phase);

  let level: MaterialityLevel;
  let note: string;

  if (statusChange && isPhase3) {
    level = enrollment >= 100 ? 'MODERATE' : 'LOW';
    note = `Phase 3 status change (${status})${enrollment ? `, ${enrollment} enrolled` : ''}.`;
  } else if (statusChange && isPhase2) {
    level = 'LOW';
    note = `Phase 2 status change (${status}).`;
  } else if (/APPROVED|CLEARED|CLEARANCE/.test(status)) {
    // ── FDA approval / clearance is a value event REGARDLESS of phase ──
    // An approval has no "phase"; the approval IS the material event. A first
    // product approval can be worth the whole company for a small drugmaker,
    // so it must not be classified IMMATERIAL just because there is no
    // clinical phase field. (Regulatory approval of a generic/me-too may be
    // smaller, but "material" is the right default for a commercial event.)
    level = 'LOW';
    note = `Regulatory approval/clearance (${status}).`;
  } else if (isPhase3) {
    level = 'LOW';
    note = `Phase 3 trial (${status || 'status unknown'}).`;
  } else if (isPhase2 && statusChange === false) {
    level = 'IMMATERIAL';
    note = `Phase 2 trial with no status change — routine registry data.`;
  } else if (isPhase1 || !hasPhase) {
    level = 'IMMATERIAL';
    note = isPhase1 ? 'Phase 1 / early-phase trial — not yet a material value driver.' : 'No phase reported — routine registry data.';
  } else {
    level = 'IMMATERIAL';
    note = hasStatus ? `Trial status ${status} with no meaningful phase.` : 'No phase or status — routine registry data.';
  }

  const metric = 'clinical stage / status';
  const numerator = enrollment > 0 ? enrollment : null;
  const denominator = null;
  const confidence = statusChange ? 0.6 : 0.4;

  return {
    metric,
    numerator,
    denominator,
    ratio: null,
    level,
    confidence,
    explanation: `${metric}: ${note}`,
  };
}

export function extractLargestAmount(amounts: Array<{ value?: number | null }> | null | undefined): number | null {
  const values = (amounts || []).map((a) => Number(a.value || 0)).filter((v) => v > 0);
  return values.length ? Math.max(...values) : null;
}

/** True when the event clears the hard investment-relevance floor. */
export function isInvestmentRelevant(level: MaterialityLevel): boolean {
  return level === 'LOW' || level === 'MODERATE' || level === 'HIGH' || level === 'EXTREME';
}
