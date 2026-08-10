import Link from 'next/link';
import { getPublishedOpportunities } from '@hidden-catalyst/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ─── Helpers ───

function formatMC(val: number): string {
  if (val >= 1e12) return '$' + (val / 1e12).toFixed(1) + 'T';
  if (val >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return '$' + (val / 1e6).toFixed(0) + 'M';
  return '$' + val;
}

function shortName(name: string, max = 28) {
  return name.length > max ? name.slice(0, max - 1) + '\u2026' : name;
}

function catalystBorder(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('10-q') || t.includes('10-k')) return 'border-l-green-400';
  if (t.includes('8-k')) return 'border-l-blue-400';
  if (t.includes('fda') || t.includes('fast track') || t.includes('approval')) return 'border-l-purple-400';
  if (t.includes('patent') || t.includes('uspto')) return 'border-l-amber-400';
  if (t.includes('13d') || t.includes('13g')) return 'border-l-red-400';
  if (t.includes('contract') || t.includes('award')) return 'border-l-orange-400';
  return 'border-l-brand-400';
}

function getOverlookedReasons(risks: { riskType: string; description: string | null }[]) {
  return risks
    .filter(r => r.riskType.startsWith('overlooked_reason_'))
    .map(r => r.description)
    .filter(Boolean) as string[];
}

function pickScore(scores: { scoreType: string; value: number }[], type: string) {
  return scores.find(s => s.scoreType === type)?.value ?? 0;
}

function analystBadge(asymScore: number): { label: string; color: string } | null {
  if (asymScore >= 85) return { label: '\u26a0 Very Low Coverage', color: 'bg-red-100 text-red-700' };
  if (asymScore >= 75) return { label: 'Low Coverage', color: 'bg-amber-100 text-amber-700' };
  if (asymScore >= 65) return { label: 'Moderate Coverage', color: 'bg-blue-100 text-blue-700' };
  return null;
}

function marketCapBadge(mc: number | null): { label: string; color: string } | null {
  if (!mc) return null;
  if (mc < 300e6) return { label: 'Micro-cap', color: 'bg-purple-100 text-purple-700' };
  if (mc < 2e9) return { label: 'Small-cap', color: 'bg-teal-100 text-teal-700' };
  if (mc < 10e9) return { label: 'Mid-cap', color: 'bg-blue-100 text-blue-700' };
  return null;
}

// ─── Page ───

