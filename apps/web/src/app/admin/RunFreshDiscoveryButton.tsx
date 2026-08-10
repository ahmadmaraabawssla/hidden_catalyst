'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RunFreshDiscoveryButton() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<any>(null);

  async function runDiscovery() {
    setStatus('running');
    setResult(null);
    try {
      const res = await fetch('/api/admin/run-fresh-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetCandidates: 20, maxScan: 500, maxDeepResearch: 100 }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        setStatus('done');
        router.refresh();
      } else {
        setResult({ error: data.error || 'Unknown error' });
        setStatus('error');
      }
    } catch (err: any) {
      setResult({ error: err.message });
      setStatus('error');
    }
  }

  return (
    <div>
      <button
        onClick={runDiscovery}
        disabled={status === 'running'}
        className={`rounded-lg px-5 py-3 text-sm font-semibold text-white transition-all ${
          status === 'running'
            ? 'bg-gray-400 cursor-not-allowed'
            : status === 'done'
            ? 'bg-green-600 hover:bg-green-700'
            : 'bg-brand-700 hover:bg-brand-900'
        }`}
      >
        {status === 'running' ? '⏳ Running Discovery...' :
         status === 'done' ? '✅ Discovery Complete — Run Again' :
         status === 'error' ? '⚠️ Retry Fresh Discovery' :
         '🚀 Run Fresh Discovery'}
      </button>

      {result?.funnel && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
          <p className="font-semibold text-green-800 mb-1">Run complete: {result.runId}</p>
          <div className="grid grid-cols-3 gap-2 text-xs text-green-700">
            <div>Screened: <strong>{result.funnel.screened.toLocaleString()}</strong></div>
            <div>Researched: <strong>{result.funnel.deepResearched}</strong></div>
            <div>Qualified: <strong className="text-green-900">{result.funnel.qualified}</strong></div>
            <div>Rejected: {result.funnel.rejected}</div>
            <div>Watch: {result.funnel.watched}</div>
          </div>
        </div>
      )}

      {result?.error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Error: {result.error}
        </div>
      )}
    </div>
  );
}
