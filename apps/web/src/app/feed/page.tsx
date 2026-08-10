import Link from 'next/link';
import { getPublishedOpportunities } from '@hidden-catalyst/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatMC(val: number): string {
  if (val >= 1e12) return '$' + (val / 1e12).toFixed(1) + 'T';
  if (val >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return '$' + (val / 1e6).toFixed(0) + 'M';
  return '$' + val;
}

function formatPrice(val: number): string {
  if (val >= 100) return '$' + val.toFixed(2);
  if (val >= 1) return '$' + val.toFixed(2);
  return '$' + val.toFixed(4);
}

function verBadge(s: string | null): { label: string; color: string } {
  switch (s) {
    case 'verified': return { label: 'Verified', color: 'bg-green-100 text-green-800' };
    case 'candidate': return { label: 'Candidate', color: 'bg-blue-100 text-blue-800' };
    case 'watch': return { label: 'Watch', color: 'bg-amber-100 text-amber-800' };
    case 'rejected': return { label: 'Rejected', color: 'bg-red-100 text-red-700' };
    default: return { label: s || 'Unknown', color: 'bg-gray-100 text-gray-600' };
  }
}

function pickScore(scores: { scoreType: string; value: number }[], type: string) {
  return scores.find(s => s.scoreType === type)?.value ?? 0;
}

function researchPct(opp: any): number {
  const ha = opp.hiddenAngle as any;
  let ok = 0, partial = 0;
  if (ha?.claim) ok++;
  if ((opp._count?.claims || opp.claims?.length || 0) > 0) ok++;
  if ((opp.risks || []).length > 0) ok++;
  if ((opp.invalidationRules || []).some((r: any) => r.status === 'monitoring')) ok++;
  if (opp.priceChangePercent != null) ok++;
  if (ha?.cashExposure?.amount) partial++;
  if (ha?.capitalOverhang) partial++;
  const total = 7;
  return Math.round(((ok + partial * 0.5) / total) * 100);
}

