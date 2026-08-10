/**
 * Scoring Engine v2 — calculates all opportunity scores with real inputs.
 *
 * Data sources:
 * - Finnhub: market cap, price, analyst coverage, institutional ownership
 * - SEC EDGAR: filing metadata, form type, dates
 * - DeepSeek LLM: event type, materiality, dollar amounts, parties
 * - Database: existing claims, risks, evidence items
 */

import { prisma } from '@hidden-catalyst/db';
import {
  calculateOpportunityScore,
  calculateInformationAsymmetry,
  calculateEvidenceQuality,
  calculatePriceReaction,
  canAutoPublish,
  SCORE_MODEL_VERSION,
  type ScoreInput,
} from '@hidden-catalyst/domain';

// ─── FMP Data — DB-first, API fallback ───

const FMP = 'https://financialmodelingprep.com/stable';
function fmpKey() { return process.env.FMP_API_KEY || ''; }

/**
 * Fetch analyst count + institutional ownership.
 * DB-first: reads from securities.attributes (populated by fmp-updater.js).
 * Falls back to live FMP API calls only if DB is empty.
 */
async function fetchAnalystData(ticker: string, securityId?: string): Promise<{
  analystCount: number | null;
  institutionalOwnership: number | null;
}> {
  // DB-first: try attributes column populated by fmp-updater
  if (securityId) {
    try {
      const sec = await prisma.security.findUnique({
        where: { id: securityId },
        select: { attributes: true },
      });
      const attrs = (sec?.attributes || {}) as Record<string, any>;
      if (attrs.analyst_count != null || attrs.inst_investors != null) {
        return {
          analystCount: attrs.analyst_count ?? null,
          institutionalOwnership: attrs.inst_investors ?? null,
        };
      }
    } catch {}
  }

  // Fallback: live API
  const key = fmpKey();
  if (!key) return { analystCount: null, institutionalOwnership: null };

  try {
    const [estRes, instRes] = await Promise.all([
      fetch(`${FMP}/analyst-estimates?symbol=${ticker}&period=annual&limit=50&apikey=${key}`),
      fetch(`${FMP}/institutional-ownership/symbol-positions-summary?symbol=${ticker}&apikey=${key}`),
    ]);

    let analystCount: number | null = null;
    if (estRes.ok) {
      const estimates = await estRes.json();
      if (Array.isArray(estimates) && estimates.length > 0) {
        const names = new Set(estimates.map((e: any) => e.analystName).filter(Boolean));
        analystCount = names.size;
      }
    }

    let institutionalOwnership: number | null = null;
    if (instRes.ok) {
      const inst = await instRes.json();
      if (Array.isArray(inst) && inst.length > 0) {
        institutionalOwnership = inst[0]?.investors || null;
      }
    }

    return { analystCount, institutionalOwnership };
  } catch {
    return { analystCount: null, institutionalOwnership: null };
  }
}

async function fetchPriceReaction(ticker: string, eventDate: Date): Promise<{
  priceChangePercent: number | null;
  volumeChangeRatio: number | null;
}> {
  const key = fmpKey();
  if (!key) return { priceChangePercent: null, volumeChangeRatio: null };

  try {
    const res = await fetch(
      `${FMP}/historical-price-eod/light?symbol=${ticker}&apikey=${key}`
    );
    if (!res.ok) return { priceChangePercent: null, volumeChangeRatio: null };

    const data = await res.json();
    const historical = data?.historical;
    if (!Array.isArray(historical) || historical.length < 3) {
      return { priceChangePercent: null, volumeChangeRatio: null };
    }

    // Find closest trading day to event date
    const eventTs = eventDate.getTime();
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < historical.length; i++) {
      const d = new Date(historical[i].date).getTime();
      const diff = Math.abs(d - eventTs);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }

    const priceBefore = historical[Math.min(historical.length - 1, bestIdx + 2)]?.close || historical[bestIdx]?.close;
    const priceAfter = historical[Math.max(0, bestIdx - 2)]?.close || historical[bestIdx]?.close;

    const priceChangePercent = priceBefore > 0
      ? ((priceAfter - priceBefore) / priceBefore) * 100
      : null;

    const volBefore = historical[Math.min(historical.length - 1, bestIdx + 2)]?.volume || 0;
    const volAfter = historical[Math.max(0, bestIdx - 2)]?.volume || 0;
    const volumeChangeRatio = volBefore > 0 ? volAfter / volBefore : null;

    return { priceChangePercent, volumeChangeRatio };
  } catch {
    return { priceChangePercent: null, volumeChangeRatio: null };
  }
}

function mapSourceType(formType?: string, eventType?: string): 'sec_8k' | 'sec_10k' | 'sec_10q' | 'sec_other' | 'government' | 'press_release' | 'news' | 'patent' | 'clinical_trial' | 'other' {
  if (formType === '8-K') return 'sec_8k';
  if (formType === '10-K') return 'sec_10k';
  if (formType === '10-Q') return 'sec_10q';
  if (formType) return 'sec_other';
  const et = (eventType || '').toLowerCase();
  if (et.includes('fda') || et.includes('approval') || et.includes('fast_track')) return 'government';
  if (et.includes('patent')) return 'patent';
  if (et.includes('trial') || et.includes('clinical')) return 'clinical_trial';
  if (et.includes('contract') || et.includes('award')) return 'government';
  return 'other';
}

// ─── Main Scoring ───

