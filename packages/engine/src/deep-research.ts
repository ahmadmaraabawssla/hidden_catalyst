import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { setApiKey, extractFromFiling } = require('./llm-extractor.js') as {
  setApiKey: (key?: string) => void;
  extractFromFiling: (...args: unknown[]) => Promise<Record<string, any> | null>;
};
const { resolveDefinedTerms, findAgreementReferences } = require('./cdr.js') as {
  resolveDefinedTerms: (text: string, cik: string) => Promise<{ context?: string; terms?: Record<string, unknown> }>;
  findAgreementReferences: (text: string) => Array<{ dateStr?: string; description?: string }>;
};
import { inferDirection, type CatalystDirection } from './direction';

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
  /** Economic sign of the catalyst (positive/negative/mixed/unclear). */
  direction: CatalystDirection;
  /**
   * Whether the researcher (esp. the LLM) concluded this is a routine filing
   * with NO hidden opportunity. `null` means "not assessed" (deterministic
   * researchers). `true` means "explicitly concluded not a hidden opportunity".
   */
  isRoutine: boolean | null;
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

/**
 * Parse a dollar string the LLM may return ("$10 million", "$1,234,567", "$2B",
 * "$3.2 billion", "1.5M", a bare number, or a number already) into a numeric
 * USD amount. Returns null when the value is absent or unparseable. This is the
 * bridge between the LLM's free-text financial materiality and the numeric
 * materiality ratio — previously the LLM extracted `financialMateriality.amount`
 * but the researcher only read `financialMateriality.amounts` (an array that
 * never existed), so the dollar value was silently dropped and materiality was
 * always UNKNOWN.
 */
function parseDollar(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(million|billion|trillion|m|b|t|k)?/i);
  if (!m) return null;
  const mantissa = m[1];
  if (!mantissa) return null;
  let n = Number(mantissa.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'trillion' || unit === 't') n *= 1e12;
  else if (unit === 'billion' || unit === 'b') n *= 1e9;
  else if (unit === 'million' || unit === 'm') n *= 1e6;
  else if (unit === 'k') n *= 1e3;
  return n;
}

/**
 * Collect every dollar amount the LLM reported for a filing, from the
 * financialMateriality block, the hidden-angle cash/dilution exposure, and the
 * pass-1 extracted facts (maximumPaymentLiability, commitmentFee, etc.).
 */
function llmAmounts(extraction: Record<string, any> | null | undefined): Array<{ value: number; label: string; currency: string }> {
  if (!extraction) return [];
  const out: Array<{ value: number; label: string; currency: string }> = [];
  const push = (value: unknown, label: string) => {
    const n = parseDollar(value);
    if (n != null) out.push({ value: n, label, currency: 'USD' });
  };

  const fm = extraction.financialMateriality;
  if (fm && typeof fm === 'object') push(fm.amount, 'financial_materiality');

  const ha = extraction.hiddenAngle;
  if (ha && typeof ha === 'object') {
    if (ha.cashExposure && typeof ha.cashExposure === 'object') push(ha.cashExposure.amount, 'cash_exposure');
    if (ha.dilutionExposure && typeof ha.dilutionExposure === 'object') push(ha.dilutionExposure.potentialShares, 'dilution_shares');
  }

  const facts = extraction.extractedFacts;
  if (facts && typeof facts === 'object') {
    push(facts.maximumPaymentLiability, 'maximum_payment_liability');
    push(facts.elocMaxCapacity, 'equity_line_max');
    push(facts.commitmentFee, 'commitment_fee');
  }

  return out;
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
    let referencedDocumentUnresolved = false;
    const cik = String(metadata.cik || context.company.cik || '');
    // Only attempt cross-document resolution when the filing has an ACTUAL
    // agreement reference (a dated agreement citation). A bare "as defined in
    // the" phrase is boilerplate that appears in nearly every filing and does
    // NOT mean a referenced agreement needs resolving — treating it as one
    // produced "referenced document unresolved" on routine 10-Qs/8-Ks that
    // never cited anything. Use the same detector the resolver uses, so the
    // flag only fires when there is a genuine, dated reference.
    const hasAgreementReference = findAgreementReferences(filingText).length > 0;
    if (cik && hasAgreementReference) {
      try {
        const resolved = await resolveDefinedTerms(filingText.slice(0, 20_000), cik);
        crossDocumentContext = resolved.context || '';
        resolvedTerms = resolved.terms || {};
        // ── Distinguish "examined, no terms" from "could not retrieve" ──
        // Only mark unresolved when there WAS a real reference but we could not
        // pull terms. A successful retrieval (even with zero extractable terms)
        // is logged as "resolved" — the document was examined.
        referencedDocumentUnresolved = Object.keys(resolvedTerms).length === 0 && !crossDocumentContext;
        context.log?.(
          referencedDocumentUnresolved ? 'SEC referenced document unresolved' : 'resolved SEC cross-document terms',
          { researcher: this.id, terms: Object.keys(resolvedTerms).length }
        );
      } catch (error) {
        referencedDocumentUnresolved = true;
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
    // ── Propagate the LLM's own verdict ──
    // The LLM extractor returns isRoutine (no hidden angle) and verificationStatus.
    // These MUST flow into the final qualification — the previous code read only
    // hiddenAngle.claim and silently dropped "this is routine / not an opportunity",
    // producing the "not a hidden opportunity" thesis + "Promising" badge bug.
    const llmIsRoutine = typeof extraction?.isRoutine === 'boolean' ? (extraction.isRoutine as boolean) : null;
    const thesisText = extraction?.hiddenAngle?.claim || extraction?.insightTitle || context.thesis || undefined;
    return {
      researcher: this.id,
      family: this.family,
      thesis: thesisText,
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
        referencedDocumentUnresolved ? 'Referenced agreement could not be retrieved — defined terms unresolved.' : null,
      ]),
      openQuestions: Array.isArray(extraction?.openQuestions) ? extraction.openQuestions.map(String) : [],
      amounts: [
        ...context.signals.flatMap(amountList),
        ...llmAmounts(extraction),
      ].filter((item: any) => Number(item?.value || 0) > 0),
      relationshipConfidence: Number(extraction?.relationshipConfidence || 90),
      attributes: { formType: metadata.formType, accessionNumber: metadata.accessionNumber, filingTextLength: filingText.length, resolvedTerms, extraction },
      evidenceUrls: unique([signal.sourceUrl, textUrl]),
      direction: inferDirection(context.clusterType, `${signal.title} ${thesisText || ''}`),
      isRoutine: llmIsRoutine,
    };
  }
}

