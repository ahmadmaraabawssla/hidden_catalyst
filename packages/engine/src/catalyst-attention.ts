/**
 * Catalyst Attention Measurement (v4e)
 *
 * Measures how much attention a specific event is getting:
 * 1. Press release check: did the company issue a formal PR?
 * 2. Media coverage: how many financial news outlets covered it?
 * 3. Attention score: 0-100, inverted (higher = more overlooked/less attention)
 *
 * The score is INVERTED for the Info Asymmetry metric:
 * - Low attention → high info asymmetry score → opportunity
 * - High attention → low info asymmetry score → already priced in
 */

const FMP_BASE = 'https://financialmodelingprep.com/api/v3';

export interface PressReleaseCheck {
  found: boolean;
  count: number;
  headlines: string[];
}

export interface NewsMentions {
  count: number;
  sentiment: number;
}

export interface AttentionProfile {
  attentionScore: number;
  pressRelease: PressReleaseCheck;
  news: NewsMentions;
  source: 'fmp' | 'estimate';
  /**
   * True only when catalyst-specific attention was actually observed
   * (a matching press release or recent news mentions). False when the
   * score is a market-cap-derived proxy with no observed coverage.
   */
  measured: boolean;
}

/**
 * Check if the company issued a press release for a specific event.
 * Looks at FMP press releases endpoint for the ticker.
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
 * Count financial news articles mentioning the company in the last 7 days.
 */
export async function countNewsMentions(
  ticker: string,
  apiKey: string | undefined,
  keywords: string[] = []
): Promise<NewsMentions> {
  try {
    if (!apiKey) return { count: 0, sentiment: 0 };
    const res = await fetch(
      `${FMP_BASE}/stock_news?tickers=${ticker}&limit=50&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return { count: 0, sentiment: 0 };
    const data = await res.json();
    if (!Array.isArray(data)) return { count: 0, sentiment: 0 };

    const weekAgo = Date.now() - 7 * 86400000;
    let count = 0;
    let totalSentiment = 0;
    for (const item of data) {
      const publishedDate = item.publishedDate ? new Date(item.publishedDate as string).getTime() : 0;
      const articleText = `${String(item.title || '')} ${String(item.text || '')}`.toLowerCase();
      const catalystMatch = keywords.length > 0 && keywords.some((keyword) => articleText.includes(keyword.toLowerCase()));
      if (publishedDate > weekAgo && catalystMatch) {
        count++;
        totalSentiment += parseFloat(item.sentiment as string) || 0;
      }
    }

    return {
      count,
      sentiment: count > 0 ? totalSentiment / count : 0,
    };
  } catch {
    return { count: 0, sentiment: 0 };
  }
}

/**
 * Compute the catalyst attention score (inverted: high score = LOW attention = overlooked).
 *
 * Input: market cap (smaller = less attention), press release found, news count
 * Output: 5-95 score where 95 = completely overlooked, 5 = heavily covered
 */
export function computeAttentionScore(
  marketCap: number | null,
  pressReleaseFound: boolean,
  newsCount: number,
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

  if (pressReleaseFound) base -= 20;

  if (newsCount > 20) base -= 20;
  else if (newsCount > 10) base -= 12;
  else if (newsCount > 5) base -= 8;
  else if (newsCount > 2) base -= 4;
  else base += 5; // Bonus for very few articles

  if (ticker && ticker.length > 4) base += 5;

  return Math.max(5, Math.min(95, Math.round(base)));
}

/**
 * Full catalyst attention measurement for a company + event.
 * Runs all checks and returns a comprehensive attention profile.
 */
export async function measureAttention(
  ticker: string,
  apiKey: string | undefined,
  marketCap: number | null,
  keywords: string[]
): Promise<AttentionProfile> {
  if (!apiKey || !ticker) {
    return {
      attentionScore: computeAttentionScore(marketCap ?? 800000000, false, 0, ticker),
      pressRelease: { found: false, count: 0, headlines: [] },
      news: { count: 0, sentiment: 0 },
      source: 'estimate',
      measured: false,
    };
  }

  const [pressRelease, news] = await Promise.all([
    checkPressReleases(ticker, apiKey, keywords || []),
    countNewsMentions(ticker, apiKey, keywords || []),
  ]);

  const score = computeAttentionScore(marketCap ?? 800000000, pressRelease.found, news.count, ticker);

  return {
    attentionScore: score,
    pressRelease,
    news,
    source: 'fmp',
    // Only count as "measured" when we actually observed catalyst-specific
    // coverage — a matching press release or recent news mentions. A
    // market-cap-only score with zero coverage is a proxy, not a measurement.
    measured: pressRelease.found || news.count > 0,
  };
}
