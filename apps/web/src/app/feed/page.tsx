import Link from 'next/link';
import { getEngineOpportunities, getLastEngineRun, getEngineCounts } from '@/lib/engine-data';
import { formatMC, formatPrice, cleanCompanyName, formatRatio, relativeTime, plainMateriality, plainDirection, plainConfidence, isStale, discoveryDelayDays } from '@/components/research/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const QUALIFIED = ['verified', 'candidate'];

export default async function FeedPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const tab = searchParams.tab === 'queue' ? 'queue' : 'qualified';

  const [qualified, queue, lastRun, counts] = await Promise.all([
    getEngineOpportunities({ verificationStatus: QUALIFIED }),
    getEngineOpportunities({ verificationStatus: ['watch'] }),
    getLastEngineRun(),
    getEngineCounts(),
  ]);

  const opportunities = tab === 'queue' ? queue : qualified;
  // Use the true counts (respecting the market-cap ceiling), not the truncated list length.
  const qualifiedCount = counts.qualified;
  const queueCount = counts.watch;

  return (
    <div className="page-container">
      <div className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Discoveries</h1>
        <p className="mt-1 text-sm text-gray-500">
          Things that changed for companies the market isn't watching closely.
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Last updated {lastRun ? relativeTime(lastRun) : 'unknown'}
        </p>
      </div>

      {/* Tab bar — plain English */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        <a
          href="/feed"
          className={`flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'qualified' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Worth a look
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tab === 'qualified' ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
            {qualifiedCount}
          </span>
        </a>
        <a
          href="/feed?tab=queue"
          className={`flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'queue' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          On our radar
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tab === 'queue' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
            {queueCount}
          </span>
        </a>
      </div>

      {opportunities.length === 0 ? (
        <div className="card py-16 text-center">
          <div className="mb-4 text-5xl">🔍</div>
          <h2 className="text-xl font-semibold text-gray-900">
            {tab === 'qualified' ? 'Nothing worth a look right now' : 'Nothing on our radar right now'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            {tab === 'qualified'
              ? 'That\'s a good thing — it means we rejected the routine stuff instead of pretending it mattered.'
              : 'New signals will show up here as we find them.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opp) => {
            const mat = opp.materiality;
            const dir = plainDirection(opp.report?.direction ?? 'unclear');
            const matPlain = plainMateriality(mat?.level);
            const attention = opp.attention;
            const priceReaction = opp.priceReaction;
            const completeness = opp.researchCompleteness ?? opp.report?.completeness ?? 0;
            const confidence = opp.confidence ?? opp.report?.confidence ?? 0;
            const confPlain = plainConfidence(confidence);
            const facts = opp.report?.verifiedFacts.length ?? 0;
            const delayDays = discoveryDelayDays(opp.eventDate, opp.detectedAt);
            const backfilled = delayDays != null && delayDays > 7;

            return (
              <Link
                key={opp.id}
                href={`/opportunities/${opp.id}`}
                className={`card block hover:border-brand-300 ${isStale(opp.detectedAt, opp.clusterType) ? 'opacity-60' : ''}`}
              >
                {/* Company + market row */}
                <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <span className="font-semibold text-gray-900">{cleanCompanyName(opp.companyName)}</span>
                  <span className="font-mono text-xs text-gray-500">{opp.ticker}</span>
                  {opp.marketCap != null && (
                    <span className="text-xs text-gray-500">{formatMC(opp.marketCap)}</span>
                  )}
                  <span className="ml-auto text-xs text-gray-400">
                    {backfilled ? 'Backfilled' : 'detected'} {relativeTime(opp.detectedAt)}
                    {backfilled && delayDays != null && <span> · found {delayDays} days after the event</span>}
                  </span>
                </div>

                {/* The headline — what actually happened */}
                <h3 className="text-sm font-medium leading-snug text-gray-800">
                  {opp.report?.summary || opp.summary || opp.title}
                </h3>

                {/* Plain-English verdict strip — direction first, then materiality */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                    opp.report?.direction === 'negative' ? 'bg-rose-100 text-rose-800'
                    : opp.report?.direction === 'positive' ? 'bg-emerald-100 text-emerald-800'
                    : opp.report?.direction === 'mixed' ? 'bg-amber-100 text-amber-800'
                    : 'bg-gray-100 text-gray-700'
                  }`}>
                    {dir.emoji} {dir.label}
                  </span>

                  <span title={confPlain.tone} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                    Confidence: {confPlain.label}
                  </span>

                  {mat && mat.level !== 'UNKNOWN' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                      {matPlain.label} · {formatRatio(mat.ratio)}
                    </span>
                  )}

                  {attention && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                      attention.measured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {attention.measured ? 'News found' : 'Little to no news'}
                    </span>
                  )}

                  {priceReaction && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                      priceReaction.measured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {priceReaction.measured ? 'Market has reacted' : 'Market hasn\'t reacted yet'}
                    </span>
                  )}
                </div>

                {/* The "why it matters" one-liner */}
                {mat && mat.level !== 'UNKNOWN' && (
                  <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
                    {matPlain.tone}
                  </p>
                )}

                <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400">
                  <span>Researched: {completeness}%</span>
                  {facts > 0 && <span>· {facts} facts checked</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
