import Link from 'next/link';
import { getPublishedOpportunities } from '@hidden-catalyst/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatMC(v: number): string {
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(1) + 'T';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
  return '$' + v;
}
function formatPrice(v: number): string {
  return v >= 1 ? '$' + v.toFixed(2) : '$' + v.toFixed(4);
}
function vsBadge(s: string | null): { label: string; color: string } {
  switch (s) {
    case 'verified': return { label: 'Verified', color: 'bg-green-100 text-green-800' };
    case 'candidate': return { label: 'Candidate', color: 'bg-blue-100 text-blue-800' };
    case 'watch': return { label: 'Watch', color: 'bg-amber-100 text-amber-800' };
    default: return { label: s || 'Unknown', color: 'bg-gray-100 text-gray-600' };
  }
}
function researchPct(opp: any): number {
  const stored = opp.researchCompleteness ?? opp.scores?.find((s: any) => s.scoreType === 'research_completeness')?.value;
  if (typeof stored === 'number' && stored > 0) return Math.round(stored);

  var ha = opp.hiddenAngle, ok = 0, partial = 0;
  if (ha?.claim) ok++;
  if (opp.claims?.length > 0) ok++;
  if (opp.risks?.some((r: any) => r.riskType === 'contradiction')) ok++;
  if (opp.invalidationRules?.some((r: any) => r.status === 'monitoring')) ok++;
  if (opp.priceChangePercent != null) ok++;
  if (ha?.cashExposure?.amount) partial++;
  if (ha?.capitalOverhang) partial++;
  return Math.round(((ok + partial * 0.5) / 7) * 100);
}

export default async function FeedPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  var tab = (searchParams.tab as string) || 'qualified';
  var sort = (searchParams.sort as string) || 'opportunity';

  var { opportunities: allOpps, total: totalPublished } = await getPublishedOpportunities({ sort, limit: 200 });

  // Filter: qualified = candidate + verified, watch is separate
  var opportunities = allOpps.filter(function(o: any) {
    return tab === 'watch' ? o.verificationStatus === 'watch' :
      o.verificationStatus === 'candidate' || o.verificationStatus === 'verified';
  });

  // Tab counts from raw PG
  var qCount = 0, wCount = 0;
  try {
    var { Client } = await import('pg');
    var pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    var counts = await pg.query(
      "SELECT verification_status, COUNT(*) as cnt FROM opportunities WHERE status='published' GROUP BY verification_status"
    );
    counts.rows.forEach(function(row: any) {
      if (row.verification_status === 'candidate' || row.verification_status === 'verified') qCount += Number(row.cnt);
      else if (row.verification_status === 'watch') wCount += Number(row.cnt);
    });
    await pg.end();
  } catch {}

  var tabs = [
    { key: 'qualified', label: 'Qualified Opportunities', count: qCount, desc: 'Passed evidence gates — worth your attention' },
    { key: 'watch', label: 'Watch List', count: wCount, desc: 'Promising signals needing further research' },
  ];

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Discovery Feed</h1>
        <p className="mt-1 text-sm text-gray-500">{tabs.find(function(t: any) { return t.key === tab; })?.desc || ''}</p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map(function(t: any) {
          return (
            <a key={t.key} href={'/feed?tab=' + t.key + '&sort=' + sort}
              className={'px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ' +
                (tab === t.key ? 'border-brand-600 text-brand-700 bg-brand-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300')}>
              {t.label}
              <span className={'ml-1.5 text-xs rounded-full px-1.5 py-0.5 ' +
                (tab === t.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500')}>{t.count}</span>
            </a>
          );
        })}
        <div className="flex-1" />
        <a href="/admin" className="ml-auto self-center text-xs text-gray-400 hover:text-gray-600 transition-colors">Admin</a>
      </div>

      <div className="flex-1 space-y-3">
        {opportunities.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-xl font-semibold text-gray-900">No opportunities yet</h2>
            <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
              {tab === 'watch' ? 'Promising signals under investigation will appear here.' :
               'The discovery engine continuously searches for hidden catalysts. Qualified opportunities appear after passing hard evidence gates.'}
            </p>
          </div>
        ) : (
          opportunities.map(function(opp: any) {
            var ha = opp.hiddenAngle;
            var vs = vsBadge(opp.verificationStatus);
            var rpct = researchPct(opp);
            var facts = opp.claims?.filter(function(c: any) { return c.claimType === 'verified_fact'; }) || [];
            return (
              <Link key={opp.id} href={'/opportunities/' + opp.id}
                className="card block hover:shadow-md transition-all border-l-4 border-brand-500">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-sm font-semibold text-gray-900">{opp.security.company.displayName?.slice(0, 28)}</span>
                    <span className="text-xs text-gray-500 font-mono">{opp.security.ticker}</span>
                    {opp.security.latestPrice ? <span className="text-xs text-gray-600 font-mono">{formatPrice(opp.security.latestPrice)}</span> : null}
                    {opp.security.marketCap ? <span className="text-xs text-gray-500">{formatMC(opp.security.marketCap)}</span> : null}
                    <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' + vs.color}>{vs.label}</span>
                  </div>
                  <div className="text-right shrink-0 min-w-[56px]">
                    <div className="text-sm font-semibold text-amber-600">Prelim</div>
                    <div className="text-[10px] text-gray-400">{rpct}% complete</div>
                  </div>
                </div>
                {ha?.claim ? (
                  <p className="text-sm text-gray-800 leading-snug line-clamp-3 mb-2">{ha.claim}</p>
                ) : (
                  <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug mb-2">{opp.title}</h3>
                )}
                <div className="flex items-center gap-2 text-[10px] text-gray-400 flex-wrap">
                  <span className="inline-flex items-center gap-1"><span className="text-green-500">●</span> {facts.length} facts</span>
                  <span>{new Date(opp.detectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  {opp.lastResearchedAt ? <span>· Researched {new Date(opp.lastResearchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> : null}
                </div>
              </Link>
            );
          })
        )}
        {tab === 'qualified' && totalPublished > 0 ? (
          <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
            <strong>Discovery Engine v3</strong> — {totalPublished} total opportunities discovered.
            Qualified items have passed hard evidence gates: hidden angle, credible sourcing, cross-document validation.
          </div>
        ) : null}
        <p className="text-center text-xs text-gray-400 pt-4">
          {opportunities.length} shown · {totalPublished} total · Universe: NYSE / NASDAQ ≤ $10B market cap
        </p>
      </div>
    </div>
  );
}
