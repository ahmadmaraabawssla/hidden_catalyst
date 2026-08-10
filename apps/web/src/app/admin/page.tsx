import { Badge } from '@hidden-catalyst/ui';
import { getDashboardStats, getSources } from '@hidden-catalyst/db';
import RunFreshDiscoveryButton from './RunFreshDiscoveryButton';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const [stats, sources] = await Promise.all([getDashboardStats(), getSources()]);

  // Fetch latest discovery runs via raw PG
  let recentRuns: any[] = [];
  try {
    const { Client } = await import('pg');
    const pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    const runs = await pg.query(
      `SELECT id, status, engine_version, started_at, completed_at, target_candidates,
              funnel_screened, funnel_filing_candidates, funnel_deep_researched,
              funnel_qualified, funnel_rejected, funnel_watched
       FROM discovery_runs ORDER BY started_at DESC LIMIT 5`
    );
    recentRuns = runs.rows;
    await pg.end();
  } catch {}

  const lastRun = recentRuns[0];

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="flex gap-3">
          <a href="/admin/review" className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900">
            Review Queue
          </a>
          <a href="/feed" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Feed →
          </a>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard label="Published" value={stats.published} color="text-green-600" />
        <StatCard label="Needs Review" value={stats.needsReview} color="text-amber-600" />
        <StatCard label="Documents" value={stats.totalDocs} color="text-blue-600" />
        <StatCard label="Active Sources" value={stats.totalSources} color="text-purple-600" />
      </div>

      {/* ─── DISCOVERY ENGINE ─── */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Discovery Engine</h2>

        {/* Last run summary */}
        {lastRun ? (
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">
                  Last Run: {new Date(lastRun.started_at).toLocaleString()}
                </h3>
                <p className="text-sm text-gray-500">
                  Engine {lastRun.engine_version} · Status: {' '}
                  <Badge variant={lastRun.status === 'completed' ? 'success' : lastRun.status === 'running' ? 'warning' : 'default'}>
                    {lastRun.status}
                  </Badge>
                </p>
              </div>
            </div>

            {/* Funnel visualization */}
            {lastRun.funnel_screened > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-32 text-gray-500">Screened</span>
                  <span className="font-mono font-bold">{lastRun.funnel_screened.toLocaleString()}</span>
                  <span className="text-xs text-gray-400">companies</span>
                </div>
                <div className="flex items-center gap-3 text-sm ml-4">
                  <span className="w-28 text-gray-400">↳ With filings</span>
                  <span className="font-mono">{lastRun.funnel_filing_candidates}</span>
                </div>
                <div className="flex items-center gap-3 text-sm ml-4">
                  <span className="w-28 text-gray-400">↳ Deep researched</span>
                  <span className="font-mono">{lastRun.funnel_deep_researched}</span>
                  <span className="text-xs text-gray-400">(LLM analyzed)</span>
                </div>
                <div className="flex items-center gap-3 text-sm ml-4 font-semibold">
                  <span className="w-28 text-brand-700">↳ Qualified</span>
                  <span className="font-mono text-brand-700">{lastRun.funnel_qualified}</span>
                  <span className="text-xs text-gray-400">candidates</span>
                </div>
                <div className="flex items-center gap-3 text-sm ml-4">
                  <span className="w-28 text-gray-400">↳ Rejected</span>
                  <span className="font-mono">{lastRun.funnel_rejected}</span>
                </div>
                <div className="flex items-center gap-3 text-sm ml-4">
                  <span className="w-28 text-gray-400">↳ Watch</span>
                  <span className="font-mono">{lastRun.funnel_watched}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No funnel data available — run pending or failed.</p>
            )}
          </div>
        ) : (
          <div className="card mb-4 text-center py-8">
            <p className="text-sm text-gray-500">No discovery runs recorded yet.</p>
          </div>
        )}

        {/* Quick-run button */}
        <div className="flex gap-4 items-center">
          <RunFreshDiscoveryButton />
          <span className="text-xs text-gray-400">
            Runs the v3 engine: screens companies for recent filings, applies LLM analysis, performs cross-document resolution.
            Only qualified candidates are published to the feed.
          </span>
        </div>

        {/* Past runs */}
        {recentRuns.length > 1 ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Recent Runs</h3>
            <div className="space-y-1">
              {recentRuns.slice(1).map(function(run: any) {
                return (
                  <div key={run.id} className="flex items-center gap-3 text-xs text-gray-500 p-2 bg-gray-50 rounded">
                    <span>{new Date(run.started_at).toLocaleString()}</span>
                    <Badge variant={run.status === 'completed' ? 'success' : 'default'}>{run.status}</Badge>
                    <span>Qualified: {run.funnel_qualified}</span>
                    <span>Screened: {run.funnel_screened}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-4">Source Connectors</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map(function(source: any) {
          var lastRun = source.ingestionRuns[0];
          return (
            <div key={source.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{source.name}</h3>
                <Badge variant={source.enabled ? 'success' : 'default'}>
                  {source.enabled ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <div className="text-sm text-gray-500 space-y-1">
                <p>Family: {source.family}</p>
                <p>Documents: {source._count?.documents || 0}</p>
                {lastRun ? (
                  <p>Last run: {new Date(lastRun.startedAt).toLocaleString()}
                    {' '}— <Badge variant={lastRun.status === 'completed' ? 'success' : 'warning'}>{lastRun.status}</Badge>
                  </p>
                ) : (
                  <p className="text-gray-400">No runs yet</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card text-center">
      <div className={'text-3xl font-bold ' + color}>{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}
