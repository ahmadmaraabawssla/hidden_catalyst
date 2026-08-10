import { Badge } from '@hidden-catalyst/ui';
import { getCompanyByTicker } from '@hidden-catalyst/db';
import { notFound } from 'next/navigation';
import ExploreButton from './ExploreButton';

export const dynamic = 'force-dynamic';

export default async function CompanyPage({ params }: { params: { ticker: string } }) {
  const security = await getCompanyByTicker(params.ticker);
  if (!security) notFound();

  const { company } = security;
  const published = security.opportunities.filter(o => o.status === 'published');
  const historical = security.opportunities.filter(o => o.status === 'invalidated' || o.status === 'expired');

  return (
    <div className="page-container">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900">{company.displayName}</h1>
          <span className="text-xl text-gray-500">{security.ticker}</span>
          <Badge>{security.exchange}</Badge>
        </div>
        {company.website && (
          <a href={company.website} className="text-sm text-brand-700 hover:underline mt-1 inline-block">
            {company.website} →
          </a>
        )}
      </div>

      <div className="flex gap-8 flex-col lg:flex-row">
        <div className="flex-1 space-y-8">
          <section className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Opportunities ({published.length})</h2>
            {published.length === 0 ? (
              <p className="text-sm text-gray-500">No active opportunities.</p>
            ) : (
              <div className="space-y-3">
                {published.map((opp) => (
                  <a key={opp.id} href={`/opportunities/${opp.id}`}
                    className="block border-b border-gray-100 pb-3 last:border-0 hover:text-brand-700">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{opp.title}</span>
                      <div className="flex items-center gap-3">
                        {opp.publishedAt && <span className="text-xs text-gray-500">{new Date(opp.publishedAt).toLocaleDateString()}</span>}
                        <span className="text-sm font-bold text-brand-700">{Math.round(opp.scores[0]?.value ?? 0)}</span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>

          {historical.length > 0 && (
            <section className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Historical Catalysts</h2>
              <div className="space-y-3">
                {historical.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between border-b border-gray-100 pb-3 last:border-0">
                    <div>
                      <span className="text-sm font-medium text-gray-700">{cat.title}</span>
                    </div>
                    <Badge variant={cat.status === 'invalidated' ? 'danger' : 'default'}>{cat.status}</Badge>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="w-full lg:w-72 shrink-0 space-y-6">
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Company Facts</h3>
            <div className="text-sm space-y-2">
              <FactRow label="Sector" value={company.sector} />
              <FactRow label="Industry" value={company.industry} />
              <FactRow label="Market Cap" value={security.marketCap ? `$${(security.marketCap / 1e6).toFixed(0)}M` : null} />
              <FactRow label="Avg Volume" value={security.avgDollarVolume ? `$${(security.avgDollarVolume / 1e6).toFixed(1)}M` : null} />
              <FactRow label="CIK" value={company.cik} mono />
            </div>
          </div>

          <ExploreButton ticker={security.ticker} />
        </aside>
      </div>
    </div>
  );
}

function FactRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
