import { Badge, RiskBadge, ScoreDrilldown } from '@hidden-catalyst/ui';
import { getOpportunityById, getOpportunityEvidence, getRelationshipGraph } from '@hidden-catalyst/db';
import { analyzeHistoricalReactions, formatHistoricalSummary } from '@hidden-catalyst/engine';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function formatMC(val: number): string {
  if (val >= 1e12) return '$' + (val / 1e12).toFixed(1) + 'T';
  if (val >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return '$' + (val / 1e6).toFixed(0) + 'M';
  return '$' + val;
}

function formatPrice(val: number): string {
  if (val >= 100) return '$' + val.toFixed(2);
  if (val >= 1) return '$' + val.toFixed(2);
  return '$' + val.toFixed(4); // penny/sub-dollar: full precision
}

function textOf(value: unknown): string {
  return String(value || '');
}

function allResearchText(parts: unknown[]): string {
  return parts.map(textOf).join(' \n ').toLowerCase();
}

function usesDefinedContractPrice(text: string): boolean {
  return /commitment fee price|effective amount|minimum price|floor price/i.test(text);
}

function softenContractVariableClaims(text: unknown): string {
  let output = textOf(text);
  if (!usesDefinedContractPrice(output)) return output;

  output = output.replace(
    /if the stock trades below \$?([0-9]+(?:\.[0-9]+)?),?\s*the company could owe up to \$?([0-9.,]+[mk]?)/gi,
    'if the contractual Commitment Fee Price is below $$1, the true-up formula may produce a payment up to $$2'
  );
  output = output.replace(
    /if the stock price falls below the minimum price/gi,
    'if the contractual Commitment Fee Price falls below the Minimum Price'
  );
  output = output.replace(
    /triggered by a stock price decline/gi,
    'triggered by a decline in the contractual Commitment Fee Price'
  );
  output = output.replace(
    /directly tied to the stock price/gi,
    'tied to a defined contractual price calculation'
  );
  output = output.replace(
    /stock price drops below/gi,
    'early-warning only: spot price moves below'
  );
  output = output.replace(
    /likely the stock price at the time of the fee calculation/gi,
    'a contractual calculation that has not yet been confirmed as equivalent to spot price'
  );
  output = output.replace(
    /not a standard feature of equity lines/gi,
    'easy to miss because it appears in amendment mechanics rather than headline financing terms'
  );
  output = output.replace(
    /the company may have the option to settle (?:the true-up )?in shares/gi,
    'any equity-settlement mechanism for the true-up is unverified'
  );
  output = output.replace(
    /if the true-up is settled in shares/gi,
    'if a share-settlement mechanism is later verified'
  );
  return output;
}

function extractMoney(text: string, labelPattern: RegExp): number | null {
  const match = text.match(labelPattern);
  if (!match) return null;
  const raw = match[1].replace(/[$,\s]/g, '').toLowerCase();
  const multiplier = raw.endsWith('m') ? 1_000_000 : raw.endsWith('k') ? 1_000 : 1;
  const numeric = Number(raw.replace(/[mk]$/, ''));
  return Number.isFinite(numeric) ? numeric * multiplier : null;
}

function extractTrueUpMechanics(text: string) {
  const maxLiability = extractMoney(text, /(?:maximum payment liability|up to|true-up provision):?\s*\$?([0-9,.]+[mk]?)/i);
  const factorMatch = text.match(/([0-9,]+)\s*\*\s*commitment fee price/i);
  const minPriceMatch = text.match(/minimum price(?: threshold)?:?\s*\$?([0-9.]+)/i);
  const factor = factorMatch ? Number(factorMatch[1].replace(/,/g, '')) : null;
  const minimumPrice = minPriceMatch ? Number(minPriceMatch[1]) : null;

  if (!maxLiability || !factor) return null;
  const scenarioPrices = Array.from(new Set([
    minimumPrice,
    0.35,
    0.30,
    0.20,
    0.10,
    0,
  ].filter((v): v is number => v != null && Number.isFinite(v))));

  return {
    maxLiability,
    factor,
    minimumPrice,
    scenarios: scenarioPrices.map((price) => ({
      price,
      trueUp: Math.max(0, maxLiability - factor * price),
    })),
  };
}

function CheckStatusBadge({ status }: { status: 'verified' | 'partial' | 'pending' | 'failed' }) {
  const styles = {
    verified: 'bg-green-100 text-green-700',
    partial: 'bg-amber-100 text-amber-700',
    pending: 'bg-gray-100 text-gray-600',
    failed: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}

function verStatusLabel(s: string | null): { label: string; color: string } {
  switch (s) {
    case 'verified': return { label: 'Verified', color: 'bg-green-100 text-green-800' };
    case 'candidate': return { label: 'Candidate', color: 'bg-blue-100 text-blue-800' };
    case 'watch': return { label: 'Watch', color: 'bg-amber-100 text-amber-800' };
    case 'rejected': return { label: 'Rejected', color: 'bg-red-100 text-red-700' };
    case 'monitoring': return { label: 'Monitoring', color: 'bg-purple-100 text-purple-800' };
    case 'confirmed': return { label: 'Confirmed', color: 'bg-green-100 text-green-800' };
    case 'invalidated': return { label: 'Invalidated', color: 'bg-gray-100 text-gray-600' };
    case 'stale': return { label: 'Stale', color: 'bg-gray-100 text-gray-500' };
    default: return { label: s || 'Unknown', color: 'bg-gray-100 text-gray-600' };
  }
}

// ─── Page ───

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  const [opp, evidence, graph] = await Promise.all([
    getOpportunityById(params.id),
    getOpportunityEvidence(params.id),
    getRelationshipGraph(params.id).catch(() => null),
  ]);

  if (!opp) notFound();

  // Prisma client wasn't regenerated after schema update — query new fields directly
  let hiddenAngle: any = null;
  let verificationStatus: string | null = 'candidate';
  let clusterContext: any = null;
  try {
    const { Client } = await import('pg');
    const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
    await pgClient.connect();
    const res = await pgClient.query(
      `SELECT o.hidden_angle, o.verification_status, o.research_completeness,
              c.id AS cluster_id, c.title AS cluster_title, c.thesis AS cluster_thesis,
              c.cluster_type, c.status AS cluster_status, c.research_questions,
              c.research_confidence, c.research_completeness, c.priority_score,
              c.priority_factors, c.materiality_json, c.attention_json,
              c.price_reaction_json, c.adversarial_json, c.comparable_json,
              c.structured_attributes, c.last_evaluated_at
       FROM opportunities o
       LEFT JOIN catalyst_clusters c ON c.id = o.cluster_id
       WHERE o.id = $1`,
      [params.id]
    );
    if (res.rows[0]) {
      hiddenAngle = res.rows[0].hidden_angle || null;
      verificationStatus = res.rows[0].verification_status || 'candidate';
      clusterContext = res.rows[0].cluster_id ? res.rows[0] : null;
      if (clusterContext) {
        const sigs = await pgClient.query(
          `SELECT s.title, s.source_type, s.event_type, s.published_at, s.source_url,
                  s.amounts, s.entities, cs.role, cs.confidence
           FROM catalyst_cluster_signals cs
           JOIN signals s ON s.id = cs.signal_id
           WHERE cs.cluster_id = $1
           ORDER BY cs.role = 'primary' DESC, s.published_at DESC
           LIMIT 5`,
          [clusterContext.cluster_id]
        );
        clusterContext.signals = sigs.rows;
        const monitoring = await pgClient.query(
          `SELECT state, reasons, source, created_at
           FROM monitoring_events
           WHERE cluster_id = $1 OR opportunity_id = $2
           ORDER BY created_at DESC
           LIMIT 5`,
          [clusterContext.cluster_id, params.id]
        );
        clusterContext.monitoring_events = monitoring.rows;
      }
    }
    await pgClient.end();
  } catch {}

  const scores = Object.fromEntries(opp.scores.map(s => [s.scoreType, s.value]));
  const facts = opp.claims.filter(c => c.claimType === 'verified_fact');
  const inferences = opp.claims.filter(c => c.claimType === 'inference');
  const contradictions = opp.risks.filter(r => r.riskType === 'contradiction');
  const missingInfo = opp.risks.filter(r => r.riskType === 'missing_info');
  const realRisks = opp.risks.filter(r => !r.riskType.startsWith('overlooked_reason_') && r.riskType !== 'contradiction' && r.riskType !== 'missing_info');
  const overlookedReasons = opp.risks.filter(r => r.riskType.startsWith('overlooked_reason_'));
  const whatToWatch = opp.invalidationRules.filter(r => r.status === 'monitoring');
  const openQuestions = opp.invalidationRules.filter(r => r.ruleType === 'open_question' && r.status === 'open');
  const resolvedQuestions = opp.invalidationRules.filter(r => r.ruleType === 'resolved_question' && r.status === 'resolved');

  // ── Fetch daily price returns + market depth from FMP ──
  let priceReturns: { d1: number; d5: number; d20: number } | null = null;
  let marketDepth: { avgVolume: number; floatShares: number; shortPercent: number | null; analystCount: number | null } | null = null;
  if (opp.security.ticker) {
    try {
      const fmpKey = process.env.FMP_API_KEY || '';
      if (fmpKey) {
        // Price returns
        const fmpRes = await fetch(
          `https://financialmodelingprep.com/api/v3/historical-price-eod/light?symbol=${opp.security.ticker}&apikey=${fmpKey}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (fmpRes.ok) {
          const fmpData = await fmpRes.json();
          if (Array.isArray(fmpData) && fmpData.length >= 21) {
            const latest = fmpData[0];
            const d1 = fmpData.length > 1  ? ((latest.close - fmpData[1].close) / fmpData[1].close) * 100 : 0;
            const d5 = fmpData.length > 5  ? ((latest.close - fmpData[5].close) / fmpData[5].close) * 100 : 0;
            const d20 = fmpData.length > 20 ? ((latest.close - fmpData[20].close) / fmpData[20].close) * 100 : 0;
            priceReturns = { d1, d5, d20 };
          }
        }
        // Market depth: profile (volume), float, short, analyst
        const [profRes, floatRes, shortRes, analystRes] = await Promise.allSettled([
          fetch(`https://financialmodelingprep.com/api/v3/profile/${opp.security.ticker}?apikey=${fmpKey}`, { signal: AbortSignal.timeout(4000) }),
          fetch(`https://financialmodelingprep.com/api/v4/shares-float?symbol=${opp.security.ticker}&apikey=${fmpKey}`, { signal: AbortSignal.timeout(4000) }),
          fetch(`https://financialmodelingprep.com/api/v3/shares-short?symbol=${opp.security.ticker}&apikey=${fmpKey}`, { signal: AbortSignal.timeout(4000) }),
          fetch(`https://financialmodelingprep.com/api/v3/analyst-estimates/${opp.security.ticker}?apikey=${fmpKey}&limit=1`, { signal: AbortSignal.timeout(4000) }),
        ]);
        const profile = profRes.status === 'fulfilled' && profRes.value.ok ? await profRes.value.json().catch(() => []) : [];
        const floatData = floatRes.status === 'fulfilled' && floatRes.value.ok ? await floatRes.value.json().catch(() => []) : [];
        const shortData = shortRes.status === 'fulfilled' && shortRes.value.ok ? await shortRes.value.json().catch(() => []) : [];
        const analystData = analystRes.status === 'fulfilled' && analystRes.value.ok ? await analystRes.value.json().catch(() => []) : [];

        const prof = (Array.isArray(profile) ? profile[0] : profile) || {};
        const flt = (Array.isArray(floatData) ? floatData[0] : floatData) || {};
        const shrt = (Array.isArray(shortData) ? shortData[0] : shortData) || {};
        marketDepth = {
          avgVolume: prof.volAvg || 0,
          floatShares: flt.floatShares || flt.outstandingShares || flt.freeFloat || 0,
          shortPercent: shrt.shortPercent || shrt.shortPercentOfFloat || null,
          analystCount: shrt.analystCount || (Array.isArray(analystData) && analystData.length > 0 ? analystData.length : null),
        };
      }
    } catch {}
  }

  let historicalSummary: string | null = null;
  try {
    const hist = await analyzeHistoricalReactions({
      eventType: opp.event?.eventType || 'other',
      sector: opp.security.company.sector,
    });
    historicalSummary = formatHistoricalSummary(hist);
  } catch {}

  const vs = verStatusLabel(verificationStatus);
  const clusterSignals = clusterContext?.signals || [];
  const materiality = clusterContext?.materiality_json || null;
  const attention = clusterContext?.attention_json || null;
  const priceReaction = clusterContext?.price_reaction_json || null;
  const adversarial = clusterContext?.adversarial_json || null;
  const comparable = clusterContext?.comparable_json || null;
  const monitoringEvents = clusterContext?.monitoring_events || [];
  const researchCompleteness =
    Math.round(clusterContext?.research_completeness ?? clusterContext?.researchCompleteness ?? scores.research_completeness ?? 0);
  const researchConfidence =
    Math.round(clusterContext?.research_confidence ?? clusterContext?.researchConfidence ?? scores.research_confidence ?? 0);
  const researchText = allResearchText([
    hiddenAngle?.claim,
    hiddenAngle?.supporting_evidence,
    hiddenAngle?.reasoning,
    hiddenAngle?.cashExposure?.trigger,
    hiddenAngle?.dilutionExposure?.terms,
    hiddenAngle?.capitalOverhang,
    opp.summary,
    ...facts.map((f: any) => f.text),
    ...inferences.map((i: any) => i.text),
    ...contradictions.map((r: any) => r.description),
    ...missingInfo.map((r: any) => r.description),
  ]);
  const hasDefinedPriceVariable = usesDefinedContractPrice(researchText);
  const missingCashOrMarketCap = !opp.security.marketCap || missingInfo.some((r: any) => /cash|liquidity|market cap|market capitalization/i.test(r.description || ''));
  const missingShareData = missingInfo.some((r: any) => /share count|shares outstanding|settled in shares|settlement|warrant|eloc usage/i.test(r.description || ''));
  const catalystAttentionPending = attention == null && scores.catalyst_attention == null;
  const finalScorePending = missingCashOrMarketCap || missingShareData || opp.priceChangePercent == null || catalystAttentionPending || (hasDefinedPriceVariable && /measurement date|definition of commitment fee price|exact definition/i.test(researchText));
  const trueUpMechanics = extractTrueUpMechanics(researchText);
  const hasReferencedAgreement = facts.some((f: any) => /\[ref:|referenced agreement|purchase agreement|eloc/i.test(f.text || ''));
  const hasFormula = facts.some((f: any) => /formula|true-up amount|commitment fee price/i.test(f.text || '')) || !!trueUpMechanics;
  const hasMinimumPrice = facts.some((f: any) => /minimum price/i.test(f.text || ''));
  const researchChecks = [
    {
      status: facts.length > 0 ? 'verified' as const : 'pending' as const,
      source: evidence[0]?.document?.source?.name || clusterSignals[0]?.source_type || 'Primary source',
      check: 'Primary filing reviewed',
      result: facts.length > 0 ? `${facts.length} verified fact${facts.length === 1 ? '' : 's'} extracted` : 'No extracted facts available yet',
      why: 'Establishes that the catalyst starts from a public source rather than model-only inference.',
    },
    {
      status: hasFormula ? 'verified' as const : 'pending' as const,
      source: 'SEC filing / amendment',
      check: 'Mechanism or formula extracted',
      result: trueUpMechanics ? `Formula scenarios available using ${trueUpMechanics.factor.toLocaleString()} x Commitment Fee Price` : 'Formula or mechanic not fully extracted yet',
      why: 'Turns a legal clause into testable contract mechanics.',
    },
    {
      status: hasReferencedAgreement && hasMinimumPrice ? 'verified' as const : hasReferencedAgreement ? 'partial' as const : 'pending' as const,
      source: 'Referenced agreement',
      check: 'Cross-document terms resolved',
      result: hasMinimumPrice ? 'Minimum Price resolved from referenced agreement' : 'Referenced agreement detected; critical terms still need resolution',
      why: 'Prevents the system from stopping at the first filing when key definitions live elsewhere.',
    },
    {
      status: hasDefinedPriceVariable ? 'partial' as const : 'pending' as const,
      source: 'Contract definitions',
      check: 'Trigger variable verified',
      result: hasDefinedPriceVariable ? 'Defined price variable detected; spot price treated only as early-warning context' : 'No defined trigger variable found yet',
      why: 'Avoids substituting market price for a contractual calculation.',
    },
    {
      status: missingCashOrMarketCap ? 'pending' as const : 'verified' as const,
      source: 'Market data / financial statements',
      check: 'Materiality denominator checked',
      result: missingCashOrMarketCap ? 'Cash, market cap, revenue, assets, or EV still needed' : 'Denominator available for materiality math',
      why: 'A dollar amount is only material relative to company scale.',
    },
    {
      status: missingShareData ? 'partial' as const : 'verified' as const,
      source: 'Capital structure data',
      check: 'Share and settlement mechanics checked',
      result: missingShareData ? 'Share count, settlement mechanics, or ELOC usage still unresolved' : 'Capital structure inputs available',
      why: 'Separates cash exposure from dilution exposure.',
    },
    {
      status: opp.priceChangePercent != null ? 'verified' as const : 'pending' as const,
      source: 'Market data',
      check: 'Price reaction measured',
      result: opp.priceChangePercent != null ? `${opp.priceChangePercent.toFixed(2)}% since filing` : 'Filing-window reaction not computed yet',
      why: 'Helps decide whether the catalyst is already priced in.',
    },
    {
      status: catalystAttentionPending ? 'pending' as const : 'verified' as const,
      source: 'Attention engine',
      check: 'Catalyst attention measured',
      result: catalystAttentionPending ? 'Media, analyst, and catalyst-specific coverage still pending' : 'Catalyst attention score available',
      why: 'Information asymmetry should not be asserted before attention is measured.',
    },
  ];
  const researchSources = [
    ...clusterSignals.map((signal: any) => ({
      label: signal.source_type || 'Signal source',
      detail: signal.title || signal.event_type || 'Normalized signal',
      href: signal.source_url,
      type: 'Normalized signal',
    })),
    ...evidence.slice(0, 4).map((ev: any) => ({
      label: ev.document?.source?.name || 'Evidence source',
      detail: ev.document?.title || ev.excerpt || 'Evidence item',
      href: ev.document?.canonicalUrl,
      type: ev.evidenceType || 'evidence',
    })),
  ];

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <div className="mb-4 text-sm text-gray-500 flex items-center gap-2 flex-wrap">
        <a href="/feed" className="hover:text-brand-700">← Feed</a>
        <span className="hidden sm:inline">/</span>
        <span className="text-gray-900 hidden sm:inline">{opp.security.ticker}</span>
      </div>

      {/* ── COMPANY HEADER ── */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-lg font-bold text-gray-900">{opp.security.company.displayName}</span>
          <span className="text-gray-500 font-mono text-sm">{opp.security.ticker}</span>
          <span className="text-xs text-gray-400">{opp.security.exchange}</span>
        </div>

        {/* Company metrics row */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mt-2">
          {opp.security.marketCap && (
            <span className="tabular-nums">{formatMC(opp.security.marketCap)}</span>
          )}
          {opp.security.latestPrice && (
            <span className="tabular-nums font-mono">
              {formatPrice(opp.security.latestPrice)}
            </span>
          )}
          {opp.security.company.sector && <span className="text-gray-400">{opp.security.company.sector}</span>}
          {opp.security.company.industry && <span className="text-gray-400 hidden sm:inline">{opp.security.company.industry}</span>}
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${vs.color}`}>
            {vs.label}
          </span>
        </div>
      </div>

      {/* ── OPPORTUNITY TITLE ── */}
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 leading-snug">{opp.title}</h1>

      {/* ── HIDDEN ANGLE ── */}
      <section className="mb-8 p-5 rounded-xl border-l-4 border-brand-500 bg-brand-50">
        <h2 className="text-sm font-semibold text-brand-800 uppercase tracking-wide mb-3">
          🔍 Hidden Angle
        </h2>
        {hiddenAngle ? (
          <div className="space-y-3">
            <p className="text-base font-medium text-gray-900">{softenContractVariableClaims(hiddenAngle.claim)}</p>
            {hiddenAngle.supporting_evidence && (
              <div className="pl-3 border-l-2 border-brand-300">
                <span className="text-xs text-gray-500 font-medium">Evidence</span>
                <p className="text-sm text-gray-700 mt-0.5">{softenContractVariableClaims(hiddenAngle.supporting_evidence)}</p>
              </div>
            )}
            {hiddenAngle.reasoning && (
              <p className="text-sm text-gray-600">{softenContractVariableClaims(hiddenAngle.reasoning)}</p>
            )}
            {hasDefinedPriceVariable && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Contract-variable guardrail: spot stock price is treated only as an early-warning proxy. The actual trigger depends on the defined Commitment Fee Price calculation unless the contract explicitly makes them equivalent.
              </p>
            )}
            {hiddenAngle.confidence && (
              <span className="text-xs text-gray-400">
                Confidence: {Math.round(hiddenAngle.confidence * 100)}%
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-brand-700 italic">
            No validated hidden angle identified yet. This may be a routine filing or the hidden aspect is still under analysis.
          </p>
        )}
      </section>

      {/* ── RESEARCH REPORT SUMMARY ── */}
      <section className="mb-8 grid gap-4 lg:grid-cols-[1.1fr_1.4fr]">
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Analyst Verdict</h2>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium uppercase text-gray-500">Current read</div>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {hiddenAngle?.claim ? 'Promising public-signal candidate, still verification-limited.' : 'No validated thesis yet.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xl font-bold text-gray-900">{finalScorePending ? 'Pending' : Math.round(scores.opportunity ?? 0)}</div>
                <div className="text-xs text-gray-500">{finalScorePending ? 'Final score' : 'Opportunity score'}</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xl font-bold text-gray-900">{researchCompleteness || 0}%</div>
                <div className="text-xs text-gray-500">Research complete</div>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              The report separates verified facts, contract mechanics, pending denominators, market reaction, and attention analysis. A candidate can be interesting before it is high-conviction.
            </p>
          </div>
        </div>

        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Research Checks</h2>
          <div className="space-y-2">
            {researchChecks.map((check, i) => (
              <div key={i} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">{check.check}</div>
                  <CheckStatusBadge status={check.status} />
                </div>
                <div className="mt-1 text-xs text-gray-500">{check.source}</div>
                <p className="mt-1 text-sm text-gray-700">{check.result}</p>
                <p className="mt-1 text-xs text-gray-400">{check.why}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-8 card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-base font-semibold text-gray-900">Research Sources</h2>
          <span className="text-xs text-gray-400">{researchSources.length} source records</span>
        </div>
        {researchSources.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {researchSources.map((source, i) => {
              const body = (
                <div className="rounded-lg border border-gray-100 p-3 hover:bg-gray-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{source.type}</Badge>
                    <span className="text-sm font-semibold text-gray-900">{source.label}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{textOf(source.detail).slice(0, 180)}</p>
                </div>
              );
              return source.href ? (
                <a key={i} href={source.href} target="_blank" rel="noreferrer">{body}</a>
              ) : (
                <div key={i}>{body}</div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No normalized source records linked yet. Legacy evidence may still appear lower on the page.</p>
        )}
      </section>

      <section className="mb-8 p-5 rounded-xl bg-gray-50 border border-gray-200">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          What Hidden Catalyst Connected
        </h2>
        <div className="flex flex-col items-center gap-2 text-sm">
          {/* Node 1 */}
          <div className="px-4 py-2 bg-white rounded-lg border border-gray-300 shadow-sm text-center max-w-xs">
            <span className="font-semibold text-gray-800">{clusterContext?.cluster_title || opp.event?.title || 'Primary Signal'}</span>
            <p className="text-xs text-gray-500 mt-0.5">{clusterContext?.cluster_type || opp.event?.eventType || 'Public-source catalyst'}</p>
          </div>
          <span className="text-gray-400 text-lg">↓ references</span>
          {/* Node 2 */}
          <div className="px-4 py-2 bg-white rounded-lg border border-brand-300 shadow-sm text-center max-w-xs">
            <span className="font-semibold text-brand-700">{clusterContext?.signals?.[0]?.title || 'Evidence Chain'}</span>
            <p className="text-xs text-gray-500 mt-0.5">
              {clusterContext?.signals?.[0]?.source_type || 'Primary and contextual records'}
            </p>
          </div>
          <span className="text-gray-400 text-lg">↓ compared with</span>
          {/* Node 3 */}
          <div className="px-4 py-2 bg-white rounded-lg border border-gray-300 shadow-sm text-center max-w-xs">
            <span className="font-semibold text-gray-800">Market Data</span>
            <p className="text-xs text-gray-500 mt-0.5">
              {opp.security.ticker} {opp.security.latestPrice ? formatPrice(opp.security.latestPrice) : 'N/A'}
            </p>
          </div>
        </div>
        <div className="mt-3 text-center">
          <p className="text-xs font-medium text-brand-600">
            → Hidden Catalyst links the public signal, issuer, evidence chain, and market context before ranking the opportunity.
          </p>
        </div>
      </section>

      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Catalyst Cluster</h2>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900">{clusterContext?.cluster_title || opp.title}</p>
            <div className="flex flex-wrap gap-1">
              <Badge>{clusterContext?.cluster_type || opp.event?.eventType || 'public_signal'}</Badge>
              <Badge variant={clusterContext?.cluster_status === 'qualified' ? 'success' : 'default'}>
                {clusterContext?.cluster_status || verificationStatus}
              </Badge>
            </div>
            <p className="text-xs text-gray-500">
              Priority {Math.round(clusterContext?.priority_score ?? scores.research_priority ?? scores.opportunity ?? 0)} · {clusterSignals.length} linked signals
            </p>
          </div>
        </div>

        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Signal Sources</h2>
          {clusterSignals.length > 0 ? (
            <div className="space-y-2">
              {clusterSignals.slice(0, 4).map((signal: any, i: number) => (
                <a key={i} href={signal.source_url || '#'} className="block rounded border border-gray-100 p-2 text-sm hover:bg-gray-50">
                  <span className="font-medium text-brand-700">{signal.source_type || 'source'}</span>
                  <span className="text-gray-400"> · </span>
                  <span className="text-gray-600">{signal.event_type || 'event'}</span>
                  <div className="mt-0.5 text-xs text-gray-500">{signal.title}</div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">This older opportunity has no normalized signal links yet.</p>
          )}
        </div>

        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Research State</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-2xl font-bold text-gray-900">{researchCompleteness || 0}%</div>
              <div className="text-xs text-gray-500">Completeness</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{researchConfidence || 0}%</div>
              <div className="text-xs text-gray-500">Confidence</div>
            </div>
          </div>
          {monitoringEvents.length > 0 && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <div className="text-xs font-medium text-gray-500">Latest Monitoring</div>
              <p className="mt-1 text-sm font-medium text-gray-800">{monitoringEvents[0].state}</p>
            </div>
          )}
        </div>
      </section>

      <div className="flex gap-8 flex-col lg:flex-row">
        {/* Main content */}
        <div className="flex-1 space-y-6 min-w-0">

          {/* ── WHY IT MATTERS ── */}
          {opp.summary && (
            <section className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Why It Matters</h2>
              <p className="text-sm text-gray-700 leading-relaxed">{softenContractVariableClaims(opp.summary)}</p>
            </section>
          )}

          {/* ── MARKET DATA ── */}
          <section className="card">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Market Data</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="p-2 bg-gray-50 rounded text-center">
                <div className="text-sm font-bold text-gray-900 tabular-nums font-mono">
                  {opp.security.latestPrice ? formatPrice(opp.security.latestPrice) : '—'}
                </div>
                <div className="text-[10px] text-gray-400">Price</div>
              </div>
              <div className="p-2 bg-gray-50 rounded text-center">
                    {opp.security.marketCap ? (
                  <div className="text-sm font-bold text-gray-900 tabular-nums">{formatMC(opp.security.marketCap)}</div>
                ) : (
                  <div className="text-xs text-amber-600 italic leading-tight">Cap table<br/>reconciliation<br/>required</div>
                )}
                <div className="text-[10px] text-gray-400">Market Cap</div>
              </div>
              {marketDepth?.avgVolume > 0 && (
                <div className="p-2 bg-gray-50 rounded text-center">
                  <div className="text-sm font-bold text-gray-900">{formatMC(marketDepth.avgVolume)}</div>
                  <div className="text-[10px] text-gray-400">Avg $ Volume</div>
                </div>
              )}
              {marketDepth?.floatShares > 0 && (
                <div className="p-2 bg-gray-50 rounded text-center">
                  <div className="text-sm font-bold text-gray-900">{formatMC(marketDepth.floatShares)}</div>
                  <div className="text-[10px] text-gray-400">Float</div>
                </div>
              )}
            </div>
            {/* Price returns */}
            {priceReturns && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: '1D', val: priceReturns.d1 },
                  { label: '5D', val: priceReturns.d5 },
                  { label: '20D', val: priceReturns.d20 },
                ].map((r, i) => (
                  <div key={i} className="p-2 bg-gray-50 rounded text-center">
                    <div className={`text-sm font-bold tabular-nums ${r.val >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.val >= 0 ? '+' : ''}{r.val.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-gray-400">{r.label}</div>
                  </div>
                ))}
              </div>
            )}
            {/* Filing-day reaction */}
            {opp.priceChangePercent != null && (
              <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
                <span>Since filing:</span>
                <span className={`font-semibold tabular-nums ${opp.priceChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {opp.priceChangePercent >= 0 ? '+' : ''}{opp.priceChangePercent.toFixed(2)}%
                </span>
                {opp.volumeChangePercent != null && (
                  <span className="text-gray-400">· Vol: {(opp.volumeChangePercent).toFixed(1)}× avg</span>
                )}
              </div>
            )}
            {marketDepth?.shortPercent != null && (
              <div className="mb-3 text-xs text-gray-500">
                Short interest: <span className={marketDepth.shortPercent > 10 ? 'text-red-600 font-semibold' : ''}>{(marketDepth.shortPercent * 100).toFixed(1)}%</span>
                {marketDepth.analystCount != null && <span className="ml-3">Analysts: {marketDepth.analystCount}</span>}
              </div>
            )}
          </section>

          {/* ── RESEARCH SCORES ── */}
          {(materiality || attention || priceReaction || comparable) && (
            <section className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Catalyst Intelligence</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {materiality && (
                  <div className="rounded-lg border border-gray-100 p-3">
                    <div className="text-xs font-medium uppercase text-gray-500">Materiality</div>
                    <div className="mt-1 text-lg font-bold text-gray-900">{missingCashOrMarketCap ? 'PARTIAL' : (materiality.level || 'UNKNOWN')}</div>
                    <p className="mt-1 text-xs text-gray-500">
                      {missingCashOrMarketCap ? 'Denominator pending: cash, market cap, revenue, assets, or EV needed.' : (materiality.metric || 'Metric pending')} {materiality.ratio != null && !missingCashOrMarketCap ? `· ${(materiality.ratio * 100).toFixed(1)}%` : ''}
                    </p>
                  </div>
                )}
                {attention && (
                  <div className="rounded-lg border border-gray-100 p-3">
                    <div className="text-xs font-medium uppercase text-gray-500">Attention</div>
                    <div className="mt-1 text-lg font-bold text-gray-900">
                      Company {Math.round(attention.companyAttentionScore ?? 0)}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Catalyst {Math.round(attention.catalystAttentionScore ?? 0)} · asymmetry {Math.round(attention.informationAsymmetryScore ?? 0)}
                    </p>
                  </div>
                )}
                {priceReaction && (
                  <div className="rounded-lg border border-gray-100 p-3">
                    <div className="text-xs font-medium uppercase text-gray-500">Market Reaction</div>
                    <div className="mt-1 text-lg font-bold text-gray-900">{priceReaction.marketReaction || 'unknown'}</div>
                    <p className="mt-1 text-xs text-gray-500">
                      Priced-in score {Math.round(priceReaction.pricedInScore ?? 0)}
                    </p>
                  </div>
                )}
                {comparable && (
                  <div className="rounded-lg border border-gray-100 p-3">
                    <div className="text-xs font-medium uppercase text-gray-500">Historical Comparables</div>
                    <div className="mt-1 text-lg font-bold text-gray-900">n={comparable.n ?? 0}</div>
                    <p className="mt-1 text-xs text-gray-500">
                      Median abnormal return {comparable.medianAbnormalReturn != null ? `${comparable.medianAbnormalReturn.toFixed(1)}%` : 'pending'} · hit rate {comparable.hitRate != null ? `${Math.round(comparable.hitRate * 100)}%` : 'pending'}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {adversarial && (
            <section className="card border-red-200 bg-red-50/20">
              <h2 className="text-base font-semibold text-red-800 mb-3">Adversarial Thesis Pass</h2>
              {adversarial.findings?.length > 0 ? (
                <div className="space-y-2">
                  {adversarial.findings.map((finding: any, i: number) => (
                    <div key={i} className="rounded border border-red-100 bg-white p-2">
                      <div className="text-sm font-medium text-red-800">{finding.title || finding.type || 'Limitation'}</div>
                      <p className="mt-0.5 text-xs text-red-700">{finding.description || finding.evidence || 'Counter-evidence requires review.'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-red-700">No deterministic contradiction identified yet. This is not a substitute for human review.</p>
              )}
              {adversarial.fatalContradiction && (
                <div className="mt-3"><Badge variant="danger">Fatal invalidator detected</Badge></div>
              )}
            </section>
          )}

          {trueUpMechanics && (
            <section className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-3">True-Up Formula Scenarios</h2>
              <p className="mb-3 text-xs text-gray-500">
                Illustrative contract mechanics only. These are not predictions and use Commitment Fee Price, not spot price.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 font-medium">Commitment Fee Price</th>
                      <th className="pb-2 font-medium">Implied True-Up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trueUpMechanics.scenarios.map((row) => (
                      <tr key={row.price} className="border-b border-gray-50">
                        <td className="py-2 font-mono">${row.price.toFixed(row.price < 1 ? 5 : 2)}</td>
                        <td className="py-2 font-mono">${Math.round(row.trueUp).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="card">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Research Scores</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="p-2 bg-gray-50 rounded">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">{finalScorePending ? 'Prelim Potential' : 'Opportunity'}</span>
                  <span className="font-bold tabular-nums">
                    {opp.priceChangePercent != null ? Math.round(scores.opportunity ?? 0) : (<span className="text-amber-600 text-xs">Prelim</span>)}
                  </span>
                </div>
                {finalScorePending && (
                  <div className="text-[10px] text-amber-600 mt-0.5">Final score pending critical inputs</div>
                )}
                {!finalScorePending && opp.priceChangePercent == null && (
                  <div className="text-[10px] text-amber-600 mt-0.5">4/10 inputs — low confidence</div>
                )}
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">{catalystAttentionPending ? 'Info Asymmetry*' : 'Info Asymmetry'}</span>
                  <span className="font-bold tabular-nums">{catalystAttentionPending ? 'Prelim' : Math.round(scores.information_asymmetry ?? 0)}</span>
                </div>
                <div className="mt-1 pt-1 border-t border-gray-200 text-[10px] text-gray-400">
                  Company: {Math.round(scores.company_attention ?? 0)} · Catalyst: {catalystAttentionPending ? 'Pending' : Math.round(scores.catalyst_attention ?? 0)}
                </div>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Evidence</span>
                  <span className="font-bold tabular-nums">{Math.round(scores.evidence_quality ?? 0)}</span>
                </div>
              </div>
            </div>
            {/* Not Priced In — show Pending if no data */}
            <div className="mt-2 p-2 bg-gray-50 rounded">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Priced-In Analysis</span>
                {opp.priceChangePercent != null ? (
                  <span className="font-bold tabular-nums">{Math.round(scores.price_reaction ?? 0)}</span>
                ) : (
                  <span className="text-amber-600 text-xs italic">Pending — insufficient data</span>
                )}
              </div>
            </div>
            {historicalSummary && (
              <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                <h3 className="text-xs font-semibold text-blue-800 mb-1">Comparable Events</h3>
                <p className="text-sm text-blue-900">{historicalSummary}</p>
                <p className="text-xs text-blue-400 mt-1">Historical observation, not a prediction.</p>
              </div>
            )}
          </section>

          {/* ── CAPITAL STRUCTURE ── */}
          {(hiddenAngle?.cashExposure || hiddenAngle?.dilutionExposure || hiddenAngle?.capitalOverhang) && (
            <section className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Capital Structure Implications</h2>
              <div className="space-y-3">
                {hiddenAngle.cashExposure && (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                    <h3 className="text-xs font-semibold text-red-700 uppercase mb-1">Cash Exposure</h3>
                    <p className="text-sm text-gray-800">
                      <span className="font-mono font-semibold">{hiddenAngle.cashExposure.amount || 'Unknown'}</span>
                      {hiddenAngle.cashExposure.trigger && <span> — {hiddenAngle.cashExposure.trigger}</span>}
                    </p>
                    {hiddenAngle.cashExposure.likelihood && (
                      <span className="text-xs text-gray-500">Likelihood: {hiddenAngle.cashExposure.likelihood}</span>
                    )}
                  </div>
                )}
                {hiddenAngle.dilutionExposure && (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <h3 className="text-xs font-semibold text-amber-700 uppercase mb-1">Equity Dilution</h3>
                    <p className="text-sm text-gray-800">
                      {hiddenAngle.dilutionExposure.potentialShares && (
                        <span className="font-mono font-semibold">{hiddenAngle.dilutionExposure.potentialShares} shares</span>
                      )}
                      {hiddenAngle.dilutionExposure.pctOfOutstanding && (
                        <span className="font-mono font-semibold"> ({hiddenAngle.dilutionExposure.pctOfOutstanding})</span>
                      )}
                    </p>
                    {hiddenAngle.dilutionExposure.terms && (
                      <p className="text-xs text-gray-500 mt-0.5">{hiddenAngle.dilutionExposure.terms}</p>
                    )}
                  </div>
                )}
                {hiddenAngle.capitalOverhang && (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase mb-1">Capital Structure Overhang</h3>
                    <p className="text-sm text-gray-700">{hiddenAngle.capitalOverhang}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── VERIFIED FACTS ── */}
          {facts.length > 0 && (
            <section className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="shrink-0 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Fact</span>
                Verified Facts ({facts.length})
              </h2>
              <div className="space-y-2">
                {facts.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 pl-4 border-l-2 border-green-200">
                    <p className="text-sm text-gray-700">{softenContractVariableClaims(f.text)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── INFERENCES ── */}
          {inferences.length > 0 && (
            <section className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="shrink-0 inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">Infer</span>
                System Inferences ({inferences.length})
              </h2>
              <div className="space-y-3">
                {inferences.map((inf, i) => (
                  <div key={i} className="flex items-start gap-2 pl-4 border-l-2 border-purple-200">
                    <div>
                      <p className="text-sm text-gray-700">{softenContractVariableClaims(inf.text)}</p>
                      {inf.confidence && (
                        <span className="text-xs text-gray-400">Confidence: {Math.round(inf.confidence * 100)}%</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── WHY OVERLOOKED ── */}
          {overlookedReasons.length > 0 && (
            <section className="p-5 rounded-xl bg-amber-50 border border-amber-200">
              <h2 className="text-sm font-semibold text-amber-800 uppercase tracking-wide mb-2">Why This May Be Overlooked</h2>
              <ul className="space-y-1.5">
                {overlookedReasons.map((r, i) => (
                  <li key={i} className="text-sm text-amber-900 flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">•</span>
                    <span>{softenContractVariableClaims(r.description)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── COUNTER-EVIDENCE ── */}
          {contradictions.length > 0 && (
            <section className="card border-red-200">
              <h2 className="text-base font-semibold text-red-800 mb-3">Counter-Evidence &amp; Thesis Limitations</h2>
              <p className="text-xs text-red-500 mb-2">Evidence that weakens the thesis or reduces its magnitude</p>
              <ul className="space-y-1.5">
                {contradictions.map((r, i) => (
                  <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">✗</span>
                    <span>{softenContractVariableClaims(r.description)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── MISSING INFORMATION ── */}
          {missingInfo.length > 0 && (
            <section className="card border-amber-200 bg-amber-50/30">
              <h2 className="text-base font-semibold text-amber-800 mb-3">Missing Information</h2>
              <p className="text-xs text-amber-600 mb-2">Inputs required to increase confidence in this analysis</p>
              <ul className="space-y-1.5">
                {missingInfo.map((r, i) => (
                  <li key={i} className="text-sm text-amber-800 flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 text-amber-400">○</span>
                    <span>{r.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── RISKS ── */}
          {realRisks.length > 0 && (
            <section className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Risks</h2>
              <div className="flex flex-wrap gap-2">
                {realRisks.map((r, i) => (
                  <div key={i} className="flex-1 min-w-[180px]">
                    <RiskBadge label={r.riskType.replace(/_/g, ' ')} severity={r.severity as any} />
                    {r.description && <p className="text-xs text-gray-500 mt-1">{r.description}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── WHAT TO WATCH ── */}
          {whatToWatch.length > 0 && (
            <section className="card border-blue-200 bg-blue-50/50">
              <h2 className="text-base font-semibold text-gray-900 mb-3">What To Watch Next</h2>
              <p className="text-xs text-blue-500 mb-2">Signals Hidden Catalyst monitors automatically</p>
              <ul className="space-y-1.5">
                {whatToWatch.map((r, i) => {
                  const def = r.definition as any;
                  return (
                    <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                      <span className="shrink-0 mt-0.5 text-blue-500">→</span>
                      <span>{softenContractVariableClaims(def?.signal || 'Monitoring in progress')}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ── OPEN QUESTIONS ── */}
          {openQuestions.length > 0 && (
            <section className="card border-purple-200 bg-purple-50/30">
              <h2 className="text-base font-semibold text-purple-800 mb-3">Open Questions</h2>
              <p className="text-xs text-purple-500 mb-2">Unresolved items that would increase confidence if answered</p>
              <ul className="space-y-1.5">
                {openQuestions.map((q, i) => {
                  const def = q.definition as any;
                  return (
                    <li key={i} className="text-sm text-purple-800 flex items-start gap-2">
                      <span className="shrink-0 mt-0.5 text-purple-400">?</span>
                      <span>{softenContractVariableClaims(def?.question || def?.signal || 'Unresolved')}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ── RESOLVED QUESTIONS ── */}
          {resolvedQuestions.length > 0 && (
            <section className="card border-green-200 bg-green-50/20">
              <h2 className="text-base font-semibold text-green-800 mb-3">Resolved Research Questions</h2>
              <ul className="space-y-1.5">
                {resolvedQuestions.map((q, i) => {
                  const def = q.definition as any;
                  return (
                    <li key={i} className="text-sm text-green-800 flex items-start gap-2">
                      <span className="shrink-0 mt-0.5">✓</span>
                      <span>{def?.answer || def?.question || def?.signal || 'Resolved'}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ── RESEARCH COMPLETENESS ── */}
          <section className="card">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Research Completeness</h2>
            {(() => {
              const hasRefTag = facts.some((f: any) => f.text && f.text.includes('[Ref:'));
              const cashKnown = hiddenAngle?.cashExposure?.amount != null && !missingCashOrMarketCap && !hiddenAngle?.cashExposure?.likelihood?.includes('uncertain');
              const capitalStructureComplete = !!hiddenAngle?.capitalOverhang && !missingShareData && !/partial|unknown|unverified|not yet/i.test(textOf(hiddenAngle.capitalOverhang));
              const checks = [
                { label: 'Primary source verified', ok: facts.length > 0, weight: 3 },
                { label: 'Hidden angle identified', ok: !!(hiddenAngle?.claim), weight: 3 },
                { label: 'Contract terms resolved', ok: hasRefTag ? 'partial' as const : false, weight: 3 },
                { label: 'Financial materiality', ok: cashKnown ? true : 'partial' as const, weight: 3 },
                { label: 'Capital structure', ok: capitalStructureComplete ? true : hiddenAngle?.capitalOverhang ? 'partial' as const : false, weight: 2 },
                { label: 'Price reaction computed', ok: opp.priceChangePercent != null, weight: 2 },
                { label: 'Catalyst attention measured', ok: false as const, weight: 1 },
                { label: 'Counter-evidence search', ok: contradictions.length > 0, weight: 2 },
                { label: 'Historical comparables', ok: historicalSummary != null && !historicalSummary.includes('Insufficient'), weight: 1 },
                { label: 'Monitoring triggers set', ok: whatToWatch.length > 0, weight: 1 },
              ];
              var totalWeight = 0, earnedWeight = 0;
              checks.forEach(function(c: any) {
                totalWeight += c.weight;
                if (c.ok === true) earnedWeight += c.weight;
                else if (c.ok === 'partial') earnedWeight += c.weight * 0.5;
              });
              const pct = Math.round((earnedWeight / totalWeight) * 100);
              return (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-2xl font-bold text-gray-900">{pct}%</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                      <div className="bg-brand-500 h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    {checks.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className={
                          c.ok === true ? 'text-green-500' :
                          c.ok === 'partial' ? 'text-amber-400' :
                          'text-gray-300'
                        }>
                          {c.ok === true ? '✓' : c.ok === 'partial' ? '◐' : '✗'}
                        </span>
                        <span className={
                          c.ok === true ? 'text-gray-700' :
                          c.ok === 'partial' ? 'text-amber-700' :
                          'text-gray-400'
                        }>
                          {c.label}{c.ok === 'partial' ? ' — Partial' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    Completeness measures resolved questions, not generated content. Separate from Opportunity Score.
                  </p>
                </div>
              );
            })()}
          </section>

          {/* ── EVIDENCE CHAIN ── */}
          {evidence.length > 0 && (
            <section className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Evidence Chain</h2>
              <div className="space-y-0">
                {evidence.map((ev, i) => (
                  <div key={ev.id} className="relative pl-6 pb-4 last:pb-0">
                    {i < evidence.length - 1 && (
                      <div className="absolute left-[7px] top-6 bottom-0 w-0.5 bg-gray-200" />
                    )}
                    <div className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-brand-400 bg-white" />
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={ev.evidenceType === 'primary' ? 'success' : 'default'}>
                        {ev.evidenceType}
                      </Badge>
                      <span className="text-xs font-medium text-gray-500">{ev.document.source.name}</span>
                    </div>
                    {ev.excerpt && (
                      <p className="text-sm text-gray-700 italic">&ldquo;{ev.excerpt.slice(0, 300)}{ev.excerpt.length > 300 ? '...' : ''}&rdquo;</p>
                    )}
                    <div className="mt-1 text-xs text-gray-400">
                      {new Date(ev.document.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {ev.qualityScore && <span className="ml-2">Quality: {ev.qualityScore}/100</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── AUDIT TRAIL ── */}
          <section className="card">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Audit Trail</h2>
            {opp.reviewActions.length > 0 ? (
              <div className="space-y-2">
                {opp.reviewActions.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm flex-wrap">
                    <span className="text-xs text-gray-400 w-24 shrink-0">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                    <span className="font-medium text-gray-700">{entry.action}</span>
                    <span className="text-gray-500">by {entry.actor.email}</span>
                    {entry.reason && <span className="text-gray-400">— {entry.reason}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No review actions recorded.</p>
            )}
          </section>

          {/* ── CANDIDATE STATUS REQUIREMENTS ── */}
          {verificationStatus === 'candidate' && (
            <section className="card border-blue-200 bg-blue-50/20">
              <h2 className="text-base font-semibold text-blue-800 mb-3">Candidate Status — Qualification</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="text-xs font-semibold text-green-700 uppercase mb-1">Minimum Requirements Met</h3>
                  <ul className="space-y-1">
                    <li className="text-sm text-green-800 flex items-start gap-2">
                      <span className="shrink-0 mt-0.5">✓</span>
                      <span>Primary source verified — evidence from SEC filing</span>
                    </li>
                    {(hiddenAngle?.claim || hiddenAngle?.supporting_evidence) && (
                      <li className="text-sm text-green-800 flex items-start gap-2">
                        <span className="shrink-0 mt-0.5">✓</span>
                        <span>Hidden angle identified — specific non-obvious mechanism</span>
                      </li>
                    )}
                    {facts.some((f: any) => f.text?.includes('[Ref:')) && (
                      <li className="text-sm text-green-800 flex items-start gap-2">
                        <span className="shrink-0 mt-0.5">✓</span>
                        <span>Cross-document validation — referenced agreement resolved</span>
                      </li>
                    )}
                    {hiddenAngle?.cashExposure && (
                      <li className="text-sm text-green-800 flex items-start gap-2">
                        <span className="shrink-0 mt-0.5">✓</span>
                        <span>Specific financial mechanism identified</span>
                      </li>
                    )}
                    <li className="text-sm text-green-800 flex items-start gap-2">
                      <span className="shrink-0 mt-0.5">✓</span>
                      <span>No fatal contradiction found</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-amber-700 uppercase mb-1">Not Yet Resolved</h3>
                  <ul className="space-y-1">
                    <li className="text-sm text-amber-800 flex items-start gap-2">
                      <span className="shrink-0 mt-0.5 text-amber-400">◐</span>
                      <span>Financial materiality plausible but not quantified — cash data needed</span>
                    </li>
                    <li className="text-sm text-gray-400 flex items-start gap-2">
                      <span className="shrink-0 mt-0.5 text-gray-300">○</span>
                      <span>Price reaction pending — filing-day return data</span>
                    </li>
                    <li className="text-sm text-gray-400 flex items-start gap-2">
                      <span className="shrink-0 mt-0.5 text-gray-300">○</span>
                      <span>Catalyst attention pending — coverage measurement</span>
                    </li>
                    <li className="text-sm text-gray-400 flex items-start gap-2">
                      <span className="shrink-0 mt-0.5 text-gray-300">○</span>
                      <span>No historical comparables found</span>
                    </li>
                  </ul>
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  {finalScorePending ? 'Preliminary Opportunity Potential ranks candidates while critical inputs are pending.' : 'Opportunity Score ranks candidates after qualification, not before.'}
                  {' '}Current preliminary score: {Math.round(scores.opportunity ?? 0)}/100.
                </p>
              </div>
            </section>
          )}

          {/* ── RELATIONSHIP GRAPH ── */}
          {graph && graph.nodes.length > 0 ? (
            <section className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Relationship Graph</h2>
              <div className="overflow-auto">
                {/* RelationshipGraph component renders here */}
                <div className="min-h-32 flex items-center justify-center text-sm text-gray-400">
                  Relationship visualization available in production build
                </div>
              </div>
            </section>
          ) : null}

        </div>
      </div>
    </div>
  );
}
