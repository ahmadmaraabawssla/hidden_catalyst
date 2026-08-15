import type { MaterialityResult } from './materiality';
import type { AdversarialResult } from './adversarial';

export type ClaimStatus = 'verified' | 'inferred' | 'unverified' | 'rejected';
export type CheckStatus = 'verified' | 'partial' | 'pending' | 'failed' | 'not_applicable';
export type ThesisStatus = 'reject' | 'watch' | 'candidate' | 'verified';

export interface ResearchClaim {
  status: ClaimStatus;
  text: string;
  evidence?: string;
  reason?: string;
}

export interface ResearchCheck {
  id: string;
  status: CheckStatus;
  source: string;
  check: string;
  result: string;
  why: string;
}

export interface ResearchSource {
  sourceType: string;
  title: string;
  url?: string | null;
  publishedAt?: string | null;
}

export interface ScenarioRow {
  label: string;
  input: number;
  output: number;
}

export interface ScenarioTable {
  title: string;
  note: string;
  inputLabel: string;
  outputLabel: string;
  rows: ScenarioRow[];
}

export interface ResearchReport {
  version: 'research_report_v1';
  thesis: string;
  thesisStatus: ThesisStatus;
  summary: string;
  verifiedFacts: ResearchClaim[];
  inferredClaims: ResearchClaim[];
  unverifiedClaims: ResearchClaim[];
  rejectedClaims: ResearchClaim[];
  researchChecks: ResearchCheck[];
  sources: ResearchSource[];
  materiality: MaterialityResult;
  adversarial: AdversarialResult;
  scenarioTables: ScenarioTable[];
  missingInputs: string[];
  openQuestions: string[];
  confidence: number;
  completeness: number;
  qualificationReasons: string[];
}

