import React from 'react';

type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

const severityStyles: Record<RiskSeverity, string> = {
  low: 'bg-gray-100 text-gray-600 border-gray-300',
  medium: 'bg-amber-50 text-amber-700 border-amber-300',
  high: 'bg-orange-50 text-orange-700 border-orange-300',
  critical: 'bg-red-50 text-red-700 border-red-300',
};

interface RiskBadgeProps {
  label: string;
  severity?: RiskSeverity;
}

export function RiskBadge({ label, severity = 'medium' }: RiskBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${severityStyles[severity]}`}
    >
      {severity === 'critical' || severity === 'high' ? '⚠ ' : ''}
      {label}
    </span>
  );
}
