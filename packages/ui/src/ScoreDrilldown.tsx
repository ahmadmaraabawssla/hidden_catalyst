'use client';

import { useState } from 'react';

interface SubScore {
  label: string;
  value: number;
  weight?: number;
  note?: string;
}

interface ScoreDrilldownProps {
  label: string;
  value: number;
  maxValue?: number;
  confidence?: number;
  subScores?: SubScore[];
  missingInputs?: string[];
  modelVersion?: string;
}

export function ScoreDrilldown({
  label,
  value,
  maxValue = 100,
  confidence,
  subScores,
  missingInputs,
  modelVersion,
}: ScoreDrilldownProps) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.min(100, Math.max(0, (value / maxValue) * 100));

  const barColor =
    pct >= 80 ? 'bg-green-500'
    : pct >= 60 ? 'bg-lime-500'
    : pct >= 40 ? 'bg-amber-500'
    : pct >= 20 ? 'bg-orange-500'
    : 'bg-red-500';

  const confidenceLabel = confidence != null
    ? confidence >= 0.8 ? 'High'
    : confidence >= 0.5 ? 'Medium'
    : 'Low'
    : null;

  const confidenceColor = confidence != null
    ? confidence >= 0.8 ? 'text-green-600'
    : confidence >= 0.5 ? 'text-amber-600'
    : 'text-red-500'
    : '';

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        {/* Bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">{label}</span>
            <div className="flex items-center gap-2">
              {confidenceLabel && (
                <span className={`text-[10px] font-medium ${confidenceColor}`}>
                  {confidenceLabel} confidence
                </span>
              )}
              <span className="text-sm font-bold text-gray-900 tabular-nums">
                {Math.round(value)}
              </span>
            </div>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Expand arrow */}
        {(subScores?.length || missingInputs?.length) && (
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (subScores?.length || missingInputs?.length) && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-100 bg-gray-50">
          {/* Sub-score breakdown */}
          {subScores && subScores.length > 0 && (
            <div className="space-y-1.5 mb-2">
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                Components
              </span>
              {subScores.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-600">{s.label}</span>
                    {s.note && (
                      <span className="text-[10px] text-gray-400">({s.note})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${s.value >= 50 ? 'bg-brand-400' : 'bg-gray-400'}`}
                        style={{ width: `${Math.min(100, (s.value / maxValue) * 100)}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-gray-700 font-medium w-8 text-right">
                      {s.weight != null ? `${Math.round(s.value)}×${s.weight}` : Math.round(s.value)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Missing inputs */}
          {missingInputs && missingInputs.length > 0 && (
            <div className="pt-2 border-t border-gray-200">
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                Missing Data
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {missingInputs.map((m, i) => (
                  <span key={i} className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                    {m}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1 italic">
                Score confidence reduced due to missing inputs
              </p>
            </div>
          )}

          {/* Model version */}
          {modelVersion && (
            <div className="mt-2 pt-1.5 border-t border-gray-200 text-[10px] text-gray-400">
              v{modelVersion}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
