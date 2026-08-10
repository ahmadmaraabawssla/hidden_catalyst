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

// ─── Score Sub-components ───

function ScoreCard({ label, value, sub }: { label: string; value: number; sub?: Array<{ label: string; val: number }> }) {
  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <span className="text-sm font-bold text-gray-900 tabular-nums">{Math.round(value)}</span>
      </div>
      {sub && sub.length > 0 && (
        <div className="space-y-0.5 mt-2 pt-2 border-t border-gray-200">
          {sub.map((s, i) => (
            <div key={i} className="flex justify-between text-[10px]">
              <span className="text-gray-400">{s.label}</span>
              <span className="text-gray-600 tabular-nums">+{Math.round(s.val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  try {
    const { Client } = await import('pg');
    const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
    await pgClient.connect();
    const res = await pgClient.query(
      `SELECT hidden_angle, verification_status FROM opportunities WHERE id = $1`,
      [params.id]
    );
    if (res.rows[0]) {
      hiddenAngle = res.rows[0].hidden_angle || null;
      verificationStatus = res.rows[0].verification_status || 'candidate';
    }
    await pgClient.end();
  } catch {}

  const scores = Object.fromEntries(opp.scores.map(s => [s.scoreType, s.value]));
  const facts = opp.claims.filter(c => c.claimType === 'verified_fact');
  const inferences = opp.claims.filter(c => c.claimType === 'inference');
  const contradictions = opp.risks.filter(r => r.riskType === 'contradiction');
  const realRisks = opp.risks.filter(r => !r.riskType.startsWith('overlooked_reason_') && r.riskType !== 'contradiction');
  const overlookedReasons = opp.risks.filter(r => r.riskType.startsWith('overlooked_reason_'));
  const whatToWatch = opp.invalidationRules.filter(r => r.status === 'monitoring');

  let historicalSummary: string | null = null;
  try {
    const hist = await analyzeHistoricalReactions({
      eventType: opp.event?.eventType || 'other',
      sector: opp.security.company.sector,
    });
    historicalSummary = formatHistoricalSummary(hist);
  } catch {}

  const vs = verStatusLabel(verificationStatus);

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
              ${opp.security.latestPrice.toFixed(2)}
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
            <p className="text-base font-medium text-gray-900">{hiddenAngle.claim}</p>
            {hiddenAngle.supporting_evidence && (
              <div className="pl-3 border-l-2 border-brand-300">
                <span className="text-xs text-gray-500 font-medium">Evidence</span>
                <p className="text-sm text-gray-700 mt-0.5">{hiddenAngle.supporting_evidence}</p>
              </div>
            )}
            {hiddenAngle.reasoning && (
              <p className="text-sm text-gray-600">{hiddenAngle.reasoning}</p>
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

      <div className="flex gap-8 flex-col lg:flex-row">
        {/* Main content */}
        <div className="flex-1 space-y-6 min-w-0">

          {/* ── WHY IT MATTERS ── */}
          {opp.summary && (
            <section className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Why It Matters</h2>
              <p className="text-sm text-gray-700 leading-relaxed">{opp.summary}</p>
            </section>
          )}

          {/* ── MARKET REACTION ── */}
          <section className="card">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Market Context</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ScoreCard label="Opportunity" value={scores.opportunity ?? 0} />
              <ScoreCard label="Not Priced In" value={scores.price_reaction ?? 0} />
              <ScoreCard 
                label="Info Asymmetry" 
                value={scores.information_asymmetry ?? 0}
                sub={[
                  { label: 'Company', val: scores.company_attention ?? 0 },
                  { label: 'Catalyst', val: scores.catalyst_attention ?? 0 },
                ]}
              />
              <ScoreCard label="Evidence" value={scores.evidence_quality ?? 0} />
            </div>
            {historicalSummary && (
              <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                <h3 className="text-xs font-semibold text-blue-800 mb-1">Comparable Events</h3>
                <p className="text-sm text-blue-900">{historicalSummary}</p>
                <p className="text-xs text-blue-400 mt-1">Historical observation, not a prediction.</p>
              </div>
            )}
            {opp.priceChangePercent != null && (
              <div className="mt-3 flex gap-4 text-xs text-gray-500">
                <span>Price change: <span className={opp.priceChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}>{opp.priceChangePercent >= 0 ? '+' : ''}{opp.priceChangePercent.toFixed(1)}%</span></span>
                {opp.volumeChangePercent != null && <span>Volume: {(opp.volumeChangePercent * 100).toFixed(0)}% of avg</span>}
              </div>
            )}
          </section>

          {/* ── VERIFIED FACTS ── */}
          {facts.length > 0 && (
            <section className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">Fact</span>
                Verified Facts ({facts.length})
              </h2>
              <div className="space-y-2">
                {facts.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 pl-4 border-l-2 border-green-200">
                    <p className="text-sm text-gray-700">{f.text}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── INFERENCES ── */}
          {inferences.length > 0 && (
            <section className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">Infer</span>
                System Inferences ({inferences.length})
              </h2>
              <div className="space-y-3">
                {inferences.map((inf, i) => (
                  <div key={i} className="flex items-start gap-2 pl-4 border-l-2 border-purple-200">
                    <div>
                      <p className="text-sm text-gray-700">{inf.text}</p>
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
                    <span>{r.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── CONTRADICTIONS ── */}
          {contradictions.length > 0 && (
            <section className="card border-red-200">
              <h2 className="text-base font-semibold text-red-800 mb-3">Contradictions</h2>
              <p className="text-xs text-red-500 mb-2">Evidence that argues against the thesis</p>
              <ul className="space-y-1.5">
                {contradictions.map((r, i) => (
                  <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">✗</span>
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
              <ul className="space-y-1.5">
                {whatToWatch.map((r, i) => {
                  const def = r.definition as any;
                  return (
                    <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                      <span className="shrink-0 mt-0.5 text-blue-500">→</span>
                      <span>{def?.signal || 'Monitoring in progress'}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

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
