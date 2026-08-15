/**
 * "Ignored-ness" score — how underfollowed a company is.
 *
 * This is the cheap selection signal that decides WHICH companies are worth
 * the expensive AI deep-research pass. It is pure arithmetic on stored facts
 * (no LLM), and it deliberately does NOT treat "small market cap" as the only
 * signal — a large but genuinely underfollowed company (e.g. RKLB) should
 * outrank a tiny shell that everyone is already talking about.
 *
 * Signals (FMP Starter plan compatible):
 *   - news7d          : news article count in the last 7 days (0 = ignored)
 *   - avgDollarVolume : average daily dollar volume (low = thin attention)
 *   - marketCap       : tertiary tie-breaker only (small = slightly more hidden)
 *
 * analystCount / instOwnershipPct are accepted but optional — they require a
 * higher FMP tier; if present they strengthen the signal.
 *
 * Returns 0..100, higher = more ignored. Missing data contributes nothing
 * (neither reward nor penalty) so unranked companies don't win by default.
 */
export interface IgnoredInput {
  news7d?: number | null;
  avgDollarVolume?: number | null;
  marketCap?: number | null;
  analystCount?: number | null;
  instOwnershipPct?: number | null;
}

export function computeIgnoredScore(input: IgnoredInput): number {
  let score = 0;

  // 1. News coverage (strongest signal: no news = hidden)
  const news = input.news7d;
  if (news != null) {
    if (news === 0) score += 40;
    else if (news <= 3) score += 28;
    else if (news <= 10) score += 14;
    else if (news <= 25) score += 5;
    // > 25 news: heavily covered, no points
  }

  // 2. Trading attention (low dollar volume = thin market, fewer eyes)
  const dollarVol = input.avgDollarVolume;
  if (dollarVol != null) {
    if (dollarVol < 500_000) score += 35;
    else if (dollarVol < 2_000_000) score += 22;
    else if (dollarVol < 10_000_000) score += 10;
    else if (dollarVol < 50_000_000) score += 3;
    // > $50M daily volume: heavily traded, no points
  }

  // 3. Market cap (weak tertiary signal — small is slightly more likely hidden,
  //    but deliberately NOT the dominant factor)
  const cap = input.marketCap;
  if (cap != null) {
    if (cap < 200_000_000) score += 25;
    else if (cap < 1_000_000_000) score += 18;
    else if (cap < 5_000_000_000) score += 10;
    else if (cap < 10_000_000_000) score += 5;
    // > $10B: no cap bonus (RKLB-class names still score via news + volume)
  }

  // 4. Analyst coverage (optional, higher FMP tier)
  const analysts = input.analystCount;
  if (analysts != null) {
    if (analysts < 5) score += 15;
    else if (analysts < 10) score += 8;
  }

  // 5. Institutional ownership (optional, higher FMP tier)
  const inst = input.instOwnershipPct;
  if (inst != null) {
    if (inst < 30) score += 15;
    else if (inst < 60) score += 7;
  }

  return Math.max(0, Math.min(100, score));
}

/** Convenience: read the fields from a company's stored security attributes. */
export function ignoredScoreFromAttributes(attrs: Record<string, unknown> | null | undefined): number {
  if (!attrs) return 0;
  return computeIgnoredScore({
    news7d: toNumber(attrs.news_7d),
    avgDollarVolume: toNumber(attrs.avg_dollar_volume),
    marketCap: toNumber(attrs.market_cap),
    analystCount: toNumber(attrs.analyst_count),
    instOwnershipPct: toNumber(attrs.inst_ownership),
  });
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
