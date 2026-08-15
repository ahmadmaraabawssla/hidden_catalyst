/**
 * SEC EDGAR — Real Connector with LLM Extraction
 *
 * Fetches filings from tracked companies via SEC EDGAR API.
 * Extraction uses the LLM extractor (DeepSeek) for intelligent parsing.
 * Falls back to regex rules when LLM is unavailable.
 */

import { BaseConnector, type RawDocument, type ExtractionResult } from './base';
import { computeIgnoredScore } from '@hidden-catalyst/domain';
import { countNews7d } from './news-count';
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
    const minIgnoredScore = Number(process.env.SCAN_MIN_IGNORED_SCORE || 0);
    const minMarketCap = Number(process.env.SEC_MIN_MARKET_CAP || 10_000_000);
    const maxMarketCap = Number(process.env.DISCOVERY_MAX_MARKET_CAP || 20_000_000_000);
    const detectLimit = Number(process.env.SEC_DETECT_LIMIT || 8000);

    // ── Two-stage: DETECT first (cheap), then SCORE only the shortlist ──
    // Stage 1 detects "which companies filed something material recently" for
    // the whole universe (bounded by SEC_DETECT_LIMIT). Stage 2 fetches the
    // news count ONLY for companies that actually filed something, computes the
    // ignored score with real news data, and ranks. This avoids a 7,900-company
    // news backfill and puts the expensive/finite signal where it matters.
    const universe = await this.prisma.company.findMany({
      where: {
        cik: { not: null },
        securities: {
          some: {
            active: true,
            exchange: { in: ['NYSE', 'NASDAQ', 'NYSE American'] },
            marketCap: { gte: minMarketCap, lte: maxMarketCap },
          },
        },
      },
      select: {
        cik: true,
        displayName: true,
        securities: {
          where: { active: true },
          select: { ticker: true, exchange: true, marketCap: true, avgDollarVolume: true, attributes: true },
          take: 1,
        },
      },
      take: detectLimit,
    });

    const materialForms = new Set(['8-K', '10-Q', '10-K', 'S-1', '13D', '13G']);
    const skipForms = new Set(['3', '4', '5', '3/A', '4/A', '144', 'N-PX', 'NPORT-P', 'N-CSR', 'N-CSRS', '6-K', 'ARS', 'CERT', '25', '8-A12B', 'PX14A6G', 'S-8', '424B2', 'FWP', '25-NSE', '25', 'SD']);

    console.log(`[SEC EDGAR] Detect stage: checking ${universe.length} companies for recent material filings...`);

    // Stage 1: detect filings (no news fetch yet)
    const detected: Array<{
      company: (typeof universe)[number];
      security: NonNullable<(typeof universe)[number]['securities'][number]>;
      cik: string;
      form: string;
      filedDate: Date;
      accession: string;
    }> = [];

    for (const company of universe) {
      const cik = String(company.cik).padStart(10, '0');
      const security = company.securities[0];
      if (!security) continue;
      try {
        const response = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
          headers: {
            'User-Agent': 'Hidden Catalyst Research contact@hiddencatalyst.com',
            'Accept-Encoding': 'gzip, deflate',
          },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) continue;

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

          detected.push({ company, security, cik, form, filedDate, accession: recent.accessionNumber[i] || '' });
          break;
        }

        await this.throttle();
      } catch {
        // Skip companies that fail to fetch; continue the rest
      }
    }

    console.log(`[SEC EDGAR] Detected ${detected.length} companies with recent filings. Scoring news coverage...`);

    // Stage 2: fetch news count ONLY for the detected shortlist, rank by
    // ignored score (now with real news data), keep top SEC_SCAN_LIMIT.
    const hasFinnhub = !!process.env.FINNHUB_API_KEY;
    const scored = [];
    for (const d of detected) {
      let news7d: number | null = null;
      if (hasFinnhub) {
        const nc = await countNews7d(d.security.ticker || '', []);
        news7d = nc.available ? nc.total7d : null;
        await this.newsThrottle();
      }
      const attrs = (d.security.attributes ?? {}) as Record<string, unknown>;
      const ignoredScore = computeIgnoredScore({
        news7d: news7d ?? toNumber(attrs.news_7d),
        avgDollarVolume: d.security.avgDollarVolume ?? toNumber(attrs.avg_dollar_volume),
        marketCap: d.security.marketCap ?? toNumber(attrs.market_cap),
        analystCount: toNumber(attrs.analyst_count),
        instOwnershipPct: toNumber(attrs.inst_ownership),
      });
      scored.push({ ...d, news7d, ignoredScore });
    }

    scored
      .sort((a, b) => b.ignoredScore - a.ignoredScore);

    const ranked = scored
      .filter((r) => r.ignoredScore >= minIgnoredScore)
      .slice(0, maxCompanies);

    if (ranked.length === 0) {
      console.log('[SEC EDGAR] No companies passed the ignored-score filter.');
      return [];
    }

    console.log(`[SEC EDGAR] Emitting ${ranked.length} most-ignored filings (of ${detected.length} detected)`);

    return ranked.map((d) => ({
      canonicalUrl: `https://www.sec.gov/Archives/edgar/data/${d.cik}/${d.accession.replace(/-/g, '')}/${d.accession}.txt`,
      title: `Form ${d.form} — ${d.company.displayName}`,
      text: '',
      publishedAt: d.filedDate,
      metadata: {
        cik: d.cik,
        accessionNumber: d.accession,
        formType: d.form,
        displayName: d.company.displayName,
        ticker: d.security.ticker || null,
        exchange: d.security.exchange || null,
        marketCap: d.security.marketCap ?? null,
        avgDollarVolume: d.security.avgDollarVolume ?? null,
        news7d: d.news7d,
        ignoredScore: d.ignoredScore,
      },
    }));
  }

  private throttle(): Promise<void> {
    // SEC requires ≤10 requests/sec; use a conservative 100ms spacing.
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  private newsThrottle(): Promise<void> {
    // Finnhub free = 60 calls/min; use ~1/sec to stay well under.
    return new Promise((resolve) => setTimeout(resolve, 1000));
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

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
