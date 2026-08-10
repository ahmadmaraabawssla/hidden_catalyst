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
  if (opp.claims?.length > 0) ok++;
  if (opp.risks?.some((r: any) => r.riskType === 'contradiction')) ok++;
  if (opp.invalidationRules?.some((r: any) => r.status === 'monitoring')) ok++;
  if (opp.priceChangePercent != null) ok++;
  if (ha?.cashExposure?.amount) partial++;
  if (ha?.capitalOverhang) partial++;
  const total = 7;
  return Math.round(((ok + partial * 0.5) / total) * 100);
}

export default async function FeedPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const tab = (searchParams.tab as string) || 'hidden';
  const sort = (searchParams.sort as 'opportunity' | 'recent' | 'asymmetry') || 'opportunity';

  const vsFilter = tab === 'hidden' ? ['candidate', 'verified'] :
    tab === 'queue' ? 'watch' : 'rejected';

  const { opportunities: allOpps, total: totalPublished } = await getPublishedOpportunities({ sort, limit: 50 });

  // Filter by verificationStatus in memory (Prisma client not regenerated)
  const opportunities = allOpps.filter((o: any) =>
    vsFilter === 'watch' ? o.verificationStatus === 'watch' :
    vsFilter === 'rejected' ? o.verificationStatus === 'rejected' :
    Array.isArray(vsFilter) ? vsFilter.includes(o.verificationStatus) :
    o.verificationStatus === vsFilter
  );

  // Use raw PG for tab counts
  let hcCount = 0, wCount = 0, rCount = 0;
  try {
    const { Client } = await import('pg');
    const pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    const counts = await pg.query(
      `SELECT verification_status, COUNT(*) as cnt FROM opportunities WHERE status = 'published' GROUP BY verification_status`
    );
    for (const row of counts.rows) {
      if (row.verification_status === 'candidate' || row.verification_status === 'verified') hcCount += Number(row.cnt);
      else if (row.verification_status === 'watch') wCount += Number(row.cnt);
      else if (row.verification_status === 'rejected') rCount += Number(row.cnt);
    }
    await pg.end();
  } catch {}

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Discovery Feed</h1>
        <p className="mt-1 text-sm text-gray-500">
          {tab === 'hidden' ? 'Qualified opportunities — passed hard evidence gates' :
           tab === 'queue' ? 'Items flagged for further investigation' :
           'Rejected or routine — audit trail'}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[
          { key: 'hidden', label: 'Hidden Opportunities', count: hcCount },
          { key: 'queue', label: 'Research Queue', count: wCount },
          { key: 'rejected', label: 'Rejected / Routine', count: rCount },
        ].map(t => (
          <a
            key={t.key}
            href={`/feed?tab=${t.key}&sort=${sort}`}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === t.key
                ? 'border-brand-600 text-brand-700 bg-brand-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 ${
              tab === t.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {t.count}
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
                  : 'Rejected and routine filings for auditability.'}
              </p>
            </div>
          ) : (
            opportunities.map(opp => {
              const oppScore = pickScore(opp.scores, 'opportunity');
              const ha = opp.hiddenAngle as any;
              const vs = verBadge(opp.verificationStatus);
              const rpct = researchPct(opp);
              const scoreConfident = opp.priceChangePercent != null && opp.verificationStatus === 'verified';
              const facts = opp.claims.filter((c: any) => c.claimType === 'verified_fact');

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
                    {facts.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-green-500">●</span> {facts.length} facts
                      </span>
                    )}
                    <span>{new Date(opp.detectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    {opp.verificationConfidence != null && (
                      <span>· Conf: {Math.round((opp.verificationConfidence || 0) * 100)}%</span>
                    )}
                  </div>
                </Link>
              );
            })
          )}

          <p className="text-center text-xs text-gray-400 pt-4">
            Eligible universe: NYSE / NASDAQ &le; $10B market cap &middot; {opportunities.length} shown &middot; {totalPublished} published
          </p>
        </div>
      </div>
    </div>
  );
}
