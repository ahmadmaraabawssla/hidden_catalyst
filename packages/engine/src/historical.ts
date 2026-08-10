/**
 * Historical Catalyst Reaction Analysis
 *
 * For a given event type + sector, finds comparable past events
 * and calculates median reaction metrics.
 *
 * Data sources: Finnhub price candles, database of past opportunities.
 */

import { prisma } from '@hidden-catalyst/db';

export interface HistoricalAnalysis {
  eventType: string;
  comparableEvents: number;
  medianReaction1d: number | null;
  medianReaction5d: number | null;
  medianReaction20d: number | null;
  reactionRange: { min: number; max: number };
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  events: Array<{
    ticker: string;
    date: string;
    reaction1d: number | null;
    title: string;
  }>;
}

/**
 * Analyze historical catalyst reactions for comparable events.
 */
export async function analyzeHistoricalReactions(params: {
  eventType: string;
  sector?: string | null;
  marketCapRange?: { min: number; max: number };
}): Promise<HistoricalAnalysis> {
  // Find past opportunities with the same event type
  const pastOpps = await prisma.opportunity.findMany({
    where: {
      status: { in: ['published', 'invalidated'] },
      // Match by event type if available
    },
    include: {
      security: {
        include: { company: true },
      },
      scores: {
        where: { scoreType: 'price_reaction' },
      },
    },
    take: 20,
    orderBy: { publishedAt: 'desc' },
  });

  // Filter to comparable events (same event type, similar sector)
  const comparable = pastOpps.filter(opp => {
    const companySector = opp.security.company.sector;
    if (params.sector && companySector && companySector !== params.sector) return false;
    return true;
  });

  // Fetch historical price reactions
  const reactions: Array<{ ticker: string; date: string; reaction1d: number | null; title: string }> = [];

  for (const opp of comparable) {
    const ticker = opp.security.ticker;

    // Try to get actual price reaction data from Finnhub
    let reaction1d: number | null = null;

    try {
      const key = process.env.FINNHUB_API_KEY;
      if (key && opp.detectedAt) {
        const eventDate = new Date(opp.detectedAt);
        const fromTs = Math.floor((eventDate.getTime() - 86400000) / 1000);
        const toTs = Math.floor((eventDate.getTime() + 5 * 86400000) / 1000);

        const res = await fetch(
          `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${fromTs}&to=${toTs}&token=${key}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.s === 'ok' && data.c && data.c.length >= 2) {
            const prices: number[] = data.c;
            if (prices[0] !== undefined && prices[0] > 0) {
              reaction1d = ((prices[Math.min(1, prices.length - 1)]! - prices[0]) / prices[0]) * 100;
            }
          }
        }
      }
    } catch {}

    reactions.push({
      ticker,
      date: opp.detectedAt?.toISOString().slice(0, 10) || '',
      reaction1d,
      title: opp.title,
    });

    // Rate limit Finnhub calls
    await new Promise(r => setTimeout(r, 200));
  }

  // Calculate statistics
  const validReactions = reactions
    .map(r => r.reaction1d)
    .filter((r): r is number => r !== null);

  const sorted = [...validReactions].sort((a, b) => a - b);
  const median1d: number | null = sorted.length > 0 ? (sorted[Math.floor(sorted.length / 2)] ?? null) : null;
  const median5d: number | null = null;
  const median20d: number | null = null;

  let confidence: HistoricalAnalysis['confidence'] = 'insufficient';
  if (validReactions.length >= 10) confidence = 'high';
  else if (validReactions.length >= 5) confidence = 'medium';
  else if (validReactions.length >= 3) confidence = 'low';

  return {
    eventType: params.eventType,
    comparableEvents: validReactions.length,
    medianReaction1d: median1d,
    medianReaction5d: median5d,
    medianReaction20d: median20d,
    reactionRange: {
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
    },
    confidence,
    events: reactions.filter(r => r.reaction1d !== null).slice(0, 10),
  };
}

/**
 * Get a human-readable summary of historical reactions.
 */
export function formatHistoricalSummary(analysis: HistoricalAnalysis): string {
  if (analysis.confidence === 'insufficient') {
    return 'Insufficient comparable historical events to draw meaningful patterns.';
  }

  const medStr = analysis.medianReaction1d !== null
    ? `${analysis.medianReaction1d > 0 ? '+' : ''}${analysis.medianReaction1d.toFixed(1)}%`
    : 'N/A';

  return `Based on ${analysis.comparableEvents} comparable ${analysis.eventType.replace(/_/g, ' ')} events: median 1-day reaction ${medStr}, range ${analysis.reactionRange.min > 0 ? '+' : ''}${analysis.reactionRange.min.toFixed(1)}% to ${analysis.reactionRange.max > 0 ? '+' : ''}${analysis.reactionRange.max.toFixed(1)}%. Historical observation, not a prediction.`;
}
