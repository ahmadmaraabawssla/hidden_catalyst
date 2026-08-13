import Link from 'next/link';
import { getEngineOpportunities } from '@/lib/engine-data';
import { ThesisStatusBadge, LevelBadge, MeasuredTag } from '@/components/research/StatusBadges';
import { formatMC, formatPrice, formatDate } from '@/components/research/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const QUALIFIED = ['verified', 'candidate'];

export default async function FeedPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const tab = searchParams.tab === 'queue' ? 'queue' : 'qualified';

  const qualified = await getEngineOpportunities({ verificationStatus: QUALIFIED });
  const queue = tab === 'queue' ? await getEngineOpportunities({ verificationStatus: ['watch'] }) : [];

  const opportunities = tab === 'queue' ? queue : qualified;

  // Counts
  const qualifiedCount = qualified.length;
  const queueCount = tab === 'queue' ? queue.length : null;

  const verifiedCount = qualified.filter((o) => o.verificationStatus === 'verified').length;
  const candidateCount = qualified.filter((o) => o.verificationStatus === 'candidate').length;

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Discovery Feed</h1>
        <p className="mt-1 text-sm text-gray-500">
          {tab === 'qualified'
            ? 'Opportunities that passed the hard evidence gates — verified facts, materiality, and measured market context.'
            : 'Promising signals still missing critical verification — materiality, attention, or price reaction.'}
        </p>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {[
          {
            key: 'qualified',
            label: 'Qualified',
            count: qualifiedCount,
            active: tab === 'qualified',
            activeCls: 'border-brand-600 text-brand-700',
            countCls: 'bg-brand-50 text-brand-700',
          },
          {
            key: 'queue',
            label: 'Research Queue',
            count: queueCount,
            active: tab === 'queue',
            activeCls: 'border-amber-500 text-amber-700',
            countCls: 'bg-amber-50 text-amber-700',
          },
        ].map((item) => (
          <a
            key={item.key}
            href={`/feed?tab=${item.key}`}
            className={`flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              item.active
                ? `${item.activeCls}`
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {item.label}
            {item.count != null && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.active ? item.countCls : 'bg-gray-100 text-gray-500'}`}>
                {item.count}
              </span>
            )}
          </a>
        ))}
      </div>

      {/* Legend */}
      {tab === 'qualified' && (
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
          <span className="font-semibold text-gray-700">Feed status</span>
          <span className="flex items-center gap-1.5">
            <ThesisStatusBadge status="verified" /> {verifiedCount}
          </span>
          <span className="flex items-center gap-1.5">
            <ThesisStatusBadge status="candidate" /> {candidateCount}
          </span>
          <span className="flex items-center gap-1.5">
            <MeasuredTag measured /> measured market context
          </span>
          <span className="flex items-center gap-1.5">
            <MeasuredTag measured={false} /> proxy / estimate
          </span>
        </div>
      )}

      {opportunities.length === 0 ? (
        <div className="card py-16 text-center">
          <div className="mb-4 text-5xl">🔍</div>
          <h2 className="text-xl font-semibold text-gray-900">
            {tab === 'qualified' ? 'No qualified opportunities yet' : 'Research queue is empty'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            {tab === 'qualified'
              ? 'Opportunities appear here only after passing the qualification gates: a verified public signal, a defensible economic mechanism, and measured market context.'
              : 'Signals awaiting deeper investigation will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opp) => {
            const mat = opp.materiality;
            const attention = opp.attention;
            const priceReaction = opp.priceReaction;
            const completeness = opp.researchCompleteness ?? opp.report?.completeness ?? 0;
            const confidence = opp.confidence ?? opp.report?.confidence ?? 0;

            return (
              <Link
                key={opp.id}
                href={`/opportunities/${opp.id}`}
                className="card block hover:border-brand-300"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: company + title */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-gray-900">{opp.companyName}</span>
                      <span className="font-mono text-xs text-gray-500">{opp.ticker}</span>
                      <span className="text-xs text-gray-400">{opp.exchange}</span>
                      {opp.latestPrice != null && (
                        <span className="font-mono text-xs text-gray-600">{formatPrice(opp.latestPrice)}</span>
                      )}
                      {opp.marketCap != null && (
                        <span className="text-xs text-gray-500">{formatMC(opp.marketCap)}</span>
                      )}
                    </div>

                    <h3 className="text-sm font-medium leading-snug text-gray-800">
                      {opp.report?.summary || opp.summary || opp.title}
                    </h3>

                    {/* Epistemic state strip */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <ThesisStatusBadge status={opp.verificationStatus} />
                      {mat && <LevelBadge level={mat.level} />}
                      {attention && <MeasuredTag measured={attention.measured} />}
                      {priceReaction && <MeasuredTag measured={priceReaction.measured} />}
                      {opp.clusterType && (
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {opp.clusterType.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: completeness gauge */}
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-gray-900">{completeness}%</div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-400">complete</div>
                    {confidence > 0 && (
                      <div className="mt-1 text-[10px] text-gray-400">conf {confidence}%</div>
                    )}
                  </div>
                </div>

                {/* Materiality detail line */}
                {mat && mat.level !== 'UNKNOWN' && (
                  <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-600">Materiality:</span>{' '}
                    {mat.explanation}
                  </p>
                )}

                <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400">
                  <span>Detected {formatDate(opp.detectedAt)}</span>
                  {opp.report && <span>· {opp.report.verifiedFacts.length} verified facts</span>}
                </div>
              </Link>
            );
          })}

          <p className="pt-4 text-center text-xs text-gray-400">
            Showing {opportunities.length} {tab === 'qualified' ? 'qualified' : 'queued'} opportunities from the source-agnostic engine
          </p>
        </div>
      )}
    </div>
  );
}