abstract class DeterministicResearcher implements DeepResearcher {
  abstract id: string;
  abstract family: DeepResearchFamily;
  abstract pattern: RegExp;
  abstract summarize(context: DeepResearchContext, signal: DeepResearchSignal, metadata: Record<string, any>): Omit<DeepResearchResult, 'researcher' | 'family' | 'direction' | 'isRoutine'>;

  supports(context: DeepResearchContext) {
    return context.signals.some((signal) => this.pattern.test(`${signal.sourceType} ${signal.title}`));
  }

  async research(context: DeepResearchContext): Promise<DeepResearchResult> {
    const signal = firstSignal(context, this.pattern) || context.signals[0]!;
    const summary = this.summarize(context, signal, object(signal.rawMetadata));
    return {
      researcher: this.id,
      family: this.family,
      ...summary,
      direction: inferDirection(context.clusterType, `${signal.title} ${summary.thesis || ''}`),
      isRoutine: null,
    };
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
    // Prefer the TRUE lead sponsor (extracted by the connector) over the searched
    // company name, so the thesis and facts reference the real issuer.
    const sponsor = metadata.leadSponsor || metadata.manufacturer || metadata.company || context.company.companyName || 'Sponsor';
    const phase = metadata.phase || null;
    const enrollment = metadata.enrollment != null ? Number(metadata.enrollment) : null;
    const condition = metadata.condition || null;
    // Structured evidence — phase, enrollment, condition, and sponsor are the
    // facts that let a reviewer judge novelty/relevance without reading the
    // registry. Previously only a single fact was returned.
    const verifiedFacts: DeepResearchFact[] = [
      { text: `${product}: ${metadata.status || context.clusterType}`, sourceUrl: signal.sourceUrl, confidence: 0.92 },
    ];
    if (sponsor !== 'Sponsor') verifiedFacts.push({ text: `Lead sponsor: ${sponsor}`, sourceUrl: signal.sourceUrl, confidence: 0.85 });
    if (phase) verifiedFacts.push({ text: `Phase: ${phase}`, sourceUrl: signal.sourceUrl, confidence: 0.9 });
    if (enrollment != null && Number.isFinite(enrollment)) verifiedFacts.push({ text: `Enrollment: ${enrollment.toLocaleString()}`, sourceUrl: signal.sourceUrl, confidence: 0.8 });
    if (condition) verifiedFacts.push({ text: `Condition: ${condition}`, sourceUrl: signal.sourceUrl, confidence: 0.8 });

    return {
      thesis: context.thesis || `${sponsor} has a regulatory or clinical status change involving ${product}.`,
      summary: `${signal.title}. Sponsor, product/trial, phase, status, and record dates were normalized.`,
      verifiedFacts,
      inferredClaims: [], contradictions: [],
      missingInputs: unique([!metadata.manufacturer && !metadata.leadSponsor && !metadata.company ? 'Sponsor identity is missing.' : null, !metadata.status && /clinical/i.test(signal.sourceType) ? 'Trial status is missing.' : null, !phase && /clinical/i.test(signal.sourceType) ? 'Trial phase is missing.' : null]),
      openQuestions: ['Is the lead sponsor directly owned by the listed company?', 'Is this a new status change or a refreshed public record?', 'What endpoint or regulatory action changed?'],
      amounts: context.signals.flatMap(amountList), relationshipConfidence: sponsor !== 'Sponsor' ? 75 : 50,
      attributes: { product, sponsor, leadSponsor: metadata.leadSponsor, phase, status: metadata.status, enrollment, condition, nctId: metadata.nctId, applicationNumber: metadata.appNum, endpoints: metadata.endpoints },
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
      const result = await researcher.research(context);
      results.push(result);
      context.log?.('deep researcher completed', { researcher: researcher.id, facts: result.verifiedFacts.length, missing: result.missingInputs.length });
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

export function mergeDeepResearch(results: DeepResearchResult[]): {
  thesis?: string;
  summary: string;
  verifiedFacts: DeepResearchFact[];
  inferredClaims: string[];
  contradictions: string[];
  missingInputs: string[];
  openQuestions: string[];
  amounts: Array<{ value: number; label: string; currency?: string }>;
  relationshipConfidence: number;
  evidenceUrls: string[];
  researchers: string[];
  results: DeepResearchResult[];
  direction: CatalystDirection;
  isRoutine: boolean | null;
} {
  // Direction: the first non-unclear direction wins (negative/mixed/positive
  // are more informative than 'unclear').
  const direction: CatalystDirection = results
    .map((r) => r.direction)
    .find((d) => d !== 'unclear') ?? 'unclear';
  // isRoutine: if ANY researcher (esp. the LLM) explicitly concluded the filing
  // is routine / has no hidden angle, surface that — it is decisive.
  const isRoutine = results.some((r) => r.isRoutine === true) || null;
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
    researchers: results.map((result) => result.researcher),
    results,
    direction,
    isRoutine,
  };
}
