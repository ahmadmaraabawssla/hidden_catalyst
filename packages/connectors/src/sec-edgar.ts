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
    const sinceDate = since || new Date(Date.now() - 7 * 86400000);
    const maxCompanies = Number(process.env.SEC_SCAN_LIMIT || 500);

    // Only listed companies with a CIK and at least one active security on a
    // major exchange. Sort by market cap ascending (smallest = most likely
    // overlooked) and bound the universe — a full 8k-company scan is too slow
    // for a scheduled run and the marginal value of larger caps is low.
    const companies = await this.prisma.company.findMany({
      where: {
        cik: { not: null },
        securities: { some: { active: true, exchange: { in: ['NYSE', 'NASDAQ', 'NYSE American'] } } },
      },
      take: maxCompanies,
      select: {
        cik: true,
        displayName: true,
        securities: { where: { active: true }, select: { ticker: true, exchange: true, marketCap: true }, take: 1 },
      },
    });

    // Prefer smallest market cap within the bounded set
    companies.sort((a, b) =>
      (a.securities[0]?.marketCap ?? Number.MAX_SAFE_INTEGER) -
      (b.securities[0]?.marketCap ?? Number.MAX_SAFE_INTEGER)
    );

    if (companies.length === 0) return [];

    console.log(`[SEC EDGAR] Checking ${companies.length} listed companies (bounded to ${maxCompanies}) for recent filings...`);

    const materialForms = new Set(['8-K', '10-Q', '10-K', 'S-1', '13D', '13G']);
    const skipForms = new Set(['3', '4', '5', '3/A', '4/A', '144', 'N-PX', 'NPORT-P', 'N-CSR', 'N-CSRS', '6-K', 'ARS', 'CERT', '25', '8-A12B', 'PX14A6G', 'S-8', '424B2', 'FWP', '25-NSE', 'SD']);
    const documents: RawDocument[] = [];
    let requestFailures = 0;

    for (const company of companies) {
      const cik = String(company.cik).padStart(10, '0');
      try {
        const response = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
          headers: {
            'User-Agent': 'Hidden Catalyst Research contact@hiddencatalyst.com',
            'Accept-Encoding': 'gzip, deflate',
          },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          requestFailures++;
          continue;
        }

        const data = await response.json();
        const recent = data?.filings?.recent;
        if (!recent?.form) continue;

        // Most recent material filing within the window (one per company)
        for (let i = 0; i < Math.min(10, recent.form.length); i++) {
          const rawForm = (recent.form[i] || '').toUpperCase();
          const form = rawForm.replace(/\/A$/, '');
          if (!materialForms.has(form) || skipForms.has(rawForm)) continue;

          const filed = recent.filingDate[i] || '';
          if (!filed) continue;
          const filedDate = new Date(filed);
          if (filedDate < sinceDate) continue;

          const accession = recent.accessionNumber[i] || '';
          documents.push({
            canonicalUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, '')}/${accession}.txt`,
            title: `Form ${form} — ${company.displayName}`,
            text: '',
            publishedAt: filedDate,
            metadata: {
              cik,
              accessionNumber: accession,
              formType: form,
              displayName: company.displayName,
              ticker: company.securities[0]?.ticker || null,
              exchange: company.securities[0]?.exchange || null,
            },
          });
          break;
        }

        await this.throttle();
      } catch {
        requestFailures++;
      }
    }

    if (requestFailures === companies.length) throw new Error('SEC EDGAR failed for every company in the scan universe.');

    console.log(`[SEC EDGAR] Found ${documents.length} recent filings; requestFailures=${requestFailures}`);
    return documents;
  }

  private throttle(): Promise<void> {
    // SEC requires ≤10 requests/sec; use a conservative 100ms spacing.
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  async extract(doc: RawDocument): Promise<ExtractionResult> {
    const text = doc.text.toLowerCase();
    const result: ExtractionResult = {
      signals: [{
        source: 'sec_edgar',
        sourceType: 'sec_filing',
        externalId: (doc.metadata as any)?.accessionNumber || doc.canonicalUrl,
        publishedAt: doc.publishedAt,
        retrievedAt: new Date(),
        title: doc.title,
        rawText: doc.text,
        entities: [
          {
            name: (doc.metadata as any)?.displayName || 'SEC registrant',
            type: 'company',
            identifiers: { cik: (doc.metadata as any)?.cik || '' },
            confidence: 0.9,
          },
        ],
        eventType: (doc.metadata as any)?.formType || 'sec_filing',
        amounts: this.extractDollarAmounts(doc.text),
        dates: [{ value: doc.publishedAt.toISOString().slice(0, 10), label: 'filing_date', confidence: 1 }],
        locations: [],
        sourceUrl: doc.canonicalUrl,
        sourceQuality: 88,
        rawMetadata: (doc.metadata || {}) as Record<string, unknown>,
      }],
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

  private extractDollarAmounts(text: string) {
    const amounts: Array<{ value: number; currency: string; label: string; confidence: number }> = [];
    const re = /\$\s?(\d+(?:\.\d+)?)\s?(million|billion|m|b)?/ig;
    let match;
    while ((match = re.exec(text)) && amounts.length < 10) {
      let value = Number(match[1]);
      const unit = (match[2] || '').toLowerCase();
      if (unit === 'billion' || unit === 'b') value *= 1e9;
      if (unit === 'million' || unit === 'm') value *= 1e6;
      amounts.push({ value, currency: 'USD', label: match[0], confidence: 0.7 });
    }
    return amounts;
  }
}
