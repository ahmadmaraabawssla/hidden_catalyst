import { Badge } from '@hidden-catalyst/ui';
import { getDashboardStats, getSources } from '@hidden-catalyst/db';
import RunPipelineButton from './RunPipelineButton';
import RunDiscoveryButton from './RunDiscoveryButton';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const [stats, sources] = await Promise.all([getDashboardStats(), getSources()]);

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="flex gap-3">
          <a href="/admin/review" className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900">
            Review Queue ({stats.needsReview})
          </a>
          <a href="/admin/sources" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Sources
          </a>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard label="Published" value={stats.published} color="text-green-600" />
        <StatCard label="Needs Review" value={stats.needsReview} color="text-amber-600" />
        <StatCard label="Documents" value={stats.totalDocs} color="text-blue-600" />
        <StatCard label="Active Sources" value={stats.totalSources} color="text-purple-600" />
      </div>

      {/* ─── AI PIPELINE CONTROLS ─── */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Discovery Pipeline</h2>
        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h3 className="font-semibold text-gray-900">Daily Top 20 — Curation Engine</h3>
              <p className="text-sm text-gray-500 mt-1">
                Scans 500+ companies for recent material filings, selects the 20 most promising opportunities, 
                and runs DeepSeek AI to extract event details, dollar amounts, scenarios, and overlooked reasons.
              </p>
              <div className="mt-2 flex gap-4 text-xs text-gray-500">
                <span>🔍 Scans 500 companies</span>
                <span>🤖 DeepSeek AI analysis</span>
                <span>💰 ~$0.03 per run</span>
              </div>
            </div>
            <div className="flex gap-3 shrink-0">
              <RunPipelineButton />
              <RunDiscoveryButton />
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">How it works</h4>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>System scans companies sorted by market cap (smaller = prioritized)</li>
              <li>For each, checks SEC for recent 8-K filings (last 14 days)</li>
              <li>Downloads the actual filing text from SEC EDGAR</li>
              <li>DeepSeek AI reads the filing and extracts: event type, parties, dollar amounts, materiality</li>
              <li>Calculates 6-factor Opportunity Score using the PRD formula</li>
              <li>Auto-publishes opportunities that pass the publication gates</li>
              <li>User-triggered "Explore More" on individual company pages uses the same AI but on-demand</li>
            </ol>
          </div>
        </div>
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-4">Source Connectors</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((source) => {
          const lastRun = source.ingestionRuns[0];
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
                <p>Documents: {source._count.documents}</p>
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
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}
