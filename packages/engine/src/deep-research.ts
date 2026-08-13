import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { setApiKey, extractFromFiling } = require('./llm-extractor.js') as {
  setApiKey: (key?: string) => void;
  extractFromFiling: (...args: unknown[]) => Promise<Record<string, any> | null>;
};
const { resolveDefinedTerms } = require('./cdr.js') as {
  resolveDefinedTerms: (text: string, cik: string) => Promise<{ context?: string; terms?: Record<string, unknown> }>;
};

export type DeepResearchFamily = 'sec' | 'contracts' | 'regulatory' | 'patents';

export interface DeepResearchSignal {
  id?: string;
  title: string;
  sourceType: string;
  sourceUrl: string;
  publishedAt: Date;
  rawText?: string | null;
  entities?: unknown;
  amounts?: unknown;
  rawMetadata?: unknown;
  sourceQuality?: number | null;
}

export interface DeepResearchCompanyContext {
  companyId?: string;
  securityId?: string;
  companyName?: string;
  ticker?: string;
  cik?: string;
  sector?: string | null;
  revenue?: number | null;
  cash?: number | null;
  assets?: number | null;
  marketCap?: number | null;
  enterpriseValue?: number | null;
  currentShares?: number | null;
}

export interface DeepResearchFact {
  text: string;
  sourceUrl?: string;
  confidence: number;
}

export interface DeepResearchResult {
  researcher: string;
  family: DeepResearchFamily;
  thesis?: string;
  summary: string;
  verifiedFacts: DeepResearchFact[];
  inferredClaims: string[];
  contradictions: string[];
  missingInputs: string[];
  openQuestions: string[];
  amounts: Array<{ value: number; label: string; currency?: string }>;
  relationshipConfidence: number;
  attributes: Record<string, unknown>;
  evidenceUrls: string[];
}

export interface DeepResearchContext {
  clusterId: string;
  title: string;
  clusterType: string;
  thesis?: string | null;
  signals: DeepResearchSignal[];
  company: DeepResearchCompanyContext;
  log?: (message: string, detail?: Record<string, unknown>) => void;
}

export interface DeepResearcher {
  id: string;
  family: DeepResearchFamily;
  supports(context: DeepResearchContext): boolean;
  research(context: DeepResearchContext): Promise<DeepResearchResult>;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function amountList(signal: DeepResearchSignal) {
  return (Array.isArray(signal.amounts) ? signal.amounts : [])
    .map((value: any) => ({ value: Number(value?.value || 0), label: String(value?.label || 'reported_amount'), currency: value?.currency || 'USD' }))
    .filter((value) => value.value > 0);
}

function unique(values: Array<string | undefined | null>) {
  return [...new Set(values.filter((value): value is string => !!value))];
}

function firstSignal(context: DeepResearchContext, pattern: RegExp) {
  return context.signals.find((signal) => pattern.test(signal.sourceType));
}

function cleanSecText(raw: string) {
  const textStart = raw.indexOf('<TEXT>');
  return (textStart >= 0 ? raw.slice(textStart + 6) : raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|lt|gt);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50_000);
}

