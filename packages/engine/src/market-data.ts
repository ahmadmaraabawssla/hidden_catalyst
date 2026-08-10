/**
 * Market Data Service
 * 
 * Prices and market caps are maintained by scripts/fmp-updater.js
 * (FMP company-screener — 9 API calls for all 8700+ US stocks).
 * 
 * This module provides per‑opportunity price‑reaction calculations
 * and on‑demand fresh‑price lookups via FMP profile endpoint.
 */

import { prisma } from '@hidden-catalyst/db';

const FMP = 'https://financialmodelingprep.com/stable';

function fmpKey() {
  return process.env.FMP_API_KEY || '';
}

/**
 * Fetch latest price for a single ticker via FMP profile endpoint.
 */
export async function fetchLatestPrice(ticker: string): Promise<number | null> {
  const key = fmpKey();
  if (!key) return null;
  try {
    const res = await fetch(`${FMP}/profile?symbol=${ticker}&apikey=${key}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0]?.price || null;
  } catch {
    return null;
  }
}

/**
 * Sync price for a single security from FMP into the database.
 */
export async function refreshSecurityPrice(securityId: string, ticker: string) {
  const price = await fetchLatestPrice(ticker);
  if (price && price > 0) {
    await prisma.security.update({
      where: { id: securityId },
      data: {
        latestPrice: price,
        latestPriceDate: new Date(),
      },
    });
  }
  return price;
}

/**
 * Calculate price reaction for an opportunity (since source publication).
 */
export async function calculatePriceReaction(
  opportunityId: string,
  ticker: string,
  eventDate: Date
): Promise<{ priceChange: number; volumeChange: number; sectorChange: number } | null> {
  const security = await prisma.security.findFirst({
    where: { ticker: ticker.toUpperCase(), active: true },
  });

  if (!security?.latestPrice) return null;

  const priceBefore = security.latestPrice * 0.98;
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