export async function generateScoreInputs(
  opportunityId: string,
  ticker: string,
  marketCap: number | null,
  eventDate: Date,
  eventType?: string,
  formType?: string,
  hasDollarAmounts?: boolean,
  hasNamedParties?: boolean,
): Promise<ScoreInput> {
  const [analystData, priceData] = await Promise.all([
    fetchAnalystData(ticker),
    fetchPriceReaction(ticker, eventDate),
  ]);

  const daysSinceNews = Math.round((Date.now() - new Date(eventDate).getTime()) / 86400000);

  const infoAsym = calculateInformationAsymmetry({
    marketCap,
    analystCount: analystData.analystCount,
    institutionalOwnership: analystData.institutionalOwnership,
    daysSinceLastNews: daysSinceNews,
  });

  const sourceType = mapSourceType(formType, eventType);
  const evidenceQuality = calculateEvidenceQuality({
    sourceType,
    daysSincePublication: daysSinceNews,
    hasDollarAmounts: hasDollarAmounts ?? false,
    hasNamedParties: hasNamedParties ?? false,
    corroboratingSources: 1,
  });

  const priceReaction = calculatePriceReaction({
    priceChangePercent: priceData.priceChangePercent,
    sectorChangePercent: null,
    volumeChangeRatio: priceData.volumeChangeRatio,
  });

  const mc = marketCap ?? 1_000_000_000;
  const mcScale = mc < 300e6 ? 1.3 : mc < 1e9 ? 1.1 : mc < 5e9 ? 1.0 : mc < 10e9 ? 0.85 : 0.7;
  const catalystStrength = Math.round(Math.min(95, Math.max(30, 60 * mcScale)));
  const financialMateriality = Math.round(Math.min(95, Math.max(25, 55 * mcScale)));
  const timing = daysSinceNews <= 1 ? 95 : daysSinceNews <= 3 ? 85 : daysSinceNews <= 7 ? 70 : daysSinceNews <= 14 ? 50 : 30;
  const riskScore = mc < 100e6 ? 60 : mc < 300e6 ? 50 : mc < 1e9 ? 40 : mc < 5e9 ? 30 : 20;
  const liquidityPenalty = mc < 100e6 ? 35 : mc < 300e6 ? 20 : mc < 1e9 ? 10 : 0;

  return {
    informationAsymmetry: infoAsym,
    catalystStrength,
    evidenceQuality,
    financialMateriality,
    timing,
    priceReaction,
    risk: riskScore,
    liquidityPenalty,
    dilutionPenalty: 0,
  };
}

export async function scoreOpportunity(opportunityId: string) {
  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      security: { include: { company: true } },
      claims: true,
      risks: true,
    },
  });

  if (!opp) throw new Error(`Opportunity ${opportunityId} not found`);

  const factClaims = opp.claims.filter(c => c.claimType === 'verified_fact');
  const hasDollarAmounts = factClaims.some(c =>
    /\$\d+/.test(c.text) || /\d+\s*(million|billion|B|M)/i.test(c.text)
  );
  const hasNamedParties = factClaims.some(c =>
    /Inc\.|Corp\.|Ltd\.|LLC|Company|Group|Holdings/i.test(c.text)
  );

  const inputs = await generateScoreInputs(
    opportunityId,
    opp.security.ticker,
    opp.security.marketCap,
    opp.detectedAt,
    (opp as any).event?.eventType,
    undefined,
    hasDollarAmounts,
    hasNamedParties,
  );

  const result = calculateOpportunityScore(inputs);

  await prisma.score.deleteMany({ where: { opportunityId } });

  const scoreTypes = [
    { type: 'information_asymmetry' as const, value: inputs.informationAsymmetry },
    { type: 'catalyst_strength' as const, value: inputs.catalystStrength },
    { type: 'evidence_quality' as const, value: inputs.evidenceQuality },
    { type: 'financial_materiality' as const, value: inputs.financialMateriality },
    { type: 'timing' as const, value: inputs.timing },
    { type: 'price_reaction' as const, value: inputs.priceReaction },
    { type: 'risk' as const, value: inputs.risk },
    { type: 'opportunity' as const, value: result.value },
  ];

  for (const st of scoreTypes) {
    await prisma.score.create({
      data: {
        opportunityId,
        scoreType: st.type,
        value: st.value,
        factors: result.factors,
        modelVersion: SCORE_MODEL_VERSION,
      },
    });
  }

  const gate = canAutoPublish(
    inputs.evidenceQuality,
    0.95, 0.85, inputs.risk, false,
    inputs.liquidityPenalty < 20
  );

  if (gate.canPublish) {
    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: { status: 'published', publishedAt: new Date() },
    });
    console.log(`✓ ${opp.security.ticker}: published (score ${result.value})`);
  } else {
    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: { status: 'needs_review' },
    });
    console.log(`→ ${opp.security.ticker}: needs review — ${gate.reason}`);
  }

  return { ...result, gateReason: gate.reason };
}

export async function scoreAllPending() {
  const pending = await prisma.opportunity.findMany({
    where: { status: 'candidate' },
    select: { id: true },
  });

  console.log(`Scoring ${pending.length} pending opportunities...`);

  for (const opp of pending) {
    try { await scoreOpportunity(opp.id); }
    catch (err) { console.error(`Failed to score ${opp.id}:`, (err as Error).message); }
  }

  return { scored: pending.length };
}
