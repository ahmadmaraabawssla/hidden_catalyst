/**
 * SAM.gov Federal Contracts — Real API Connector
 * Uses SAM.gov Opportunities API (free registration required).
 * Falls back to USASpending.gov API (fully open, no key required).
 */

import { BaseConnector, type RawDocument, type ExtractionResult } from './base';
import { computeIgnoredScore } from '@hidden-catalyst/domain';
import type { PrismaClient } from '@hidden-catalyst/db';

const USASPENDING_BASE = 'https://api.usaspending.gov/api/v2';

export class FederalContractsConnector extends BaseConnector {
  constructor(prisma: PrismaClient) {
    super(prisma, {
      sourceId: 'source_sam_gov',
      name: 'SAM.gov Federal Contracts',
      family: 'federal_contracts',
      schedule: '0 */6 * * *',
      rateLimitPerMinute: 30,
      retryPolicy: { maxAttempts: 3, backoffMs: 60000 },
    });
  }

  async fetchDocuments(since?: Date): Promise<RawDocument[]> {
    const maxCompanies = Number(process.env.CONTRACT_COMPANY_LIMIT || 100);
    const maxCap = Number(process.env.DISCOVERY_MAX_MARKET_CAP || 20_000_000_000);

    // ── Underfollowed-company selection ──
    // A $2M contract at a $188B company is NOT a hidden catalyst. Only discover
    // contracts for companies that are actually underfollowed: below the market
    // cap ceiling AND ranked by ignored-score (news + dollar volume + cap).
    // This replaces the old "first 100 companies with a CIK" behavior which
    // surfaced mega-caps like Abbott/Caterpillar/ADM as if they were obscure.
    const universe = await this.prisma.company.findMany({
      where: {
        cik: { not: null },
        securities: {
          some: {
            active: true,
            exchange: { in: ['NYSE', 'NASDAQ', 'NYSE American'] },
            marketCap: { lte: maxCap },
          },
        },
      },
      select: {
        displayName: true,
        securities: {
          where: { active: true },
          select: { ticker: true, marketCap: true, avgDollarVolume: true, attributes: true },
          take: 1,
        },
      },
    });

    const ranked = universe
      .map((company) => {
        const sec = company.securities[0];
        const attrs = (sec?.attributes ?? {}) as Record<string, unknown>;
        return {
          company,
          score: computeIgnoredScore({
            news7d: toNumber(attrs.news_7d),
            avgDollarVolume: sec?.avgDollarVolume ?? toNumber(attrs.avg_dollar_volume),
            marketCap: sec?.marketCap ?? toNumber(attrs.market_cap),
          }),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxCompanies)
      .map((r) => r.company);

    if (ranked.length === 0) return [];
    const results: RawDocument[] = [];

    // Freshness window: a federal contract is a "fresh" catalyst only if its
    // record was modified recently. USASpending's `Action Date` is null for
    // aggregated prime awards, but `Last Modified Date` is populated and reflects
    // when the award record actually changed (e.g. an amendment). We enforce the
    // window on `Last Modified Date`, not the period-of-performance start date.
    const scanWindowMs = 45 * 86400000; // 45 days — slightly wider than the API filter for safety
    const cutoff = (since || new Date(Date.now() - scanWindowMs)).getTime();
    const now = Date.now();
    const scanStart = (since || new Date(Date.now() - 30 * 86400000)).toISOString().slice(0, 10);

    for (const company of ranked) {
      try {
        // USASpending.gov — free, no key, searches federal awards by recipient
        const url = `${USASPENDING_BASE}/search/spending_by_award/`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filters: {
              recipient_search_text: [company.displayName.slice(0, 80)],
              time_period: [{
                start_date: scanStart,
                end_date: new Date().toISOString().slice(0, 10),
              }],
              award_type_codes: ['A', 'B', 'C', 'D'],
            },
            fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Total Obligation', 'potential_total_value_of_award', 'Awarding Agency', 'Description', 'Start Date', 'End Date', 'Action Date', 'Last Modified Date'],
            page: 1,
            limit: 5,
            subawards: false,
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;

        const data = await res.json();
        const awards = data?.results || [];

        for (const award of awards) {
          // ── Obligated vs ceiling ──
          // "Total Obligation" is what's actually committed/spent. "potential_
          // total_value_of_award" (or "Award Amount" for IDIQs) is the ceiling —
          // NOT guaranteed revenue. Materiality must use the OBLIGATED amount, or
          // an immaterial-looking ceiling will be overstated as real dollars.
          const obligatedRaw = award?.['Total Obligation'] ?? award?.total_obligation ?? award?.obligated_amount ?? null;
          const ceilingRaw = award?.potential_total_value_of_award ?? award?.['Award Amount'] ?? award?.award_amount ?? null;
          const obligated = Number(obligatedRaw || 0) || null;
          const ceiling = Number(ceilingRaw || 0) || null;
          // Conservative primary: prefer obligated; fall back to the award amount
          // (ceiling) only when obligation is unavailable, and flag the ambiguity.
          const amount = obligated ?? ceiling ?? 0;
          const amountIsCeiling = obligated == null && ceiling != null;

          const agency = award?.['Awarding Agency'] || award?.awarding_agency_name || award?.awarding_agency?.toptier_agency?.name || 'Federal Agency';
          const desc = award?.Description || award?.description || award?.award_description || 'Federal contract award';
          const awardId = award?.generated_internal_id || award?.['Award ID'] || award?.award_id || '';

          // Use the award's actual recipient name, not the searched company, so
          // title and entity stay consistent when USASpending's fuzzy search
          // cross-matches a different recipient (e.g. BALL Corp search → BAE award).
          const recipient = award?.['Recipient Name'] || company.displayName;

          if (amount < 100000) continue; // Filter noise

          // ── Freshness guard: drop awards whose record was not modified recently ──
          // The period-of-performance `Start Date` is the award's original start
          // (often decades ago) and is kept as the event date so materiality can
          // flag stale denominators. Recency is judged by `Last Modified Date`,
          // which is the only reliable "did this just change" signal the endpoint
          // provides. Drop when the modified date is missing, older than the
          // window, or in the future (malformed).
          const lastModifiedRaw = award?.['Last Modified Date'] ?? award?.last_modified_date;
          const lastModifiedMs = lastModifiedRaw ? new Date(lastModifiedRaw).getTime() : NaN;
          if (!Number.isFinite(lastModifiedMs) || lastModifiedMs < cutoff || lastModifiedMs > now) continue;

          // Event date = period-of-performance start (honest "when the contract
          // began"); falls back to the modification date if no start date.
          const startRaw = award?.['Start Date'];
          const startMs = startRaw ? new Date(startRaw).getTime() : NaN;
          const publishedAt = Number.isFinite(startMs) ? new Date(startMs) : new Date(lastModifiedMs);

          results.push({
            canonicalUrl: `https://www.usaspending.gov/award/${awardId}`,
            title: `Federal Contract: ${agency} — ${recipient}`.slice(0, 200),
            text: `${agency} awarded contract to ${recipient}. Obligated: $${(amount / 1e6).toFixed(1)}M${ceiling != null && ceiling !== amount ? ` (ceiling $${(ceiling / 1e6).toFixed(1)}M)` : ''}. ${desc}`.slice(0, 500),
            publishedAt,
            metadata: {
              agency, amount, obligated, ceiling, awardId, recipient,
              amountIsCeiling,
              period: award?.period_of_performance || { start: award?.['Start Date'], end: award?.['End Date'] },
              amendment: award?.modification_number,
              lastModifiedDate: lastModifiedRaw || null,
            },
          });
        }
      } catch {}
      await new Promise(r => setTimeout(r, 200));
    }

    return results;
  }

  async extract(doc: RawDocument): Promise<ExtractionResult> {
    const text = doc.text.toLowerCase();
    const amount = Number((doc.metadata as any)?.amount || 0);
    const agencyName = (doc.metadata as any)?.agency || 'Federal Agency';
    const companyName = (doc.metadata as any)?.recipient || 'Contractor';
    const result: ExtractionResult = {
      signals: [{
        source: 'usaspending',
        sourceType: 'federal_contract',
        externalId: (doc.metadata as any)?.awardId || doc.canonicalUrl,
        publishedAt: doc.publishedAt,
        retrievedAt: new Date(),
        title: doc.title,
        rawText: doc.text,
        entities: [
          { name: companyName, type: 'company', confidence: 0.7 },
          { name: agencyName, type: 'agency', confidence: 0.95 },
        ],
        eventType: 'contract_award',
        amounts: amount > 0 ? [{ value: amount, currency: 'USD', label: 'award_amount', confidence: 0.9 }] : [],
        dates: [{ value: doc.publishedAt.toISOString().slice(0, 10), label: 'award_date', confidence: 0.8 }],
        locations: [],
        sourceUrl: doc.canonicalUrl,
        sourceQuality: 95,
        rawMetadata: (doc.metadata || {}) as Record<string, unknown>,
      }],
      entities: [],
      events: [],
      relationships: [],
      claims: [],
    };

    result.entities.push({ name: agencyName, type: 'agency' });
    result.events.push({ eventType: 'contract_award', title: doc.title, occurredAt: doc.publishedAt });
    result.relationships.push({
      fromEntityName: companyName,
      toEntityName: agencyName,
      relationshipType: 'awarded_to',
      confidence: 0.95,
    });
    result.claims.push({
      claimType: 'verified_fact',
      text: doc.text.slice(0, 500),
      excerpt: doc.text.slice(0, 200),
      confidence: 0.98,
    });

    return result;
  }
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
