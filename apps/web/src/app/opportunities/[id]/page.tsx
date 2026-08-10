import { Badge, RiskBadge, ClaimLabel, ScoreBar, RelationshipGraph } from '@hidden-catalyst/ui';
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

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  const [opp, evidence, graph] = await Promise.all([
    getOpportunityById(params.id),
    getOpportunityEvidence(params.id),
    getRelationshipGraph(params.id).catch(() => null),
  ]);

  if (!opp) notFound();

  const scores = Object.fromEntries(opp.scores.map(s => [s.scoreType, s.value]));
  const facts = opp.claims.filter(c => c.claimType === 'verified_fact');
  const inferences = opp.claims.filter(c => c.claimType === 'inference');
  const estimates = opp.claims.filter(c => c.claimType === 'estimate');
  const realRisks = opp.risks.filter(r => !r.riskType.startsWith('overlooked_reason_'));
  const overlookedReasons = opp.risks.filter(r => r.riskType.startsWith('overlooked_reason_'));

  // Fetch historical analysis
  let historicalSummary: string | null = null;
  try {
    const hist = await analyzeHistoricalReactions({
      eventType: opp.event?.eventType || 'other',
      sector: opp.security.company.sector,
    });
    historicalSummary = formatHistoricalSummary(hist);
  } catch {}

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <div className="mb-4 text-sm text-gray-500 flex items-center gap-2 flex-wrap">
        <a href="/feed" className="hover:text-brand-700">← Feed</a>
        <span className="hidden sm:inline">/</span>
        <span className="text-gray-900 hidden sm:inline">{opp.security.ticker}</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-lg font-semibold text-gray-900">{opp.security.company.displayName}</span>
          <span className="text-gray-500 font-mono text-sm">{opp.security.ticker}</span>
          <span className="text-xs text-gray-400">{opp.security.exchange}</span>
          {opp.security.marketCap && (
            <Badge>{formatMC(opp.security.marketCap)}</Badge>
          )}
          {opp.security.company.sector && <Badge variant="info">{opp.security.company.sector}</Badge>}
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{opp.title}</h1>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <Badge variant="primary">{opp.event?.eventType?.replace(/_/g, ' ') || 'Catalyst'}</Badge>
          <Badge variant={opp.status === 'published' ? 'success' : 'default'}>{opp.status}</Badge>
          {opp.publishedAt && (
            <span className="text-sm text-gray-500">
              Published {new Date(opp.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
          {opp.security.latestPrice && (
            <span className="text-sm text-gray-600 font-mono tabular-nums">
              ${opp.security.latestPrice.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-8 flex-col lg:flex-row">
        {/* Main content */}
        <div className="flex-1 space-y-8 min-w-0">
          {/* Thesis */}
          <section className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Thesis Overview</h2>
            {opp.summary && <p className="text-sm text-gray-700 mb-4">{opp.summary}</p>}

            {facts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">Fact</span>
                  Verified Facts ({facts.length})
                </h3>
                {facts.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 pl-4 border-l-2 border-green-200">
                    <p className="text-sm text-gray-700">{f.text}</p>
                  </div>
                ))}
              </div>
            )}

            {inferences.length > 0 && (
              <div className="mt-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">Infer</span>
                  Inferences ({inferences.length})
                </h3>
                {inferences.map((inf, i) => (
                  <div key={i} className="flex items-start gap-2 pl-4 border-l-2 border-purple-200">
                    <div>
                      <p className="text-sm text-gray-700">{inf.text}</p>
                      {inf.confidence && (
                        <span className="text-xs text-gray-400">
                          Confidence: {(inf.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {estimates.length > 0 && (
              <div className="mt-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Est</span>
                  Estimates ({estimates.length})
                </h3>
                {estimates.map((est, i) => (
                  <div key={i} className="flex items-start gap-2 pl-4 border-l-2 border-amber-200">
                    <p className="text-sm text-gray-700">{est.text}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Evidence Chain */}
          {evidence.length > 0 && (
            <section className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Evidence Chain</h2>
              <div className="space-y-0">
                {evidence.map((ev, i) => (
                  <div key={ev.id} className="relative pl-6 pb-5 last:pb-0">
                    {/* Connector line */}
                    {i < evidence.length - 1 && (
                      <div className="absolute left-[7px] top-6 bottom-0 w-0.5 bg-brand-200" />
                    )}
                    {/* Dot */}
                    <div className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-brand-400 bg-white" />
                    {/* Content */}
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

          {/* Market Reaction */}
          <section className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Market Reaction</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-gray-50">
                <div className={`text-2xl font-bold tabular-nums ${(scores.price_reaction ?? 0) >= 75 ? 'text-green-600' : (scores.price_reaction ?? 0) >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                  {scores.price_reaction ?? '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">Not Priced In Score</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-gray-50">
                <div className="text-2xl font-bold text-gray-600 tabular-nums">
                  {opp.security.latestPrice != null ? `$${opp.security.latestPrice.toFixed(2)}` : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">Latest Price</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-gray-50">
                <div className="text-2xl font-bold text-gray-600">
                  {opp.security.marketCap ? formatMC(opp.security.marketCap) : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">Market Cap</div>
              </div>
            </div>
            {historicalSummary && (
              <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
                <h3 className="text-sm font-semibold text-blue-800 mb-1">📊 Comparable Historical Events</h3>
                <p className="text-sm text-blue-900">{historicalSummary}</p>
                <p className="text-xs text-blue-500 mt-1">Historical observation, not a prediction.</p>
              </div>
            )}
          </section>

          {/* Why Overlooked */}
          {overlookedReasons.length > 0 && (
            <section className="p-5 rounded-xl bg-amber-50 border border-amber-200">
              <h2 className="text-sm font-semibold text-amber-800 uppercase tracking-wide mb-2">🔍 Why This May Be Overlooked</h2>
              <ul className="space-y-1.5">
                {overlookedReasons.map((r, i) => (
                  <li key={i} className="text-sm text-amber-900 flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 text-amber-500">📉</span>
                    <span>{r.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Risks */}
          {realRisks.length > 0 && (
            <section className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Risks</h2>
              <div className="flex flex-wrap gap-3">
                {realRisks.map((r, i) => (
                  <div key={i} className="flex-1 min-w-[200px]">
                    <RiskBadge label={r.riskType.replace(/_/g, ' ')} severity={r.severity as any} />
                    {r.description && <p className="text-xs text-gray-500 mt-1">{r.description}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Audit Trail */}
          <section className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Audit Trail</h2>
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

          {/* Relationship Graph */}
          {graph && graph.nodes.length > 0 ? (
            <section className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Relationship Graph</h2>
              <RelationshipGraph nodes={graph.nodes} edges={graph.edges} />
            </section>
          ) : (
            <section className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Relationship Graph</h2>
              <p className="text-sm text-gray-500">No supplier, customer, or partner relationships mapped yet. The graph builds as more documents are ingested.</p>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-80 shrink-0 space-y-6">
          <div className="card text-center sticky top-20">
            <div className="text-5xl font-bold text-brand-700 tabular-nums">{Math.round(scores.opportunity ?? 0)}</div>
            <div className="text-sm text-gray-500 mt-1">Opportunity Score</div>
            <div className="mt-4 space-y-2 text-left">
              <ScoreBar label="Info Asymmetry" value={scores.information_asymmetry ?? 0} />
              <ScoreBar label="Catalyst Strength" value={scores.catalyst_strength ?? 0} />
              <ScoreBar label="Evidence Quality" value={scores.evidence_quality ?? 0} />
              <ScoreBar label="Financial Materiality" value={scores.financial_materiality ?? 0} />
              <ScoreBar label="Not Priced In" value={scores.price_reaction ?? 0} />
              <ScoreBar label="Timing" value={scores.timing ?? 0} />
              <ScoreBar label="Risk" value={scores.risk ?? 0} />
            </div>
            <p className="text-[10px] text-gray-400 mt-3">Model v2.0.0 · Higher = better discovery</p>
          </div>

          {opp.invalidationRules.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Monitoring Rules</h3>
              <div className="space-y-2">
                {opp.invalidationRules.map((rule, i) => (
                  <div key={i} className="text-sm">
                    <Badge variant={rule.ruleType === 'confirmation' ? 'success' : 'danger'}>{rule.ruleType}</Badge>
                    <p className="mt-1 text-gray-600">{(rule.definition as any)?.trigger || 'Rule active'}</p>
                    <span className="text-xs text-gray-400">Status: {rule.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}


