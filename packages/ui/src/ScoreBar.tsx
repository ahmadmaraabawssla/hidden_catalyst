import React from 'react';

interface ScoreBarProps {
  label: string;
  value: number;
  maxValue?: number;
  showValue?: boolean;
}

export function ScoreBar({ label, value, maxValue = 100, showValue = true }: ScoreBarProps) {
  const pct = Math.min(100, Math.max(0, (value / maxValue) * 100));

  const color =
    pct >= 80 ? 'bg-green-500'
    : pct >= 60 ? 'bg-lime-500'
    : pct >= 40 ? 'bg-amber-500'
    : pct >= 20 ? 'bg-orange-500'
    : 'bg-red-500';

  return (
    <div className="flex items-center gap-3">
      <span className="w-40 text-sm text-gray-600 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showValue && (
        <span className="w-10 text-sm font-mono text-right text-gray-700">
          {Math.round(value)}
        </span>
      )}
    </div>
  );
}
