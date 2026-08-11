'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RunPipelineButton() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [steps, setSteps] = useState<string[]>([]);
  const [count, setCount] = useState(0);

  async function runPipeline() {
    setStatus('running');
    setSteps(['Starting pipeline...']);
    setCount(0);

    try {
      const res = await fetch('/api/admin/run-source-agnostic', { method: 'POST' });
      const data = await res.json();

      if (!data.ok) {
        setSteps(data.steps || [data.error || 'Unknown error']);
        setStatus('error');
        return;
      }

      setSteps(data.steps);
      setCount(data.intelligence?.evaluated || 0);
      setStatus('done');
      router.refresh();
    } catch (err: any) {
      setSteps(['Error: ' + err.message]);
      setStatus('error');
    }
  }

  return (
    <div className="shrink-0 space-y-3">
      <button
        onClick={runPipeline}
        disabled={status === 'running'}
        className={`rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          status === 'done' ? 'bg-green-600 hover:bg-green-700' :
          status === 'error' ? 'bg-red-600 hover:bg-red-700' :
          'bg-brand-700 hover:bg-brand-900'
        }`}
      >
        {status === 'running' ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Running Intelligence Engine...
          </span>
        ) : status === 'done' ? (
          `Done · Evaluated ${count} clusters`
        ) : (
          'Run Source-Agnostic Engine'
        )}
      </button>

      {steps.length > 0 && (
        <div className={`rounded-lg p-3 text-xs ${status === 'error' ? 'bg-red-50 text-red-700' : status === 'done' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'} max-h-48 overflow-y-auto`}>
          {steps.map((s, i) => (
            <div key={i} className="py-0.5">{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}
