'use client';

import { useState } from 'react';

export default function ExploreButton({ ticker }: { ticker: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  async function handleExplore() {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch(`/api/companies/${ticker}/explore`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Analysis failed');
        return;
      }

      setResult(data);
    } catch (e) {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleExplore}
        disabled={loading}
        className="w-full rounded-lg border border-brand-300 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            AI analyzing...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            🤖 Scan for New Signals
          </span>
        )}
      </button>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-2">
          <p className="text-sm font-semibold text-green-800">✅ AI Analysis Complete</p>
          <p className="text-xs text-green-700">{result.eventSummary}</p>
          {result.opportunityId && (
            <a
              href={`/opportunities/${result.opportunityId}`}
              className="inline-block text-xs font-medium text-brand-700 hover:underline mt-1"
            >
              View full opportunity →
            </a>
          )}
          <button
            onClick={() => setResult(null)}
            className="text-xs text-gray-500 hover:underline mt-1 block"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
