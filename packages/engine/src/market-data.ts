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

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface FinancialDenominators {
  revenue: number | null;
  cash: number | null;
  assets: number | null;
  enterpriseValue: number | null;
  currentShares: number | null;
}

const NULL_FINANCIALS: FinancialDenominators = {
  revenue: null,
  cash: null,
  assets: null,
  enterpriseValue: null,
  currentShares: null,
};

/**
 * Fetch revenue / cash / assets / shares from FMP income-statement and
 * balance-sheet statements, compute enterprise value, and cache the result
 * into security.attributes so computeMateriality() has a real denominator
 * (stops returning UNKNOWN). Returns the computed denominators.
 */
export async function enrichFinancialDenominators(
  security: { id: string; ticker: string; marketCap: number | null }
): Promise<FinancialDenominators> {
  const key = fmpKey();
  if (!key) return NULL_FINANCIALS;

  try {
    const [incRes, bsRes] = await Promise.all([
      fetch(`${FMP}/income-statement?symbol=${security.ticker}&period=annual&limit=1&apikey=${key}`),
      fetch(`${FMP}/balance-sheet-statement?symbol=${security.ticker}&period=annual&limit=1&apikey=${key}`),
    ]);
    const inc = incRes.ok ? (await incRes.json()) : [];
    const bs = bsRes.ok ? (await bsRes.json()) : [];
    const income = Array.isArray(inc) ? inc[0] : null;
    const balance = Array.isArray(bs) ? bs[0] : null;

    const revenue = numberOrNull(income?.revenue);
    // cashAndShortTermInvestments is the broadest cash measure and already
    // includes cashAndCashEquivalents — use it directly, do not sum both.
    const rawCash = numberOrNull(balance?.cashAndShortTermInvestments ?? balance?.cashAndCashEquivalents);
    const assets = numberOrNull(balance?.totalAssets);
    const totalDebt = numberOrNull(balance?.totalDebt);

    // ── P0 guard: cash cannot exceed total assets ──
    // FMP occasionally returns cashAndShortTermInvestments in THOUSANDS while
    // totalAssets is in dollars (observed on KOPN: cash $61.6B vs assets $108M;
    // PBT: cash $1.7B vs assets $1.9M). A corrupted cash figure flows straight
    // into "liability / cash" materiality and into a bogus negative enterprise
    // value. Cash is a strict subset of assets, so `cash > assets` is impossible
    // — detect it and recover the units error (÷1000) when that makes the value
    // plausible, otherwise null it so the denominator degrades to UNKNOWN
    // instead of corrupting the ratio.
    let cash = rawCash;
    if (cash != null && assets != null) {
      if (cash > assets && cash / 1000 <= assets * 1.05) {
        // Units error: FMP reported in thousands (e.g. 61,627,146,000 → $61.6M).
        cash = cash / 1000;
      } else if (cash > assets) {
        // Implausible and not a clean units error — do not trust it.
        cash = null;
      }
    }

    const currentShares = numberOrNull(income?.weightedAverageShsOutDil ?? income?.weightedAverageShsOut);
    const marketCap = security.marketCap ?? null;
    const enterpriseValue =
      marketCap != null && totalDebt != null && cash != null
        ? marketCap + totalDebt - cash
        : marketCap;

    const patch = {
      revenue,
      cash,
      assets,
      totalDebt,
      currentShares,
      enterpriseValue,
      financials_asof: new Date().toISOString(),
    };

    await prisma.$executeRaw`UPDATE securities SET attributes = COALESCE(attributes, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb, updated_at = NOW() WHERE id = ${security.id}`;

    return { revenue, cash, assets, enterpriseValue, currentShares };
  } catch {
    return NULL_FINANCIALS;
  }
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
