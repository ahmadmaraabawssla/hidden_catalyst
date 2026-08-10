/**
 * Market Data Service
 * 
 * Fetches price, volume, and market cap data for tracked securities.
 * 
 * In production, this would use:
 * - Polygon.io API (free tier: 5 calls/min, delayed data)
 * - Alpha Vantage (free tier: 25 calls/day)
 * - Yahoo Finance (unofficial, for dev only)
 * 
 * For MVP: Uses Yahoo Finance's unofficial API (no key needed, for dev/testing only).
 */

import { prisma } from '@hidden-catalyst/db';

interface MarketQuote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
  timestamp: Date;
}

/**
 * Fetch market data for a ticker from Yahoo Finance (unofficial API).
 * In production: swap for Polygon.io or Alpha Vantage.
 */
async function fetchQuoteYahoo(ticker: string): Promise<MarketQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0];
    const timestamps = result.timestamp;

    if (!meta || !quotes || !timestamps) return null;

    // Calculate price change
    const prices = quotes.close?.filter((p: number | null): p is number => p !== null) || [];
    const latestPrice = prices[prices.length - 1];
    const prevPrice = prices.length > 1 ? prices[prices.length - 2] : latestPrice;
    const change = latestPrice - prevPrice;
    const changePercent = prevPrice !== 0 ? (change / prevPrice) * 100 : 0;

    // Yahoo chart API does NOT return market cap — use FMP for that
    return {
      ticker,
      price: latestPrice,
      change,
      changePercent,
      volume: quotes.volume?.[quotes.volume.length - 1] || 0,
      avgVolume: 0,
      marketCap: 0,
      timestamp: new Date(timestamps[timestamps.length - 1] * 1000),
    };
  } catch {
    return null;
  }
}

/**
 * Update market data for all tracked securities.
 */
export async function updateAllMarketData() {
  const securities = await prisma.security.findMany({
    where: { active: true },
    select: { id: true, ticker: true },
  });

  console.log(`[Market Data] Updating ${securities.length} securities...`);

  for (const sec of securities) {
    try {
      const quote = await fetchQuoteYahoo(sec.ticker);
      if (!quote) continue;

      // Only update price & volume — Yahoo chart API does NOT return market cap.
      // Market cap should come from FMP (fmp-updater.js) or manual overrides.
      await prisma.security.update({
        where: { id: sec.id },
        data: {
          avgDollarVolume: quote.avgVolume * quote.price,
          latestPrice: quote.price,
          latestPriceDate: quote.timestamp,
        },
      });

      // Rate limit: be nice to free APIs
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.warn(`[Market Data] Failed ${sec.ticker}: ${(err as Error).message}`);
    }
  }

  console.log('[Market Data] Update complete');
}

/**
 * Calculate price reaction for an opportunity (since source publication).
 */
export async function calculatePriceReaction(
  opportunityId: string,
  ticker: string,
  eventDate: Date
): Promise<{ priceChange: number; volumeChange: number; sectorChange: number } | null> {
  // In production: fetch historical prices before/after event date
  // For MVP: use the stored latest price as a proxy
  const security = await prisma.security.findFirst({
    where: { ticker: ticker.toUpperCase(), active: true },
  });

  if (!security?.latestPrice) return null;

  // Placeholder: simple calculation
  const priceBefore = security.latestPrice * 0.98; // simulate -2% before
  const priceAfter = security.latestPrice;
  const priceChange = ((priceAfter - priceBefore) / priceBefore) * 100;

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      priceChangePercent: Math.round(priceChange * 100) / 100,
      priceReactionDate: new Date(),
    },
  });

  return {
    priceChange: Math.round(priceChange * 100) / 100,
    volumeChange: 0,
    sectorChange: 0,
  };
}

// CLI
if (require.main === module) {
  updateAllMarketData()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
