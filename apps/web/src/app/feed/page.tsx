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
function pickScore(scores: any[], type: string) { return scores.find((s: any) => s.scoreType === type)?.value ?? 0; }
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
  return Math.round(((ok + partial * 0.5) / 7) * 100);
}

export default async function FeedPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const tab = (searchParams.tab as string) || 'hidden';
  const sort = (searchParams.sort as 'opportunity' | 'recent' | 'asymmetry') || 'opportunity';

  const { opportunities: allOpps, total: totalPublished } = await getPublishedOpportunities({ sort, limit: 200 });

  // Tab filtering in memory
  const opportunities = allOpps.filter((o: any) => {
    if (tab === 'hidden') return o.verificationStatus === 'candidate' || o.verificationStatus === 'verified';
    if (tab === 'queue') return o.verificationStatus === 'watch';
    if (tab === 'legacy') return o.engineVersion === 'v1_legacy';
    return o.verificationStatus === 'rejected' && o.engineVersion !== 'v1_legacy';
  });

  // Raw PG for accurate tab counts
  let hCount = 0, qCount = 0, lCount = 0, rCount = 0;
  try {
    const { Client } = await import('pg');
    const pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    const counts = await pg.query(
      `SELECT verification_status, engine_version, COUNT(*) as cnt FROM opportunities WHERE status='published' GROUP BY verification_status, engine_version`
    );
    for (const row of counts.rows) {
      const vs = row.verification_status, ev = row.engine_version;
      if (vs === 'candidate' || vs === 'verified') hCount += Number(row.cnt);
      else if (vs === 'watch') qCount += Number(row.cnt);
      else if (ev === 'v1_legacy') lCount += Number(row.cnt);
      else rCount += Number(row.cnt);
    }
    await pg.end();
  } catch {}

  const tabs = [
    { key: 'hidden', label: 'Hidden Opportunities', count: hCount, desc: 'Qualified — passed evidence gates', active: 'border-brand-600 text-brand-700 bg-brand-50/50' },
    { key: 'queue', label: 'Research Queue', count: qCount, desc: 'Watch — needs further investigation', active: 'border-amber-600 text-amber-700 bg-amber-50/50' },
    { key: 'legacy', label: 'Needs Reprocessing', count: lCount, desc: 'V1 pipeline — awaiting deeper research', active: 'border-purple-600 text-purple-700 bg-purple-50/50' },
    { key: 'rejected', label: 'Rejected / Routine', count: rCount, desc: 'Audit trail — no hidden angle found', active: 'border-gray-600 text-gray-700 bg-gray-50/50' },
  ];

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Discovery Feed</h1>
        <p className="mt-1 text-sm text-gray-500">{tabs.find(t => t.key === tab)?.desc || ''}</p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {tabs.map(t => (
          <a key={t.key} href={`/feed?tab=${t.key}&sort=${sort}`}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-colors ${
              tab === t.key ? t.active : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            {t.label}
            <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 ${
              tab === t.key ? 'bg-white/50 font-semibold' : 'bg-gray-100 text-gray-500'
            }`}>{t.count}</span>
          </a>
        ))}
      </div>

      <div className="flex gap-8">
        <aside className="hidden w-36 shrink-0 lg:block">
          <div className="sticky top-24 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Sort</h3>
            <form method="GET" className="space-y-0.5">
              <input type="hidden" name="tab" value={tab} />
              {[{ key: 'opportunity', label: 'Score' }, { key: 'recent', label: 'Recent' }, { key: 'asymmetry', label: 'Asymmetry' }].map(s => (
                <button key={s.key} type="submit" name="sort" value={s.key}
                  className={`block w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                    sort === s.key ? 'bg-brand-100 text-brand-800 font-medium' : 'text-gray-600 hover:bg-gray-100'
                  }`}>{s.label}</button>
              ))}
            </form>
          </div>
        </aside>

        <div className="flex-1 space-y-3">
          {opportunities.length === 0 ? (
            <div className="card text-center py-16">
              <div className="text-5xl mb-4">🔍</div>
              <h2 className="text-xl font-semibold text-gray-900">{tab === 'hidden' ? 'No qualified opportunities' : 'Nothing here'}</h2>
              <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                {tab === 'hidden' ? 'The engine is continuously searching. Qualified candidates appear after passing hard evidence gates.' :
                 tab === 'queue' ? 'Items flagged for deeper investigation.' :
                 tab === 'legacy' ? 'V1 pipeline items awaiting reprocessing through the current engine.' :
                 'Routine filings and rejected items for auditability.'}
              </p>
            </div>
          ) : (
            opportunities.map((opp: any) => {
              const ha = opp.hiddenAngle as any;
              const vs = verBadge(opp.verificationStatus);
              const rpct = researchPct(opp);
              const isLegacy = opp.engineVersion === 'v1_legacy';
              const facts = opp.claims?.filter((c: any) => c.claimType === 'verified_fact') || [];

              return (
                <Link key={opp.id} href={`/opportunities/${opp.id}`}
                  className={`card block hover:shadow-md transition-all border-l-4 ${
                    tab === 'legacy' ? 'border-gray-400 opacity-70' : 'border-brand-500'
                  }`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-semibold text-gray-900">{opp.security.company.displayName?.slice(0, 28)}</span>
                      <span className="text-xs text-gray-500 font-mono">{opp.security.ticker}</span>
                      {opp.security.latestPrice && <span className="text-xs text-gray-600 font-mono">{formatPrice(opp.security.latestPrice)}</span>}
                      {opp.security.marketCap && <span className="text-xs text-gray-500">{formatMC(opp.security.marketCap)}</span>}
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${vs.color}`}>{vs.label}</span>
                      {isLegacy && <span className="text-[10px] text-purple-500 font-medium">v1</span>}
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
                  </div>
                </Link>
              );
            })
          )}
          {tab === 'hidden' && (
            <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
              <strong>Discovery Engine v3</strong> — budget-based continuous search across {totalPublished} published events.
              The engine keeps searching after rejecting routine filings. Only genuine hidden catalysts appear here.
            </div>
          )}
          {tab === 'legacy' && (
            <div className="mt-4 p-3 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-700">
              <strong>V1 legacy items</strong> — these were generated by the earlier pipeline and
              need reprocessing through the current engine. Some may contain hidden angles not yet discovered.
            </div>
          )}
          <p className="text-center text-xs text-gray-400 pt-4">
            {opportunities.length} shown &middot; {totalPublished} total published &middot; Universe: NYSE/NASDAQ &le; $10B
          </p>
        </div>
      </div>
    </div>
  );
}
