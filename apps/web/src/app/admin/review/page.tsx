import { Badge, RiskBadge } from '@hidden-catalyst/ui';
import { getReviewQueue, approveAndPublish, rejectOpportunity } from '@hidden-catalyst/db';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';
const ACTOR_ID = 'user_admin_001';

export default async function AdminReviewPage() {
  const candidates = await getReviewQueue({ status: 'needs_review', limit: 100 });

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Review Queue</h1>
          <p className="mt-1 text-sm text-gray-500">{candidates.length} candidates awaiting review</p>
        </div>
        <div className="flex gap-3">
          <a href="/admin" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Dashboard
          </a>
          <a href="/admin/sources" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Sources
          </a>
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          <p className="text-lg">Queue is clear</p>
          <p className="text-sm">All candidates have been reviewed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {candidates.map((candidate) => {
            const oppScore = candidate.scores.find(s => s.scoreType === 'opportunity')?.value ?? 0;
            const evScore = candidate.scores.find(s => s.scoreType === 'evidence_quality')?.value ?? 0;
            const riskScore = candidate.scores.find(s => s.scoreType === 'risk')?.value ?? 0;

            return (
              <div key={candidate.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{candidate.security.company.displayName}</span>
                      <span className="text-gray-500">{candidate.security.ticker} · {candidate.security.exchange}</span>
                      {candidate.security.marketCap && (
                        <Badge>${(candidate.security.marketCap / 1e6).toFixed(0)}M</Badge>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-brand-700">{candidate.title}</h3>
                    {candidate.summary && (
                      <p className="mt-1 text-sm text-gray-600">{candidate.summary}</p>
                    )}
                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                      <span>Score: {Math.round(oppScore)}</span>
                      <span>Evidence Quality: {Math.round(evScore)}</span>
                      <span>Risk: {Math.round(riskScore)}</span>
                      <span>{candidate._count.claims} claims</span>
                      <span>Detected: {new Date(candidate.detectedAt).toLocaleDateString()}</span>
                    </div>
                    {candidate.risks.length > 0 && (
                      <div className="mt-2 flex gap-1">
                        {candidate.risks.map(r => (
                          <RiskBadge key={r.riskType} label={r.riskType.replace(/_/g, ' ')} severity={r.severity as any} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold text-brand-700">{Math.round(oppScore)}</div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 flex gap-3">
                  <form
                    action={async () => {
                      'use server';
                      await approveAndPublish(candidate.id, ACTOR_ID);
                      revalidatePath('/admin/review');
                    }}
                  >
                    <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors">
                      Approve & Publish
                    </button>
                  </form>

                  <form
                    action={async (formData: FormData) => {
                      'use server';
                      const reason = formData.get('reason') as string;
                      await rejectOpportunity(candidate.id, ACTOR_ID, reason || 'Rejected by reviewer');
                      revalidatePath('/admin/review');
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text" name="reason" placeholder="Rejection reason..."
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-48"
                    />
                    <button type="submit" className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors">
                      Reject
                    </button>
                  </form>

                  <a
                    href={`/opportunities/${candidate.id}`}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    View Details →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
