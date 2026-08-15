/**
 * Finnhub company-news count — the "is anyone writing about this?" signal.
 *
 * Finnhub's free tier includes /company-news (60 calls/min, 1 year + real-time).
 * This is the strongest and cheapest input to computeIgnoredScore(): a company
 * with a brand-new filing and ZERO news articles is exactly what "hidden
 * catalyst" means. It is a pure count — no AI, no interpretation.
 *
 * Only used on the shortlist of companies that actually filed something new,
 * so a full-universe backfill is never needed.
 */

const FINNHUB_NEWS = 'https://finnhub.io/api/v1/company-news';

export interface NewsCount {
  /** Total news articles in the last 7 days. */
  total7d: number;
  /** Articles whose headline/summary mention any catalyst keyword. */
  catalystMatches: number;
  /** Whether the count is real (false on API failure — caller should not score). */
  available: boolean;
}

export function finnhubKey(): string {
  return process.env.FINNHUB_API_KEY || '';
}

const DAY_MS = 86400000;

/**
 * Count news articles for a ticker over the last 7 days. Optionally restrict
 * to articles mentioning catalyst keywords (the filing's own terms), so a
 * company with 20 generic articles but zero about *this event* still reads as
 * "hidden" for the catalyst at hand.
 */
export async function countNews7d(
  ticker: string,
  keywords: string[] = []
): Promise<NewsCount> {
  const key = finnhubKey();
  const empty: NewsCount = { total7d: 0, catalystMatches: 0, available: false };
  if (!key || !ticker) return empty;

  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10);

  try {
    const res = await fetch(
      `${FINNHUB_NEWS}?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return empty;
    const data = (await res.json()) as Array<{ headline?: string; summary?: string; datetime?: number }>;
    if (!Array.isArray(data)) return empty;

    const weekAgo = Date.now() - 7 * DAY_MS;
    let total = 0;
    let matches = 0;
    const needle = keywords.map((k) => k.toLowerCase()).filter(Boolean);

    for (const item of data) {
      const ts = item.datetime ? item.datetime * 1000 : 0;
      if (ts && ts < weekAgo) continue;
      total++;
      if (needle.length > 0) {
        const text = `${item.headline || ''} ${item.summary || ''}`.toLowerCase();
        if (needle.some((k) => text.includes(k))) matches++;
      }
    }

    return { total7d: total, catalystMatches: matches, available: true };
  } catch {
    return empty;
  }
}