export default async function FeedPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const sort = (searchParams.sort as 'opportunity' | 'recent' | 'asymmetry') || 'opportunity';
  const mcMax = searchParams.marketCapMax ? Number(searchParams.marketCapMax) : undefined;
  const minScore = searchParams.minScore ? Number(searchParams.minScore) : undefined;

  const { opportunities, total } = await getPublishedOpportunities({
    sort,
    marketCapMax: mcMax,
    limit: 50,
  });

  // Client-side score filter
  const filtered = minScore
    ? opportunities.filter(o => pickScore(o.scores, 'opportunity') >= minScore)
    : opportunities;

  const activeFilters = [mcMax ? (mcMax < 10_000_000_000) : false, minScore].filter(Boolean).length;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Opportunity Feed</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filtered.length} of {total} underfollowed opportunities · Sorted by {sort === 'opportunity' ? 'Opportunity Score' : sort === 'recent' ? 'Most Recent' : 'Information Asymmetry'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeFilters > 0 && (
            <a href="/feed" className="text-xs text-red-600 hover:underline">
              Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
            </a>
          )}
          <form method="GET" className="flex items-center gap-2">
            {minScore != null && <input type="hidden" name="minScore" value={minScore} />}
            <select name="sort" defaultValue={sort} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="opportunity">Highest Score</option>
              <option value="recent">Most Recent</option>
              <option value="asymmetry">Info Asymmetry</option>
            </select>
            <button type="submit" className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900 transition-colors">
              Sort
            </button>
          </form>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Sidebar filters */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24 space-y-6">
            <form method="GET" className="space-y-5">
              <input type="hidden" name="sort" value={sort} />

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Market Cap Range</h3>
                <select name="marketCapMax" defaultValue={mcMax || ''} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Under $10B (Default)</option>
                  <option value="500000000">Under $500M (Micro)</option>
                  <option value="2000000000">Under $2B (Small)</option>
                  <option value="5000000000">Under $5B (Mid)</option>
                  <option value="50000000000">All (incl. Large Cap)</option>
                </select>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Min Score</h3>
                <select name="minScore" defaultValue={minScore || ''} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Any score</option>
                  <option value="80">80+ (High)</option>
                  <option value="70">70+ (Good)</option>
                  <option value="60">60+ (Moderate)</option>
                  <option value="50">50+</option>
                </select>
              </div>

              <button type="submit" className="w-full rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900 transition-colors">
                Apply Filters
              </button>
            </form>
          </div>
        </aside>

        {/* Feed */}
        <div className="flex-1 space-y-4">
          {filtered.length === 0 ? (
            <div className="card text-center py-16">
              <div className="text-5xl mb-4">🔍</div>
              <h2 className="text-xl font-semibold text-gray-900">No opportunities found</h2>
              <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                {activeFilters > 0
                  ? 'Try adjusting your filters. The current filters may be too restrictive.'
                  : 'New opportunities appear as Hidden Catalyst processes SEC filings, FDA approvals, patent grants, and federal contracts.'}
              </p>
              {activeFilters > 0 && (
                <a href="/feed" className="mt-4 inline-block rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Clear all filters
                </a>
              )}
            </div>
          ) : (
            filtered.map(opp => {
              const oppScore = pickScore(opp.scores, 'opportunity');
              const asymScore = pickScore(opp.scores, 'information_asymmetry');
              const companyAttn = pickScore(opp.scores, 'company_attention');
              const catalystAttn = pickScore(opp.scores, 'catalyst_attention');
              const evidenceScore = pickScore(opp.scores, 'evidence_quality');
              const priceReactionScore = pickScore(opp.scores, 'price_reaction');

              const facts = opp.claims.filter(c => c.claimType === 'verified_fact');
              const infs = opp.claims.filter(c => c.claimType === 'inference');
              const reasons = getOverlookedReasons(opp.risks);
              const realRisks = opp.risks.filter(r => !r.riskType.startsWith('overlooked_reason_'));
              const mcBadge = marketCapBadge(opp.security.marketCap);
              const hiddenAngle = opp.hiddenAngle as { claim?: string } | null;

              const scoreColor = oppScore >= 80 ? 'text-green-600' : oppScore >= 65 ? 'text-brand-700' : oppScore >= 50 ? 'text-amber-600' : 'text-gray-500';

              return (
                <Link
                  key={opp.id}
                  href={`/opportunities/${opp.id}`}
                  className={`card block hover:shadow-md transition-all border-l-4 ${catalystBorder(opp.title)}`}
                >
                  {/* ── Top: Company + Price + Market Cap ── */}
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-semibold text-gray-900" title={opp.security.company.displayName}>
                        {shortName(opp.security.company.displayName)}
                      </span>
                      <span className="text-xs text-gray-500 tabular-nums font-mono">{opp.security.ticker}</span>
                      {opp.security.latestPrice && (
                        <span className="text-xs text-gray-600 tabular-nums font-mono">${opp.security.latestPrice.toFixed(2)}</span>
                      )}
                      {opp.security.marketCap && (
                        <span className="text-xs text-gray-500 tabular-nums">{formatMC(opp.security.marketCap)}</span>
                      )}
                      {mcBadge && (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${mcBadge.color}`}>
                          {mcBadge.label}
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0 min-w-[48px]">
                      <div className={`text-xl font-bold tabular-nums ${scoreColor}`}>{Math.round(oppScore)}</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider">Score</div>
                    </div>
                  </div>

                  {/* ── Hidden Angle (if available) ── */}
                  {hiddenAngle?.claim && (
                    <div className="mb-2 flex items-start gap-1.5">
                      <span className="shrink-0 mt-0.5 text-brand-600 text-xs">🔍</span>
                      <span className="text-xs text-brand-700 line-clamp-2">{hiddenAngle.claim}</span>
                    </div>
                  )}

                  {/* ── Title ── */}
                  <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{opp.title}</h3>

                  {/* ── Score mini-pills ── */}
                  <div className="mt-2 flex gap-1.5 flex-wrap">
                    <ScorePill label="Hidden" value={asymScore} color="amber" />
                    <ScorePill label="Evidence" value={evidenceScore} color="green" />
                    <ScorePill label="Unpriced" value={priceReactionScore} color="teal" />
                  </div>

                  {/* ── First fact ── */}
                  {facts.length > 0 && (
                    <div className="mt-2 flex items-start gap-1.5">
                      <span className="shrink-0 mt-0.5 inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-medium text-green-700">Fact</span>
                      <span className="text-xs text-gray-600 line-clamp-1">{facts[0].text}</span>
                    </div>
                  )}

                  {/* ── Footer ── */}
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-400 flex-wrap">
                    <span>{opp._count.claims} claims</span>
                    <span>{new Date(opp.detectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    {realRisks.slice(0, 2).map(r => (
                      <span key={r.riskType} className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                        r.severity === 'high' ? 'bg-red-100 text-red-700' : r.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {r.riskType.replace(/_/g, ' ')}
                      </span>
                            {formatMC(opp.security.marketCap)}
                          </span>
                        )}
                        {analystInfo && (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${analystInfo.color}`}>
                            {analystInfo.label}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1.5 text-base font-semibold text-brand-700 line-clamp-2 leading-snug">{opp.title}</h3>
                    </div>
                    <div className="text-right shrink-0 min-w-[52px]">
                      <div className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{Math.round(oppScore)}</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider">Score</div>
                    </div>
                  </div>

                </Link>
              );
            })
          )}

          <p className="text-center text-xs text-gray-400 pt-2">
            Showing underfollowed companies (market cap &le; $10B) &middot; Refreshed: {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

function ScorePill({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
    teal: 'bg-teal-50 text-teal-700',
  };
  return (
    <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${colorMap[color] || 'bg-gray-50 text-gray-600'}`}>
      <span className="opacity-70">{label}</span>
      <span className="tabular-nums font-semibold">{Math.round(value)}</span>
    </div>
  );
}
