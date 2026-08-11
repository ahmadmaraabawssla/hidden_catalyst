/**
 * USPTO Patent Grants — Real API Connector
 * Uses USPTO Open Data API (free, no key required).
 * Rate limit: ~100 requests/day for unauthenticated.
 */

import { BaseConnector, type RawDocument, type ExtractionResult } from './base';
import type { PrismaClient } from '@hidden-catalyst/db';

const USPTO_BASE = 'https://developer.uspto.gov/ibd-api/v1/';

export class USPTOConnector extends BaseConnector {
  constructor(prisma: PrismaClient) {
    super(prisma, {
      sourceId: 'source_uspto',
      name: 'USPTO Patent Grants',
      family: 'patents',
      schedule: '0 0 * * 0',
      rateLimitPerMinute: 10,
      retryPolicy: { maxAttempts: 3, backoffMs: 300000 },
    });
  }

  async fetchDocuments(since?: Date): Promise<RawDocument[]> {
    const companies = await this.prisma.company.findMany({
      where: { cik: { not: null } },
      select: { displayName: true },
      take: 50,
    });

    if (companies.length === 0) return [];
    const results: RawDocument[] = [];

    for (const company of companies) {
      try {
        // Use USPTO's patent grant search API
        const query = encodeURIComponent(`"${company.displayName.slice(0, 30)}"`);
        const url = `https://api.uspto.gov/patent/search?query=${query}&limit=3`;
        const res = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;

        const data = await res.json();
        const patents = data?.patents || data?.results || [];

        for (const patent of patents) {
          const patNum = patent.patentNumber || patent.patent_number || '';
          const title = patent.inventionTitle || patent.title || 'Patent Grant';
          const assignee = patent.assigneeEntityName || patent.assignee || '';

          results.push({
            canonicalUrl: `https://patents.google.com/patent/US${patNum}`,
            title: `USPTO Patent ${patNum}: ${title}`.slice(0, 200),
            text: `USPTO granted patent ${patNum} to ${assignee || company.displayName}. Title: ${title}.`,
            publishedAt: patent.grantDate ? new Date(patent.grantDate) : new Date(),
            metadata: { patentNumber: patNum, assignee, title },
          });
        }
      } catch {}
      await new Promise(r => setTimeout(r, 300));
    }

    return results;
  }

  async extract(doc: RawDocument): Promise<ExtractionResult> {
    return {
      signals: [{
        source: 'uspto',
        sourceType: 'patent_grant',
        externalId: (doc.metadata as any)?.patentNumber || doc.canonicalUrl,
        publishedAt: doc.publishedAt,
        retrievedAt: new Date(),
        title: doc.title,
        rawText: doc.text,
        entities: [
          { name: (doc.metadata as any)?.assignee || 'Patent assignee', type: 'company', confidence: 0.65 },
          { name: (doc.metadata as any)?.patentNumber || 'Patent', type: 'patent', confidence: 1 },
          { name: 'U.S. Patent and Trademark Office', type: 'agency', confidence: 1 },
        ],
        eventType: 'patent_grant',
        amounts: [],
        dates: [{ value: doc.publishedAt.toISOString().slice(0, 10), label: 'grant_date', confidence: 0.9 }],
        locations: [],
        sourceUrl: doc.canonicalUrl,
        sourceQuality: 90,
        rawMetadata: (doc.metadata || {}) as Record<string, unknown>,
      }],
      entities: [{ name: 'U.S. Patent and Trademark Office', type: 'agency' }],
      events: [{ eventType: 'patent_grant', title: doc.title, occurredAt: doc.publishedAt }],
      relationships: [],
      claims: [{ claimType: 'verified_fact', text: doc.text.slice(0, 500), excerpt: doc.text.slice(0, 200), confidence: 0.99 }],
    };
  }
}
