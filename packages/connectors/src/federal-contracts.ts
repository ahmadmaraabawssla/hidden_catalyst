/**
 * SAM.gov Federal Contracts — Real API Connector
 * Uses SAM.gov Opportunities API (free registration required).
 * Falls back to USASpending.gov API (fully open, no key required).
 */

import { BaseConnector, type RawDocument, type ExtractionResult } from './base';
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
    const companies = await this.prisma.company.findMany({
      where: { cik: { not: null } },
      select: { displayName: true },
      take: 100,
    });

    if (companies.length === 0) return [];
    const results: RawDocument[] = [];

    for (const company of companies) {
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
                start_date: (since || new Date(Date.now() - 30 * 86400000)).toISOString().slice(0, 10),
                end_date: new Date().toISOString().slice(0, 10),
              }],
              award_type_codes: ['A', 'B', 'C', 'D'],
            },
            fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Total Obligation', 'Awarding Agency', 'Description', 'Start Date', 'End Date'],
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
          const amount = award?.['Award Amount'] || award?.award_amount || award?.['Total Obligation'] || award?.total_obligation || 0;
          const obligations = award?.['Total Obligation'] || award?.total_obligation || award?.obligated_amount || null;
          const ceiling = award?.potential_total_value_of_award || award?.['Award Amount'] || award?.award_amount || null;
          const agency = award?.['Awarding Agency'] || award?.awarding_agency_name || award?.awarding_agency?.toptier_agency?.name || 'Federal Agency';
          const desc = award?.Description || award?.description || award?.award_description || 'Federal contract award';
          const awardId = award?.generated_internal_id || award?.['Award ID'] || award?.award_id || '';

          // Use the award's actual recipient name, not the searched company, so
          // title and entity stay consistent when USASpending's fuzzy search
          // cross-matches a different recipient (e.g. BALL Corp search → BAE award).
          const recipient = award?.['Recipient Name'] || company.displayName;

          if (amount < 100000) continue; // Filter noise

          results.push({
            canonicalUrl: `https://www.usaspending.gov/award/${awardId}`,
            title: `Federal Contract: ${agency} — ${recipient}`.slice(0, 200),
            text: `${agency} awarded contract to ${recipient}. Amount: $${(amount / 1e6).toFixed(1)}M. ${desc}`.slice(0, 500),
            publishedAt: award?.action_date ? new Date(award.action_date) : award?.['Start Date'] ? new Date(award['Start Date']) : new Date(),
            metadata: { agency, amount, obligations, ceiling, awardId, recipient, period: award?.period_of_performance || { start: award?.['Start Date'], end: award?.['End Date'] }, amendment: award?.modification_number },
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