export default async function FeedPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const tab = (searchParams.tab as string) || 'hidden';
  const sort = (searchParams.sort as 'opportunity' | 'recent' | 'asymmetry') || 'opportunity';

  // Fetch via raw PG since Prisma client doesn't have verification_status / engine_version
  let allOpps: any[] = [];
  try {
    const { Client } = await import('pg');
    const pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    const result = await pg.query(`
      SELECT o.id, o.title, o.summary, o.status, o.verification_status,
             o.hidden_angle, o.detected_at, o.published_at, o.confidence as verification_confidence,
             o.price_change_pct, o.volume_change_pct,
             COALESCE(o.engine_version, 'v1_legacy') as engine_version,
             COALESCE(o.research_depth, 'shallow') as research_depth,
             s.ticker, s.latest_price, s.market_cap, s.exchange,
             c.display_name as company_name, c.sector, c.industry,
             (SELECT COUNT(*) FROM claims WHERE opportunity_id = o.id AND claim_type = 'verified_fact') as fact_count,
             (SELECT json_agg(json_build_object('scoreType', score_type, 'value', value))
              FROM scores WHERE opportunity_id = o.id) as scores_json,
             (SELECT json_agg(json_build_object('riskType', risk_type, 'severity', severity, 'description', description))
              FROM risks WHERE opportunity_id = o.id AND risk_type = 'contradiction') as contradictions_json,
             (SELECT json_agg(json_build_object('status', status, 'ruleType', rule_type, 'definition', definition))
              FROM invalidation_rules WHERE opportunity_id = o.id) as invalidation_json
      FROM opportunities o
      JOIN securities s ON s.id = o.security_id
      JOIN companies c ON c.id = s.company_id
      WHERE o.status = 'published' AND s.active = true
        AND s.exchange IN ('NYSE', 'NASDAQ', 'NYSE American')
        AND (s.market_cap IS NULL OR s.market_cap <= 10000000000)
      ORDER BY o.published_at DESC NULLS LAST
      LIMIT 100
    `);
    allOpps = result.rows.map(r => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      status: r.status,
      verificationStatus: r.verification_status,
      hiddenAngle: r.hidden_angle,
      detectedAt: r.detected_at,
      publishedAt: r.published_at,
      verificationConfidence: r.verification_confidence,
      priceChangePercent: r.price_change_pct,
      volumeChangePercent: r.volume_change_pct,
      engine_version: r.engine_version,
      research_depth: r.research_depth,
      security: {
        ticker: r.ticker,
        latestPrice: r.latest_price,
        marketCap: r.market_cap,
        exchange: r.exchange,
        company: { displayName: r.company_name, sector: r.sector, industry: r.industry },
      },
      scores: r.scores_json || [],
      risks: r.contradictions_json?.filter((x: any) => x) || [],
      invalidationRules: r.invalidation_json?.filter((x: any) => x) || [],
      claims: Array(r.fact_count || 0).fill(0).map((_, i) => ({ claimType: 'verified_fact', text: '' })),
      _count: { claims: r.fact_count || 0 },
    }));
    await pg.end();
  } catch {}

  // Sort
  if (sort === 'opportunity') {
    allOpps.sort((a, b) => {
      const sa = (a.scores || []).find((s: any) => s.scoreType === 'opportunity')?.value ?? 0;
      const sb = (b.scores || []).find((s: any) => s.scoreType === 'opportunity')?.value ?? 0;
      return sb - sa;
    });
  } else if (sort === 'asymmetry') {
    allOpps.sort((a, b) => {
      const sa = (a.scores || []).find((s: any) => s.scoreType === 'information_asymmetry')?.value ?? 0;
      const sb = (b.scores || []).find((s: any) => s.scoreType === 'information_asymmetry')?.value ?? 0;
      return sb - sa;
    });
  }

  // Filter by tab
  const opportunities = allOpps.filter((o: any) => {
    var vs = o.verificationStatus;
    var ev = o.engine_version || 'v1_legacy';
    if (tab === 'hidden') return (vs === 'candidate' || vs === 'verified') && ev !== 'v1_legacy';
    if (tab === 'queue') return vs === 'watch';
    if (tab === 'reprocess') return ev === 'v1_legacy';
    if (tab === 'rejected') return vs === 'rejected' && ev !== 'v1_legacy';
    return false;
  });

  // Tab counts via raw PG
  let hcCount = 0, wCount = 0, rpCount = 0, rCount = 0;
  try {
    const { Client } = await import('pg');
    const pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    const counts = await pg.query(
      `SELECT
         COUNT(*) FILTER (WHERE verification_status IN ('candidate','verified') AND COALESCE(engine_version,'v1_legacy') != 'v1_legacy') as hidden,
         COUNT(*) FILTER (WHERE verification_status = 'watch') as queue,
         COUNT(*) FILTER (WHERE COALESCE(engine_version,'v1_legacy') = 'v1_legacy') as reprocess,
         COUNT(*) FILTER (WHERE verification_status = 'rejected' AND COALESCE(engine_version,'v1_legacy') != 'v1_legacy') as rejected
       FROM opportunities WHERE status = 'published'`
    );
    if (counts.rows[0]) {
      hcCount = Number(counts.rows[0].hidden);
      wCount = Number(counts.rows[0].queue);
      rpCount = Number(counts.rows[0].reprocess);
      rCount = Number(counts.rows[0].rejected);
    }
    await pg.end();
  } catch {}

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Discovery Feed</h1>
        <p className="mt-1 text-sm text-gray-500">
          {tab === 'hidden' ? 'Qualified opportunities — passed hard evidence gates' :
           tab === 'queue' ? 'Promising signals needing deeper investigation' :
           tab === 'reprocess' ? 'Legacy pipeline items — pending v3 reanalysis' :
           'Rejected or routine — not hidden catalysts'}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 flex-wrap">
        {[
          { key: 'hidden', label: 'Hidden Opportunities', count: hcCount, active: 'border-brand-600 text-brand-700 bg-brand-50/50' },
          { key: 'queue', label: 'Research Queue', count: wCount, active: 'border-brand-600 text-brand-700 bg-brand-50/50' },
          { key: 'reprocess', label: 'Needs Reprocessing', count: rpCount, active: 'border-amber-500 text-amber-700 bg-amber-50/50' },
          { key: 'rejected', label: 'Rejected / Routine', count: rCount, active: 'border-red-500 text-red-700 bg-red-50/50' },
        ].map(tabItem => (
          <a
            key={tabItem.key}
            href={`/feed?tab=${tabItem.key}&sort=${sort}`}
            className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === tabItem.key
                ? tabItem.active
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tabItem.label}
            <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 ${
              tab === tabItem.key ? 'bg-white/60' : 'bg-gray-100 text-gray-500'
            }`}>
              {tabItem.count}
            </span>
          </a>
        ))}
      </div>

      <div className="flex gap-8">
        <aside className="hidden w-44 shrink-0 lg:block">
          <div className="sticky top-24 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Sort</h3>
            <form method="GET" className="space-y-0.5">
              <input type="hidden" name="tab" value={tab} />
              {[
                { key: 'opportunity', label: 'Score' },
                { key: 'recent', label: 'Recent' },
                { key: 'asymmetry', label: 'Asymmetry' },
              ].map(s => (
                <button
                  key={s.key}
                  type="submit"
                  name="sort"
                  value={s.key}
                  className={`block w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                    sort === s.key
                      ? 'bg-brand-100 text-brand-800 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </form>
          </div>
        </aside>

        <div className="flex-1 space-y-3">
          {opportunities.length === 0 ? (
            <div className="card text-center py-16">
              <div className="text-5xl mb-4">🔍</div>
              <h2 className="text-xl font-semibold text-gray-900">
                {tab === 'hidden' ? 'No qualified opportunities' : 'Nothing here'}
              </h2>
              <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                {tab === 'hidden'
                  ? 'Opportunities appear after passing qualification: hidden angle, credible evidence, no fatal contradiction.'
                  : tab === 'queue'
                  ? 'Items flagged for investigation appear here.'
                  : tab === 'reprocess'
                  ? 'Legacy pipeline items pending v3 reanalysis.'
                  : 'Rejected and routine filings.'}
              </p>
            </div>
          ) : (
            opportunities.map(opp => {
              const oppScore = pickScore(opp.scores, 'opportunity');
              const ha = opp.hiddenAngle as any;
              const vs = verBadge(opp.verificationStatus);
              const rpct = researchPct(opp);
              const scoreConfident = opp.priceChangePercent != null && opp.verificationStatus === 'verified';
              const factCount = opp._count?.claims || opp.claims?.length || 0;

              return (
                <Link
                  key={opp.id}
                  href={`/opportunities/${opp.id}`}
                  className="card block hover:shadow-md transition-all border-l-4 border-brand-500"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-semibold text-gray-900">
                        {opp.security.company.displayName.slice(0, 30)}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">{opp.security.ticker}</span>
                      {opp.security.latestPrice && (
                        <span className="text-xs text-gray-600 font-mono">{formatPrice(opp.security.latestPrice)}</span>
                      )}
                      {opp.security.marketCap && (
                        <span className="text-xs text-gray-500">{formatMC(opp.security.marketCap)}</span>
                      )}
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${vs.color}`}>
                        {vs.label}
                      </span>
                    </div>
                    <div className="text-right shrink-0 min-w-[56px]">
                      {scoreConfident ? (
                        <>
                          <div className={`text-xl font-bold tabular-nums ${
                            oppScore >= 75 ? 'text-green-600' : oppScore >= 60 ? 'text-brand-700' : 'text-gray-500'
                          }`}>{Math.round(oppScore)}</div>
                          <div className="text-[10px] text-gray-400">Score</div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-amber-600">Prelim</div>
                          <div className="text-[10px] text-gray-400">{rpct}% complete</div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Hidden Angle — THE LEAD */}
                  {ha?.claim ? (
                    <p className="text-sm text-gray-800 leading-snug line-clamp-3 mb-2">
                      {ha.claim}
                    </p>
                  ) : (
                    <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug mb-2">{opp.title}</h3>
                  )}

                  {/* Compact footer */}
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 flex-wrap">
                    {factCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-green-500">●</span> {factCount} facts
                      </span>
                    )}
                    <span>{new Date(opp.detectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    {opp.verificationConfidence != null && (
                      <span>· Conf: {Math.round((opp.verificationConfidence || 0) * 100)}%</span>
                    )}
                    {(opp.engine_version) && (
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                        opp.engine_version === 'v3_investigation' ? 'bg-green-100 text-green-700' :
                        opp.engine_version === 'v1_legacy' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {opp.engine_version === 'v3_investigation' ? 'v3 research' :
                         opp.engine_version === 'v1_legacy' ? 'v1 legacy' :
                         opp.engine_version}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })
          )}

          <p className="text-center text-xs text-gray-400 pt-4">
            Discovery funnel: {hcCount} qualified from {allOpps.length} analyzed &middot; Eligible: NYSE/NASDAQ up to $10B
          </p>
        </div>
      </div>
    </div>
  );
}
