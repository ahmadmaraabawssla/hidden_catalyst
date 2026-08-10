'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const MC_RANGES = [
  { value: 'all', label: 'All market caps' },
  { value: 'micro', label: 'Under $300M (Micro)' },
  { value: 'small', label: '$300M–$2B (Small)' },
  { value: 'mid', label: '$2B–$10B (Mid)' },
] as const;

const FORM_TYPES = ['8-K', '10-Q', '10-K', 'S-1', '13D/G'] as const;

const MAX_AGES = [
  { value: 1, label: 'Today' },
  { value: 3, label: 'Last 3 days' },
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
] as const;

const BATCH_SIZES = [5, 10, 20, 50] as const;

export default function RunDiscoveryButton() {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [steps, setSteps] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [tickers, setTickers] = useState<string[]>([]);

  // Form state
  const [batchSize, setBatchSize] = useState<number>(20);
  const [mcRange, setMcRange] = useState<string>('all');
  const [checkedForms, setCheckedForms] = useState<Set<string>>(new Set(['8-K', '10-Q', '10-K', 'S-1', '13D/G']));
  const [maxAge, setMaxAge] = useState<number>(7);

  function toggleForm(f: string) {
    const next = new Set(checkedForms);
    if (next.has(f)) next.delete(f); else next.add(f);
    setCheckedForms(next);
  }

  async function runDiscovery() {
    const formTypes = [...checkedForms].flatMap(f => {
      if (f === '13D/G') return ['13D', '13G'];
      return [f];
    });

    setShowForm(false);
    setStatus('running');
    setSteps(['Starting discovery pipeline...']);
    setCount(0);
    setTickers([]);

    try {
      const res = await fetch('/api/admin/run-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize, mcRange, formTypes, maxAgeDays: maxAge }),
      });
      const data = await res.json();

      if (!data.success) {
        setSteps(data.steps || [data.error || 'Unknown error']);
        setStatus('error');
        return;
      }

      setSteps(data.steps);
      setCount(data.published);
      setTickers(data.tickers || []);
      setStatus('done');
      router.refresh();
    } catch (err: any) {
      setSteps(['Error: ' + err.message]);
      setStatus('error');
    }
  }

  return (
    <div className="relative shrink-0 space-y-3">
      {/* Main button */}
      <button
        onClick={() => setShowForm(!showForm)}
        disabled={status === 'running'}
        className={`rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          status === 'done'
            ? 'bg-green-600 hover:bg-green-700'
            : status === 'error'
            ? 'bg-red-600 hover:bg-red-700'
            : 'bg-brand-700 hover:bg-brand-900'
        }`}
      >
        {status === 'running' ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Running Discovery...
          </span>
        ) : status === 'done' ? (
          `✅ ${count} published — Discover More`
        ) : (
          '🔍 Run Discovery'
        )}
      </button>

      {/* Filter form */}
      {showForm && (
        <div className="card w-80 space-y-4 absolute z-10 bg-white shadow-lg border border-gray-200">
          <h4 className="font-semibold text-gray-900 text-sm">Discovery Filters</h4>

          {/* Batch size */}
          <div>
            <label className="text-xs font-medium text-gray-600">Batch size</label>
            <select
              value={batchSize}
              onChange={e => setBatchSize(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {BATCH_SIZES.map(n => (
                <option key={n} value={n}>{n} companies</option>
              ))}
            </select>
          </div>

          {/* Market cap */}
          <div>
            <label className="text-xs font-medium text-gray-600">Market cap range</label>
            <select
              value={mcRange}
              onChange={e => setMcRange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {MC_RANGES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Form types */}
          <div>
            <label className="text-xs font-medium text-gray-600">Form types</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {FORM_TYPES.map(f => (
                <label key={f} className="flex items-center gap-1 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={checkedForms.has(f)}
                    onChange={() => toggleForm(f)}
                    className="rounded border-gray-300"
                  />
                  {f}
                </label>
              ))}
            </div>
          </div>

          {/* Max age */}
          <div>
            <label className="text-xs font-medium text-gray-600">Filing age</label>
            <select
              value={maxAge}
              onChange={e => setMaxAge(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {MAX_AGES.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={runDiscovery}
            disabled={checkedForms.size === 0}
            className="w-full rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
          >
            Start Discovery
          </button>
        </div>
      )}

      {/* Progress / results log */}
      {steps.length > 0 && (
        <div
          className={`rounded-lg p-3 text-xs max-h-56 overflow-y-auto ${
            status === 'error'
              ? 'bg-red-50 text-red-700'
              : status === 'done'
              ? 'bg-green-50 text-green-700'
              : 'bg-blue-50 text-blue-700'
          }`}
        >
          {steps.map((s, i) => (
            <div key={i} className="py-0.5">{s}</div>
          ))}
          {status === 'done' && count > 0 && (
            <div className="mt-2 pt-2 border-t border-green-200">
              <a href="/feed" className="text-green-700 font-semibold hover:underline">
                View {count} new {count === 1 ? 'opportunity' : 'opportunities'} in feed →
              </a>
              {tickers.length > 0 && (
                <div className="mt-1 text-green-600">
                  {tickers.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