export interface ResearchReportInput {
  title: string;
  eventType: string;
  thesis?: string | null;
  signals: Array<{
    title: string;
    sourceType: string;
    sourceUrl?: string | null;
    publishedAt?: Date | string | null;
    rawText?: string | null;
    entities?: unknown;
    amounts?: unknown;
    sourceQuality?: number | null;
  }>;
  materiality: MaterialityResult;
  adversarial: AdversarialResult;
  priceReactionAvailable?: boolean;
  priceReactionMeasured?: boolean;
  attentionAvailable?: boolean;
  attentionMeasured?: boolean;
  relationshipConfidence?: number | null;
  deepResearch?: {
    summary?: string;
    verifiedFacts?: Array<{ text: string; sourceUrl?: string; confidence?: number }>;
    inferredClaims?: string[];
    contradictions?: string[];
    missingInputs?: string[];
    openQuestions?: string[];
    researchers?: string[];
  };
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function text(value: unknown) {
  return String(value || '');
}

function allText(input: ResearchReportInput) {
  return [
    input.title,
    input.thesis,
    ...input.signals.map((s) => `${s.title} ${s.rawText || ''}`),
  ].join('\n');
}

function hasDefinedPriceVariable(value: string) {
  return /commitment fee price|effective amount|minimum price|floor price|conversion price|measurement date/i.test(value);
}

function claimsSpotPriceIsTrigger(value: string) {
  return /stock (?:price|trades?).*(?:below|falls below).*(?:owe|trigger|true-up|cash)|triggered by a stock price decline|directly tied to the stock price/i.test(value);
}

function claimsUnverifiedShareSettlement(value: string) {
  return /may have the option to settle.*shares|if the true-up is settled in shares|settle the true-up in shares/i.test(value);
}

function extractAmounts(input: ResearchReportInput): number[] {
  const amounts: number[] = [];
  for (const signal of input.signals) {
    const raw = signal.amounts as Array<{ value?: number | null }> | undefined;
    if (Array.isArray(raw)) {
      for (const amount of raw) {
        const value = Number(amount.value || 0);
        if (value > 0) amounts.push(value);
      }
    }
  }
  return amounts;
}

function extractTrueUpScenario(inputText: string): ScenarioTable | null {
  const maxMatch = inputText.match(/(?:maximum payment liability|true-up provision|up to)\D{0,40}\$?([0-9,.]+)(m|k)?/i);
  const factorMatch = inputText.match(/([0-9,]+)\s*(?:x|\*)\s*commitment fee price/i);
  const minPriceMatch = inputText.match(/minimum price(?: threshold)?\D{0,20}\$?([0-9.]+)/i);
  if (!maxMatch || !factorMatch) return null;

  const multiplier = maxMatch[2]?.toLowerCase() === 'm' ? 1_000_000 : maxMatch[2]?.toLowerCase() === 'k' ? 1_000 : 1;
  const maxLiability = Number(maxMatch[1]?.replace(/,/g, '') ?? '0') * multiplier;
  const factor = Number(factorMatch[1]?.replace(/,/g, '') ?? '0');
  const minimumPrice = minPriceMatch ? Number(minPriceMatch[1]) : null;
  if (!Number.isFinite(maxLiability) || !Number.isFinite(factor)) return null;

  const prices = Array.from(new Set([minimumPrice, 0.35, 0.30, 0.20, 0.10, 0].filter((v): v is number => v != null && Number.isFinite(v))));
  return {
    title: 'True-up formula scenarios',
    note: 'Illustrative contract mechanics only. These are not predictions and use the contract-defined variable, not spot price.',
    inputLabel: 'Commitment Fee Price',
    outputLabel: 'Implied true-up',
    rows: prices.map((price) => ({
      label: `$${price.toFixed(price < 1 ? 5 : 2)}`,
      input: price,
      output: Math.max(0, maxLiability - factor * price),
    })),
  };
}

function buildChecks(input: ResearchReportInput, combined: string): ResearchCheck[] {
  const hasSignal = input.signals.length > 0;
  const hasAmount = extractAmounts(input).length > 0;
  const definedVariable = hasDefinedPriceVariable(combined);
  const hasMaterialityDenominator = input.materiality.denominator != null;
  const hasMaterialityRatio = input.materiality.ratio != null;

  return [
    {
      id: 'deep_research',
      status: input.deepResearch?.researchers?.length ? 'verified' : 'pending',
      source: input.deepResearch?.researchers?.join(', ') || 'Researcher registry',
      check: 'Source-specific deep research completed',
      result: input.deepResearch?.researchers?.length
        ? `${input.deepResearch.researchers.length} source-specific researcher${input.deepResearch.researchers.length === 1 ? '' : 's'} completed`
        : 'No source-specific deep researcher completed',
      why: 'Normalized metadata alone is not sufficient for a publication decision.',
    },
    {
      id: 'primary_source',
      status: hasSignal ? 'verified' : 'pending',
      source: input.signals[0]?.sourceType || 'Public source',
      check: 'Primary public source reviewed',
      result: hasSignal ? `${input.signals.length} normalized signal${input.signals.length === 1 ? '' : 's'} linked` : 'No normalized signal linked',
      why: 'Research starts from public evidence, not model-only inference.',
    },
    {
      id: 'amount_or_mechanism',
      status: hasAmount || /formula|true-up|award|approval|contract/i.test(combined) ? 'verified' : 'pending',
      source: input.signals[0]?.sourceType || 'Signal text',
      check: 'Economic mechanism identified',
      result: hasAmount ? 'Dollar amount extracted from source signal' : 'Mechanism detected; amount still needs extraction',
      why: 'A catalyst needs a testable economic mechanism.',
    },
    {
      id: 'defined_variable_guardrail',
      status: definedVariable ? 'partial' : 'not_applicable',
      source: 'Contract definitions',
      check: 'Defined trigger variable checked',
      result: definedVariable ? 'Defined contract variable detected; market price is only context unless equivalence is explicit' : 'No defined contract price variable detected',
      why: 'Prevents substituting spot market price for a legal calculation.',
    },
    {
      id: 'materiality_denominator',
      status: hasMaterialityRatio ? 'verified' : hasMaterialityDenominator ? 'partial' : 'pending',
      source: 'Financial statements / market data',
      check: 'Materiality denominator checked',
      result: hasMaterialityRatio
        ? input.materiality.explanation
        : hasMaterialityDenominator
          ? 'Denominator present (revenue/cash/assets/EV), but event amount (market opportunity) still needs extraction'
          : 'Cash, revenue, assets, EV, market cap, or share denominator missing',
      why: 'A dollar amount is only material relative to company scale.',
    },
    {
      id: 'attention',
      status: input.attentionAvailable
        ? (input.attentionMeasured ? 'verified' : 'partial')
        : 'pending',
      source: 'Attention engine',
      check: 'Catalyst attention measured',
      result: input.attentionAvailable
        ? (input.attentionMeasured
          ? 'Catalyst-specific attention measured (matching press release or recent news)'
          : 'Company-level proxy only — no catalyst-specific coverage observed')
        : 'Media, analyst, and catalyst-specific coverage still pending',
      why: 'Information asymmetry should be measured, not assumed.',
    },
    {
      id: 'price_reaction',
      status: input.priceReactionAvailable
        ? (input.priceReactionMeasured ? 'verified' : 'partial')
        : 'pending',
      source: 'Market data',
      check: 'Price reaction measured',
      result: input.priceReactionAvailable
        ? (input.priceReactionMeasured
          ? 'Event-window price reaction measured from historical prices'
          : 'Price history present but event-window reaction is an estimate (no reliable event-day return)')
        : 'Event-window price reaction still pending',
      why: 'Determines whether the catalyst may already be priced in.',
    },
    {
      id: 'adversarial',
      status: input.adversarial.findings.length > 0 ? 'verified' : 'partial',
      source: 'Adversarial engine',
      check: 'Counter-thesis evaluated',
      result: input.adversarial.findings.length ? `${input.adversarial.findings.length} limiting finding${input.adversarial.findings.length === 1 ? '' : 's'} recorded` : 'No deterministic limiting finding recorded yet',
      why: 'The engine must try to weaken the thesis before promotion.',
    },
  ];
}

function completenessFromChecks(checks: ResearchCheck[]) {
  const weights: Record<CheckStatus, number> = {
    verified: 1,
    partial: 0.5,
    pending: 0,
    failed: 0,
    not_applicable: 0,
  };
  // Exclude not-applicable checks from BOTH the numerator and denominator so
  // they neither grant free credit nor penalize the score. A catalyst type
  // that doesn't need a given check shouldn't be rewarded (old behavior) or
  // punished (naive zero-weight) for it — completeness is measured only over
  // the checks that actually apply.
  const applicable = checks.filter((check) => check.status !== 'not_applicable');
  if (applicable.length === 0) return 0;
  const score = applicable.reduce((sum, check) => sum + weights[check.status], 0) / applicable.length;
  return Math.round(score * 100);
}

function statusFromReport(args: {
  hasPrimaryEvidence: boolean;
  hasThesis: boolean;
  materiality: MaterialityResult;
  adversarial: AdversarialResult;
  completeness: number;
  relationshipConfidence: number;
}) {
  const reasons: string[] = [];
  if (!args.hasPrimaryEvidence) reasons.push('No primary public evidence linked.');
  if (!args.hasThesis) reasons.push('No thesis identified.');
  if (args.materiality.ratio == null) reasons.push(args.materiality.denominator != null ? 'Event amount (market opportunity) missing.' : 'Materiality denominator missing.');
  if (args.relationshipConfidence < 70) reasons.push('Relationship confidence below threshold.');
  if (args.completeness < 60) reasons.push('Research completeness below candidate threshold.');
  if (args.adversarial.fatalContradiction) reasons.push('Fatal contradiction detected.');

  // ── HARD materiality gate ──
  // A real-but-negligible event (e.g. a $2M contract at a $44B-revenue company)
  // is NOT information asymmetry — it is the efficient-market response to an
  // irrelevant record. Reject it outright rather than labeling it "candidate"
  // or "promising". This is the single most important filter in the product.
  if (args.materiality.level === 'IMMATERIAL') {
    reasons.push(`Economically immaterial — ${args.materiality.metric} is ${(args.materiality.ratio! * 100).toExponential(1)}%, below the 0.25% relevance floor.`);
    return { status: 'reject' as ThesisStatus, reasons };
  }

  if (!args.hasPrimaryEvidence || args.adversarial.fatalContradiction) {
    return { status: 'reject' as ThesisStatus, reasons };
  }
  if (!args.hasThesis || args.materiality.ratio == null || args.completeness < 60) {
    return { status: 'watch' as ThesisStatus, reasons };
  }
  if (args.completeness >= 85 && args.materiality.level !== 'LOW' && args.materiality.level !== 'IMMATERIAL' && args.relationshipConfidence >= 85 && args.adversarial.confidencePenalty < 20) {
    return { status: 'verified' as ThesisStatus, reasons };
  }
  return { status: 'candidate' as ThesisStatus, reasons };
}

export function buildResearchReport(input: ResearchReportInput): ResearchReport {
  const combined = allText(input);
  const definedVariable = hasDefinedPriceVariable(combined);
  const rejectedClaims: ResearchClaim[] = [];
  const unverifiedClaims: ResearchClaim[] = [];

  if (definedVariable && claimsSpotPriceIsTrigger(combined)) {
    rejectedClaims.push({
      status: 'rejected',
      text: 'Spot stock price directly triggers the contractual payment.',
      reason: 'The source uses a defined contractual price variable. Spot price can be early-warning context only unless equivalence is explicit.',
    });
  }
  if (claimsUnverifiedShareSettlement(combined)) {
    unverifiedClaims.push({
      status: 'unverified',
      text: 'The true-up can be settled in shares.',
      reason: 'Share settlement must be proven from the contract before being presented as fact.',
    });
  }

  if (input.materiality.ratio == null) {
    unverifiedClaims.push({
      status: 'unverified',
      text: 'Financial materiality is quantified.',
      reason: input.materiality.denominator != null
        ? 'Event amount (market opportunity / contract value) is missing, so no ratio can be computed.'
        : 'Materiality denominator is missing.',
    });
  }
  if (!input.attentionMeasured) {
    unverifiedClaims.push({
      status: 'unverified',
      text: 'The catalyst is overlooked or not priced in.',
      reason: input.attentionAvailable
        ? 'Only a company-level attention proxy is available — no catalyst-specific coverage observed.'
        : 'Catalyst attention has not been measured.',
    });
  }

  const signalFacts: ResearchClaim[] = input.signals.slice(0, 5).map((signal) => ({
    status: 'verified',
    text: signal.title,
    evidence: signal.sourceType,
  }));
  const deepFacts: ResearchClaim[] = (input.deepResearch?.verifiedFacts || []).map((fact) => ({
    status: 'verified',
    text: fact.text,
    evidence: fact.sourceUrl || input.deepResearch?.researchers?.join(', '),
  }));
  const verifiedFacts = [...deepFacts, ...signalFacts]
    .filter((fact, index, facts) => facts.findIndex((candidate) => candidate.text === fact.text) === index)
    .slice(0, 12);

  const inferredClaims: ResearchClaim[] = [input.thesis, ...(input.deepResearch?.inferredClaims || [])]
    .filter((claim, index, claims): claim is string => !!claim && claims.indexOf(claim) === index)
    .map((claim) => ({ status: 'inferred', text: claim, reason: 'Thesis synthesized from normalized and source-specific public evidence.' }));

  for (const contradiction of input.deepResearch?.contradictions || []) {
    unverifiedClaims.push({ status: 'unverified', text: contradiction, reason: 'Source-specific researcher identified this limiting claim.' });
  }

  const checks = buildChecks(input, combined);
  const completeness = completenessFromChecks(checks);
  const relationshipConfidence = input.relationshipConfidence ?? 70;
  const qualification = statusFromReport({
    hasPrimaryEvidence: input.signals.length > 0,
    hasThesis: !!input.thesis || input.signals.length > 0,
    materiality: input.materiality,
    adversarial: input.adversarial,
    completeness,
    relationshipConfidence,
  });
  const confidence = clamp(
    35 +
    (input.signals.length > 0 ? 15 : 0) +
    (input.materiality.ratio != null ? 20 : 0) +
    (input.priceReactionAvailable ? 10 : 0) +
    (input.attentionAvailable ? 10 : 0) -
    input.adversarial.confidencePenalty
  );
  const scenario = extractTrueUpScenario(combined);

  return {
    version: 'research_report_v1',
    thesis: input.thesis || input.title,
    thesisStatus: qualification.status,
    summary: input.deepResearch?.summary || (qualification.status === 'verified'
      ? 'High-confidence public-signal thesis with core checks resolved.'
      : 'Promising public-signal thesis; unresolved checks limit conviction.'),
    verifiedFacts,
    inferredClaims,
    unverifiedClaims,
    rejectedClaims,
    researchChecks: checks,
    sources: input.signals.map((signal) => ({
      sourceType: signal.sourceType,
      title: signal.title,
      url: signal.sourceUrl,
      publishedAt: signal.publishedAt ? new Date(signal.publishedAt).toISOString() : null,
    })),
    materiality: input.materiality,
    adversarial: input.adversarial,
    scenarioTables: scenario ? [scenario] : [],
    missingInputs: [...new Set([
      ...checks.filter((check) => check.status === 'pending').map((check) => check.result),
      ...(input.deepResearch?.missingInputs || []),
    ])],
    openQuestions: [
      ...unverifiedClaims.map((claim) => claim.reason || claim.text),
      ...input.adversarial.findings.map((finding) => finding.finding),
      ...(input.deepResearch?.openQuestions || []),
    ].filter(Boolean),
    confidence,
    completeness,
    qualificationReasons: qualification.reasons,
  };
}
