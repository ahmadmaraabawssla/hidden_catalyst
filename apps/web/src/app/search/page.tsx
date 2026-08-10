import { globalSearch } from '@hidden-catalyst/db';

export const dynamic = 'force-dynamic';

function formatMC(val: number): string {
  if (val >= 1e12) return '$' + (val / 1e12).toFixed(1) + 'T';
  if (val >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return '$' + (val / 1e6).toFixed(0) + 'M';
  return '$' + val;
}

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const query = searchParams.q || '';
  const results = query ? await globalSearch(query) : null;

  return (
    <div className="page-container max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Search</h1>
      <p className="text-gray-500 mb-6">Search across companies, opportunities, and source documents.</p>

      <form className="mb-8" method="GET">
        <div className="relative">
          <input
            type="text" name="q" defaultValue={query}
            placeholder="Search by ticker, company name, event, or keyword..."
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
            autoFocus
          />
          <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-brand-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-900 transition-colors">
            Search
          </button>
        </div>
      </form>

      {results ? (
        <div className="space-y-8">
          {/* Companies */}
          {results.companies.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Companies</h2>
                <span className="text-xs text-gray-500">{results.companies.length} found</span>
              </div>
              <div className="space-y-2">
                {results.companies.map((c) => (
                  <a key={c.id} href={`/companies/${c.securities[0]?.ticker}`}
                    className="card flex items-center justify-between hover:border-brand-300 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-semibold text-gray-900 truncate">{c.displayName}</span>
                      <span className="text-gray-500 font-mono text-sm shrink-0">{c.securities[0]?.ticker}</span>
                      <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">{c.securities[0]?.exchange}</span>
                    </div>
                    {c.sector && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 shrink-0">
                        {c.sector}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Opportunities */}
          {results.opportunities.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Opportunities</h2>
                <span className="text-xs text-gray-500">{results.opportunities.length} found</span>
              </div>
              <div className="space-y-2">
                {results.opportunities.map((opp) => (
                  <a key={opp.id} href={`/opportunities/${opp.id}`}
                    className="card flex items-center justify-between hover:border-brand-300 transition-colors">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-gray-900 block truncate">{opp.title}</span>
                      <span className="text-sm text-gray-500">{opp.security.ticker}</span>
                    </div>
                    <span className="text-lg font-bold text-brand-700 tabular-nums shrink-0 ml-4">
                      {Math.round(opp.scores[0]?.value ?? 0)}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Documents */}
          {results.documents.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Source Documents</h2>
                <span className="text-xs text-gray-500">{results.documents.length} found</span>
              </div>
              <div className="space-y-2">
                {results.documents.map((doc) => (
                  <div key={doc.id} className="card">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="font-medium text-gray-900 block truncate">{doc.title}</span>
                        <span className="text-sm text-gray-500">{(doc.source as any)?.name || 'Unknown Source'}</span>
                      </div>
                      <span className="text-sm text-gray-500 shrink-0 ml-4">
                        {new Date((doc as any).publishedAt || Date.now()).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* No results */}
          {results.companies.length === 0 && results.opportunities.length === 0 && results.documents.length === 0 && (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🔍</div>
              <h2 className="text-xl font-semibold text-gray-900">No results found</h2>
              <p className="text-sm text-gray-500 mt-2">
                No matches for &quot;{query}&quot;. Try a different ticker, company name, or keyword.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="text-xl font-semibold text-gray-900">Search the platform</h2>
          <p className="text-sm text-gray-500 mt-2">
            Enter a ticker, company name, or keyword to search across all opportunities, companies, and source documents.
          </p>
        </div>
      )}
    </div>
  );
}
