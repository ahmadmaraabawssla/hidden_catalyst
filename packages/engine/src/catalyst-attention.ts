/**
 * Catalyst Attention Measurement
 *
 * Measures whether the SPECIFIC event (a given trial, contract award, FDA
 * decision, filing) is being talked about — not just whether the company has
 * generic coverage. This is the "hidden" in Hidden Catalyst: a catalyst is only
 * information-asymmetry if the market has NOT already priced it in via coverage.
 *
 * Epistemic discipline (the core contract):
 *   - `attentionStatus = 'measured'` ONLY when catalyst-specific coverage was
 *     actually observed (a matching press release, or news articles whose
 *     headline/summary mention the catalyst's own terms).
 *   - `attentionStatus = 'unknown'` otherwise. A company with 50 generic
 *     articles but ZERO about *this event* is UNKNOWN for the catalyst — NOT
 *     "overlooked" (we have no evidence the market ignored it; we just haven't
 *     matched it).
 *   - The company-level proxy (market-cap + ticker derived) is stored SEPARATELY
 *     as `companyAttentionProxy` and must never be treated as measured evidence.
 *
 * "no articles returned → overlooked" is a false inference. No match → unknown.
 */

import { countNews7d } from '@hidden-catalyst/connectors';

const FMP_BASE = 'https://financialmodelingprep.com/api/v3';

export interface PressReleaseCheck {
  found: boolean;
  count: number;
  headlines: string[];
}

export interface NewsMentions {
  /** Articles whose headline/summary mention a catalyst keyword (catalyst-specific). */
  count: number;
  sentiment: number;
}

/**
 * The epistemic contract of catalyst attention, as a PURE function so it can be
 * tested without network access. Given the observed catalyst-specific matches,
 * classify whether attention was actually MEASURED or is UNKNOWN.
 *
 * The single most important rule, enforced here:
 *   - measured: at least one catalyst-specific match (a matching press release,
 *     or a news article whose headline/summary mentions the catalyst's terms).
 *   - unknown: NO catalyst-specific match — REGARDLESS of how many generic
 *     company articles exist. A company with 50 generic articles but zero about
 *     *this event* is UNKNOWN, not "overlooked". We have no evidence the market
 *     ignored the catalyst; we merely failed to match it.
 *
 * There is deliberately NO "overlooked" output. That inference is only valid
 * once catalyst-specific matching exists and returns a verified zero.
 */
export function classifyAttention(args: {
  catalystMatches: number;
  pressReleaseFound: boolean;
}): { measured: boolean; attentionStatus: 'measured' | 'unknown' } {
  const measured = args.pressReleaseFound || args.catalystMatches > 0;
  return { measured, attentionStatus: measured ? 'measured' : 'unknown' };
}

export interface AttentionProfile {
  /**
   * Numeric company-attention PROXY only (market-cap + ticker-derived). This is
   * NOT catalyst-specific attention and must never be treated as measured
   * evidence. Kept named explicitly so future code cannot mistake a "90"
   * proxy for "highly overlooked" proof.
   */
  companyAttentionProxy: number;
  /** Total company news articles in the last 7 days (context — NOT the catalyst). */
  companyNewsTotal: number;
  /** News articles matching the catalyst's own terms in the last 7 days. */
  pressRelease: PressReleaseCheck;
  news: NewsMentions;
  source: 'finnhub' | 'estimate';
  /**
   * True only when catalyst-specific attention was actually observed
   * (a matching press release or a catalyst-keyword news match). False when
   * only the company-level proxy is available.
   */
  measured: boolean;
  /**
   * Epistemic status of attention: 'measured' (catalyst-specific coverage
   * observed), 'unknown' (not measured — proxy only). No other value is valid;
   * "overlooked" is NOT a state until catalyst-specific matching exists.
   */
  attentionStatus: 'measured' | 'unknown';
}

/**
 * Check if the company issued a press release for a specific event.
 * Looks at FMP press releases endpoint for the ticker and keyword-matches.
 * (Best-effort — the FMP Starter plan may 403 this endpoint; the Finnhub news
 * match is the primary catalyst-specific signal.)
 */
export async function checkPressReleases(
  ticker: string,
  apiKey: string | undefined,
  keywords: string[]
): Promise<PressReleaseCheck> {
  try {
    if (!apiKey) return { found: false, count: 0, headlines: [] };
    const res = await fetch(
      `${FMP_BASE}/press-releases/${ticker}?apikey=${apiKey}&limit=10`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return { found: false, count: 0, headlines: [] };
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return { found: false, count: 0, headlines: [] };

    const matches: string[] = [];
    for (const item of data) {
      const title = String(item.title || '').toLowerCase();
      const text = String(item.text || '').toLowerCase();
      const combined = `${title} ${text}`;

      const matched = keywords.some((keyword) => combined.includes(keyword.toLowerCase()));
      if (matched) matches.push(item.title as string);
    }

    return { found: matches.length > 0, count: matches.length, headlines: matches };
  } catch {
    return { found: false, count: 0, headlines: [] };
  }
}

/**
 * Compute the company-attention PROXY (inverted: high = small/underfollowed).
 * This is market-cap + ticker derived and is NOT catalyst-specific. It exists
 * only as a fallback signal for ranking; it must never be presented as
 * "measured" attention.
 */
export function computeAttentionScore(
  marketCap: number | null,
  ticker: string
): number {
  let base: number;
  const mc = marketCap ?? 0;
  if (mc < 100e6) base = 85;
  else if (mc < 300e6) base = 75;
  else if (mc < 500e6) base = 65;
  else if (mc < 1e9) base = 55;
  else if (mc < 2e9) base = 45;
  else if (mc < 5e9) base = 35;
  else if (mc < 10e9) base = 25;
  else base = 15;

  if (ticker && ticker.length > 4) base += 5;

  return Math.max(5, Math.min(95, Math.round(base)));
}

/**
 * Full catalyst attention measurement for a company + event.
 *
 * The catalyst-specific signal is Finnhub `company-news` keyword-matched against
 * the event's own terms (drug name, contract agency, filing keyword). A zero
 * match is `unknown`, not "overlooked". The company-level proxy is returned
 * separately and never conflated with the measured signal.
 */
export async function measureAttention(
  ticker: string,
  apiKey: string | undefined,
  marketCap: number | null,
  keywords: string[]
): Promise<AttentionProfile> {
  const proxy = computeAttentionScore(marketCap ?? 800_000_000, ticker);

  if (!ticker) {
    return {
      companyAttentionProxy: proxy,
      companyNewsTotal: 0,
      pressRelease: { found: false, count: 0, headlines: [] },
      news: { count: 0, sentiment: 0 },
      source: 'estimate',
      measured: false,
      attentionStatus: 'unknown',
    };
  }

  // Catalyst-specific news match via Finnhub (keyword-matched) + press release check.
  const [newsCount, pressRelease] = await Promise.all([
    countNews7d(ticker, keywords || []),
    checkPressReleases(ticker, apiKey, keywords || []),
  ]);

  const catalystMatches = newsCount.available ? newsCount.catalystMatches : 0;
  const companyTotal = newsCount.available ? newsCount.total7d : 0;
  const { measured, attentionStatus } = classifyAttention({
    catalystMatches,
    pressReleaseFound: pressRelease.found,
  });

  return {
    companyAttentionProxy: proxy,
    companyNewsTotal: companyTotal,
    pressRelease,
    news: { count: catalystMatches, sentiment: 0 },
    source: 'finnhub',
    measured,
    attentionStatus,
  };
}
