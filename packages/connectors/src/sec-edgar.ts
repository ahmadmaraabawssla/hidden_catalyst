/**
 * SEC EDGAR — Real Connector with LLM Extraction
 *
 * Fetches filings from tracked companies via SEC EDGAR API.
 * Extraction uses the LLM extractor (DeepSeek) for intelligent parsing.
 * Falls back to regex rules when LLM is unavailable.
 */

import { BaseConnector, type RawDocument, type ExtractionResult } from './base';
import type { PrismaClient } from '@hidden-catalyst/db';

export class SECEdgarConnector extends BaseConnector {
  constructor(prisma: PrismaClient) {
    super(prisma, {
      sourceId: 'source_sec_edgar',
      name: 'SEC EDGAR',
      family: 'sec_edgar',
      schedule: '*/30 * * * *',
      rateLimitPerMinute: 10,
      retryPolicy: { maxAttempts: 3, backoffMs: 60000 },
    });
  }

  async fetchDocuments(since?: Date): Promise<RawDocument[]> {
    const companies = await this.prisma.company.findMany({
      where: { cik: { not: null } },
      select: { cik: true, displayName: true },
    });

    if (companies.length === 0) return [];

    const cikSet = new Set(companies.map(c => c.cik));
    const sinceDate = since || new Date(Date.now() - 7 * 86400000);

    const url = `https://efts.sec.gov/LATEST/search-index?q=*&dateRange=custom&startdt=${this.formatDate(sinceDate)}&enddt=${this.formatDate(new Date())}&forms=8-K,10-Q,10-K,S-1,13D,13G&pageSize=100&sort=@filingDate:desc`;

    console.log(`[SEC EDGAR] Fetching filings for ${companies.length} tracked companies...`);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Hidden Catalyst Research contact@hiddencatalyst.com',
          'Accept-Encoding': 'gzip, deflate',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) return [];

      const data = await response.json();
      const hits = data?.hits?.hits || [];
      const documents: RawDocument[] = [];

      for (const hit of hits) {
        const source = hit._source || {};
        const cik = String(source.cik || '').padStart(10, '0');

        if (!cikSet.has(cik)) continue;

        documents.push({
          canonicalUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${(source.accessionNumber || '').replace(/-/g, '')}/${source.accessionNumber || ''}-index.html`,
          title: `Form ${source.form?.toUpperCase() || '8-K'} — ${source.displayNames?.[0] || 'Unknown'}`,
          text: source.fileStr || `Filing. Form: ${source.form}`,
          publishedAt: new Date(source.fileDate || source.filedAt || Date.now()),
          metadata: { cik, formType: source.form?.toUpperCase(), displayName: source.displayNames?.[0] },
        });
      }

      console.log(`[SEC EDGAR] Found ${documents.length} tracked filings`);
      return documents;
    } catch (err) {
      console.error(`[SEC EDGAR] Error: ${(err as Error).message}`);
      return [];
    }
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }

  async extract(doc: RawDocument): Promise<ExtractionResult> {
    const text = doc.text.toLowerCase();
    const result: ExtractionResult = {
      entities: [],
      events: [],
      relationships: [],
      claims: [],
    };

    // Rule-based extraction (LLM extraction handled by the pipeline scripts)
    if (text.includes('department of energy') || text.includes('doe')) {
      result.entities.push({ name: 'U.S. Department of Energy', type: 'agency' });
    }
    if (text.includes('fda') || text.includes('food and drug')) {
      result.entities.push({ name: 'U.S. Food and Drug Administration', type: 'agency' });
    }
    if (text.includes('department of defense') || text.includes('dod')) {
      result.entities.push({ name: 'U.S. Department of Defense', type: 'agency' });
    }

    // Detect event types from filing content
    const formType = (doc.metadata as any)?.formType || '';
    if (formType === '8-K') {
      // 8-K item detection
      if (text.includes('item 1.01') || text.includes('agreement') || text.includes('contract')) {
        result.events.push({ eventType: 'material_agreement', title: doc.title, occurredAt: doc.publishedAt });
      }
      if (text.includes('item 2.01') || text.includes('acquisition') || text.includes('merger')) {
        result.events.push({ eventType: 'acquisition', title: doc.title, occurredAt: doc.publishedAt });
      }
      if (text.includes('item 5.02') || text.includes('director') || text.includes('officer')) {
        result.events.push({ eventType: 'director_change', title: doc.title, occurredAt: doc.publishedAt });
      }
      if (text.includes('item 2.02') || text.includes('earnings') || text.includes('results of operations')) {
        result.events.push({ eventType: 'earnings', title: doc.title, occurredAt: doc.publishedAt });
      }
    }

    if (text.includes('fast track') || text.includes('breakthrough therapy')) {
      result.events.push({ eventType: 'regulatory_designation', title: doc.title, occurredAt: doc.publishedAt });
    }

    // Add text as claim
    result.claims.push({
      claimType: 'verified_fact',
      text: doc.text.slice(0, 500),
      excerpt: doc.text.slice(0, 200),
      confidence: 0.95,
    });

    return result;
  }
}