function secArchiveTextUrl(signal: DeepResearchSignal) {
  const metadata = object(signal.rawMetadata);
  const cik = String(metadata.cik || '').replace(/^0+/, '');
  const accession = String(metadata.accessionNumber || '');
  if (!cik || !accession) return null;
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, '')}/${accession}.txt`;
}

export class SecDeepResearcher implements DeepResearcher {
  id = 'sec-deep-v1';
  family: DeepResearchFamily = 'sec';

  supports(context: DeepResearchContext) {
    return context.signals.some((signal) => /sec/i.test(signal.sourceType));
  }

  async research(context: DeepResearchContext): Promise<DeepResearchResult> {
    const signal = firstSignal(context, /sec/i) || context.signals[0]!;
    const metadata = object(signal.rawMetadata);
    const textUrl = secArchiveTextUrl(signal);
    let filingText = signal.rawText || '';

    if (textUrl) {
      context.log?.('fetching full SEC filing', { researcher: this.id, url: textUrl });
      const response = await fetch(textUrl, {
        headers: { 'User-Agent': process.env.SEC_USER_AGENT || 'Hidden Catalyst Research contact@hiddencatalyst.com' },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) filingText = cleanSecText(await response.text());
    }

    let crossDocumentContext = '';
    let resolvedTerms: Record<string, unknown> = {};
    const cik = String(metadata.cik || context.company.cik || '');
    if (cik && /purchase\s+agreement|defined\s+in\s+the|amends\s+the|as\s+defined/i.test(filingText)) {
      try {
        const resolved = await resolveDefinedTerms(filingText.slice(0, 20_000), cik);
        crossDocumentContext = resolved.context || '';
        resolvedTerms = resolved.terms || {};
        context.log?.('resolved SEC cross-document terms', { researcher: this.id, terms: Object.keys(resolvedTerms).length });
      } catch (error) {
        context.log?.('SEC cross-document resolution unavailable', { researcher: this.id, error: (error as Error).message });
      }
    }

    let extraction: Record<string, any> | null = null;
    if (process.env.DEEPSEEK_API_KEY && filingText.length >= 200) {
      setApiKey(process.env.DEEPSEEK_API_KEY);
      extraction = await extractFromFiling(
        filingText,
        context.company.companyName || metadata.displayName || 'SEC registrant',
        context.company.ticker || '',
        metadata.formType || context.clusterType,
        context.company.sector,
        crossDocumentContext,
      );
    }

    const sourceUrl = textUrl || signal.sourceUrl;
    const facts = Array.isArray(extraction?.verifiedFacts) ? extraction.verifiedFacts : [];
    return {
      researcher: this.id,
      family: this.family,
      thesis: extraction?.hiddenAngle?.claim || extraction?.insightTitle || context.thesis || undefined,
      summary: extraction?.eventSummary || extraction?.whyItMatters || `Full SEC filing reviewed for ${metadata.formType || context.clusterType}.`,
      verifiedFacts: facts.length
        ? facts.map((fact: unknown) => ({ text: String(fact), sourceUrl, confidence: 0.9 }))
        : [{ text: signal.title, sourceUrl, confidence: 0.88 }],
      inferredClaims: unique([extraction?.hiddenAngle?.reasoning, extraction?.whyItMatters]),
      contradictions: Array.isArray(extraction?.contradictions) ? extraction.contradictions.map(String) : [],
      missingInputs: unique([
        ...(Array.isArray(extraction?.missingInfo) ? extraction.missingInfo.map(String) : []),
        !process.env.DEEPSEEK_API_KEY ? 'DEEPSEEK_API_KEY is unavailable; SEC semantic extraction was skipped.' : null,
        filingText.length < 200 ? 'Full SEC filing text could not be retrieved.' : null,
      ]),
      openQuestions: Array.isArray(extraction?.openQuestions) ? extraction.openQuestions.map(String) : [],
      amounts: [...context.signals.flatMap(amountList), ...((extraction?.financialMateriality?.amounts || []) as any[])].filter((item: any) => Number(item?.value || 0) > 0),
      relationshipConfidence: Number(extraction?.relationshipConfidence || 90),
      attributes: { formType: metadata.formType, accessionNumber: metadata.accessionNumber, filingTextLength: filingText.length, resolvedTerms, extraction },
      evidenceUrls: unique([signal.sourceUrl, textUrl]),
    };
  }
}

abstract class DeterministicResearcher implements DeepResearcher {
  abstract id: string;
  abstract family: DeepResearchFamily;
  abstract pattern: RegExp;
  abstract summarize(context: DeepResearchContext, signal: DeepResearchSignal, metadata: Record<string, any>): Omit<DeepResearchResult, 'researcher' | 'family'>;

  supports(context: DeepResearchContext) {
    return context.signals.some((signal) => this.pattern.test(`${signal.sourceType} ${signal.title}`));
  }

  async research(context: DeepResearchContext): Promise<DeepResearchResult> {
    const signal = firstSignal(context, this.pattern) || context.signals[0]!;
    return { researcher: this.id, family: this.family, ...this.summarize(context, signal, object(signal.rawMetadata)) };
  }
}

export class ContractDeepResearcher extends DeterministicResearcher {
  id = 'contract-grant-v1';
  family: DeepResearchFamily = 'contracts';
  pattern = /contract|award|usaspending|sam_gov|grant/i;
  summarize(context: DeepResearchContext, signal: DeepResearchSignal, metadata: Record<string, any>) {
    const amounts = context.signals.flatMap(amountList);
    const recipient = metadata.recipient || context.company.companyName || 'Recipient';
    const agency = metadata.agency || 'Government agency';
    return {
      thesis: context.thesis || `${recipient} received a public award from ${agency}.`,
      summary: `${signal.title}. Award value, agency, recipient, and amendment context were normalized from the public record.`,
      verifiedFacts: [{ text: `${recipient} / ${agency}${amounts[0] ? ` / $${amounts[0].value.toLocaleString()}` : ''}`, sourceUrl: signal.sourceUrl, confidence: 0.95 }],
      inferredClaims: [], contradictions: [],
      missingInputs: unique([!metadata.awardId ? 'Award identifier is missing.' : null, !amounts.length ? 'Obligation or ceiling value is missing.' : null, context.company.revenue == null ? 'Company revenue is missing for award materiality.' : null]),
      openQuestions: ['Is the named recipient the listed parent, a subsidiary, or an unrelated namesake?', 'Does the value represent obligated funding or a maximum ceiling?'],
      amounts, relationshipConfidence: metadata.recipient ? 82 : 55,
      attributes: { awardId: metadata.awardId, recipient, agency, period: metadata.period, amendment: metadata.amendment, obligations: metadata.obligations, ceiling: metadata.ceiling },
      evidenceUrls: [signal.sourceUrl],
    };
  }
}

export class RegulatoryDeepResearcher extends DeterministicResearcher {
  id = 'regulatory-clinical-v1';
  family: DeepResearchFamily = 'regulatory';
  pattern = /fda|regulatory|clinical_trial|clinicaltrials/i;
  summarize(context: DeepResearchContext, signal: DeepResearchSignal, metadata: Record<string, any>) {
    const product = metadata.brand || metadata.generic || metadata.nctId || 'Product or trial';
    const sponsor = metadata.manufacturer || metadata.company || context.company.companyName || 'Sponsor';
    return {
      thesis: context.thesis || `${sponsor} has a regulatory or clinical status change involving ${product}.`,
      summary: `${signal.title}. Sponsor, product/trial, phase, status, and record dates were normalized.`,
      verifiedFacts: [{ text: `${product}: ${metadata.status || context.clusterType}`, sourceUrl: signal.sourceUrl, confidence: 0.92 }],
      inferredClaims: [], contradictions: [],
      missingInputs: unique([!metadata.manufacturer && !metadata.company ? 'Sponsor identity is missing.' : null, !metadata.status && /clinical/i.test(signal.sourceType) ? 'Trial status is missing.' : null, !metadata.phase && /clinical/i.test(signal.sourceType) ? 'Trial phase is missing.' : null]),
      openQuestions: ['Is the sponsor directly owned by the listed company?', 'Is this a new status change or a refreshed public record?', 'What endpoint or regulatory action changed?'],
      amounts: context.signals.flatMap(amountList), relationshipConfidence: sponsor !== 'Sponsor' ? 75 : 50,
      attributes: { product, sponsor, phase: metadata.phase, status: metadata.status, nctId: metadata.nctId, applicationNumber: metadata.appNum, endpoints: metadata.endpoints },
      evidenceUrls: [signal.sourceUrl],
    };
  }
}

export class PatentDeepResearcher extends DeterministicResearcher {
  id = 'patent-commercialization-v1';
  family: DeepResearchFamily = 'patents';
  pattern = /patent|uspto/i;
  summarize(context: DeepResearchContext, signal: DeepResearchSignal, metadata: Record<string, any>) {
    const assignee = metadata.assignee || context.company.companyName || 'Assignee';
    return {
      thesis: context.thesis || `${assignee} received patent protection relevant to ${metadata.title || signal.title}.`,
      summary: `${signal.title}. Assignee, patent identifier, grant date, and commercialization caveats were checked.`,
      verifiedFacts: [{ text: `${metadata.patentNumber || 'Patent'} assigned to ${assignee}`, sourceUrl: signal.sourceUrl, confidence: 0.94 }],
      inferredClaims: [], contradictions: ['A patent grant does not itself prove product demand, freedom to operate, or commercialization.'],
      missingInputs: unique([!metadata.patentNumber ? 'Patent number is missing.' : null, !metadata.assignee ? 'Patent assignee is missing.' : null, 'Claims scope and product mapping require specialist review.']),
      openQuestions: ['Which commercial product practices the claims?', 'Are blocking patents, licenses, or assignments present?'],
      amounts: context.signals.flatMap(amountList), relationshipConfidence: metadata.assignee ? 72 : 50,
      attributes: { patentNumber: metadata.patentNumber, assignee, inventors: metadata.inventors, filingDate: metadata.filingDate, grantDate: signal.publishedAt, title: metadata.title },
      evidenceUrls: [signal.sourceUrl],
    };
  }
}

export class DeepResearchRegistry {
  private researchers: DeepResearcher[];

  constructor(researchers: DeepResearcher[] = []) {
    this.researchers = [...researchers];
  }

  register(researcher: DeepResearcher) {
    if (this.researchers.some((item) => item.id === researcher.id)) throw new Error(`Researcher ${researcher.id} is already registered`);
    this.researchers.push(researcher);
    return this;
  }

  select(context: DeepResearchContext) {
    return this.researchers.filter((researcher) => researcher.supports(context));
  }

  async run(context: DeepResearchContext) {
    const selected = this.select(context);
    const results: DeepResearchResult[] = [];
    for (const researcher of selected) {
      context.log?.('deep researcher started', { researcher: researcher.id, family: researcher.family });
      try {
        const result = await researcher.research(context);
        results.push(result);
        context.log?.('deep researcher completed', { researcher: researcher.id, facts: result.verifiedFacts.length, missing: result.missingInputs.length });
      } catch (error) {
        context.log?.('deep researcher failed', { researcher: researcher.id, error: (error as Error).message });
        results.push({
          researcher: researcher.id,
          family: researcher.family,
          summary: `${researcher.id} failed; the cluster remains incomplete.`,
          verifiedFacts: [],
          inferredClaims: [],
          contradictions: [],
          missingInputs: [`${researcher.id} failed: ${(error as Error).message}`],
          openQuestions: ['Retry source-specific deep research before promotion.'],
          amounts: [],
          relationshipConfidence: 0,
          attributes: { failed: true },
          evidenceUrls: [],
        });
      }
    }
    return results;
  }
}

export function createDefaultResearchRegistry() {
  return new DeepResearchRegistry()
    .register(new SecDeepResearcher())
    .register(new ContractDeepResearcher())
    .register(new RegulatoryDeepResearcher())
    .register(new PatentDeepResearcher());
}

export function mergeDeepResearch(results: DeepResearchResult[]) {
  return {
    thesis: results.find((result) => result.thesis)?.thesis,
    summary: results.map((result) => result.summary).join(' '),
    verifiedFacts: results.flatMap((result) => result.verifiedFacts),
    inferredClaims: unique(results.flatMap((result) => result.inferredClaims)),
    contradictions: unique(results.flatMap((result) => result.contradictions)),
    missingInputs: unique(results.flatMap((result) => result.missingInputs)),
    openQuestions: unique(results.flatMap((result) => result.openQuestions)),
    amounts: results.flatMap((result) => result.amounts),
    relationshipConfidence: results.length ? Math.round(results.reduce((sum, result) => sum + result.relationshipConfidence, 0) / results.length) : 50,
    evidenceUrls: unique(results.flatMap((result) => result.evidenceUrls)),
    researchers: results.filter((result) => result.attributes.failed !== true).map((result) => result.researcher),
    results,
  };
}
