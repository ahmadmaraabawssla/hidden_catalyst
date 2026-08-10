/**
 * FDA + ClinicalTrials.gov — Real API Connectors
 *
 * FDA: openFDA API (free, no key required)
 * ClinicalTrials.gov: v2 REST API (free, no key)
 */

import { BaseConnector, type RawDocument, type ExtractionResult } from './base';
import type { PrismaClient } from '@hidden-catalyst/db';

const CT_BASE = 'https://clinicaltrials.gov/api/v2/studies';

// ─── FDA Connector ───

export class FDAConnector extends BaseConnector {
  constructor(prisma: PrismaClient) {
    super(prisma, {
      sourceId: 'source_fda',
      name: 'FDA',
      family: 'fda',
      schedule: '0 */12 * * *',
      rateLimitPerMinute: 30,
      retryPolicy: { maxAttempts: 3, backoffMs: 120000 },
    });
  }

  async fetchDocuments(since?: Date): Promise<RawDocument[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 86400000);
    const results: RawDocument[] = [];

    try {
      // Fetch recent FDA drug approvals from openFDA
      const fromStr = sinceDate.toISOString().slice(0, 10);
      const url = `https://api.fda.gov/drug/drugsfda.json?search=submissions.submission_status_date:[${fromStr}+TO+9999-12-31]&limit=25`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return results;

      const data = await res.json();
      const items = data?.results || [];

      for (const item of items) {
        const brand = item?.openfda?.brand_name?.[0] || 'Unknown';
        const generic = item?.openfda?.generic_name?.[0] || '';
        const manufacturer = item?.openfda?.manufacturer_name?.[0] || '';
        const appNum = item?.openfda?.application_number?.[0] || '';

        results.push({
          canonicalUrl: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${appNum}`,
          title: `FDA: ${brand} (${generic})`,
          text: `FDA drug application for ${brand} (${generic}) by ${manufacturer}. Application #${appNum}.`,
          publishedAt: new Date(),
          metadata: { manufacturer, brand, generic, appNum, source: 'fda' },
        });
      }
    } catch {
      // openFDA may be rate-limited
    }

    return results;
  }

  async extract(doc: RawDocument): Promise<ExtractionResult> {
    return {
      entities: [{ name: 'U.S. Food and Drug Administration', type: 'agency' }],
      events: [{ eventType: 'regulatory_approval', title: doc.title, occurredAt: doc.publishedAt }],
      relationships: [],
      claims: [{ claimType: 'verified_fact', text: doc.text.slice(0, 500), excerpt: doc.text.slice(0, 200), confidence: 0.97 }],
    };
  }
}

// ─── ClinicalTrials.gov Connector ───

export class ClinicalTrialsConnector extends BaseConnector {
  constructor(prisma: PrismaClient) {
    super(prisma, {
      sourceId: 'source_clinicaltrials',
      name: 'ClinicalTrials.gov',
      family: 'clinical_trials',
      schedule: '0 */12 * * *',
      rateLimitPerMinute: 30,
      retryPolicy: { maxAttempts: 3, backoffMs: 120000 },
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
        const query = encodeURIComponent(company.displayName.slice(0, 30));
        const url = `${CT_BASE}?query.term=${query}&pageSize=3&format=json`;
        const res = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;

        const data = await res.json();
        const studies = data?.studies || [];

        for (const study of studies) {
          const p = study?.protocolSection;
          const id = p?.identificationModule;
          const status = p?.statusModule?.overallStatus;
          const title = id?.briefTitle || id?.officialTitle || 'Clinical Trial';
          if (!['COMPLETED', 'ACTIVE_NOT_RECRUITING', 'RECRUITING'].includes(status)) continue;

          results.push({
            canonicalUrl: `https://clinicaltrials.gov/study/${id?.nctId}`,
            title: `Trial: ${title}`.slice(0, 200),
            text: `${title}. Status: ${status}. Phase: ${p?.designModule?.phases?.[0] || 'N/A'}. Sponsor: ${company.displayName}.`,
            publishedAt: new Date(),
            metadata: { nctId: id?.nctId, status, company: company.displayName },
          });
        }
      } catch {}
      await new Promise(r => setTimeout(r, 200));
    }

    return results;
  }

  async extract(doc: RawDocument): Promise<ExtractionResult> {
    const isComplete = doc.text.toLowerCase().includes('completed');
    return {
      entities: [],
      events: [{ eventType: isComplete ? 'clinical_trial_result' : 'clinical_trial_update', title: doc.title, occurredAt: doc.publishedAt }],
      relationships: [],
      claims: [{ claimType: 'verified_fact', text: doc.text.slice(0, 500), excerpt: doc.text.slice(0, 200), confidence: 0.95 }],
    };
  }
}
