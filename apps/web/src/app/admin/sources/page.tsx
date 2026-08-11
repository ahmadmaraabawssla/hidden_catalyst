import { Badge } from '@hidden-catalyst/ui';
import { getSources, getIngestionRuns, prisma } from '@hidden-catalyst/db';

export const dynamic = 'force-dynamic';

export default async function AdminSourcesPage() {
  const sources = await getSources();
  const signalCounts = await prisma.signal.groupBy({
    by: ['sourceId'],
    _count: { id: true },
  }).catch(() => []);
  const clusterCounts = await prisma.$queryRaw<Array<{ source_id: string; count: bigint }>>`
    SELECT s.source_id, COUNT(DISTINCT cs.cluster_id)::bigint AS count
    FROM signals s
    JOIN catalyst_cluster_signals cs ON cs.signal_id = s.id
    GROUP BY s.source_id
  `.catch(() => []);
  const signalsBySource = new Map(signalCounts.map((row) => [row.sourceId, row._count.id]));
  const clustersBySource = new Map(clusterCounts.map((row) => [row.source_id, Number(row.count)]));

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Source Operations</h1>
          <p className="mt-1 text-sm text-gray-500">Connector health, last run, and document counts.</p>
        </div>
        <div className="flex gap-3">
          <a href="/admin" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Dashboard
          </a>
          <a href="/admin/review" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Review Queue
          </a>
        </div>
      </div>

      <div className="space-y-6">
        {sources.map(async (source) => {
          const runs = await getIngestionRuns(source.id, 10);
          return (
            <div key={source.id} className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{source.name}</h2>
                  <p className="text-sm text-gray-500">
                    {source.family} — {source._count.documents} documents · {signalsBySource.get(source.id) || 0} signals · {clustersBySource.get(source.id) || 0} clusters
                  </p>
                </div>
                <Badge variant={source.enabled ? 'success' : 'default'}>
                  {source.enabled ? 'Active' : 'Disabled'}
                </Badge>
              </div>

              {runs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2 font-medium">Run ID</th>
                        <th className="pb-2 font-medium">Started</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Items</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr key={run.id} className="border-b border-gray-50">
                          <td className="py-2 font-mono text-xs">{run.id.slice(0, 12)}...</td>
                          <td className="py-2">{new Date(run.startedAt).toLocaleString()}</td>
                          <td className="py-2">
                            <Badge variant={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'warning'}>
                              {run.status}
                            </Badge>
                          </td>
                          <td className="py-2 text-gray-500">
                            {run.countsJson ? JSON.stringify(run.countsJson) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No ingestion runs recorded.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
