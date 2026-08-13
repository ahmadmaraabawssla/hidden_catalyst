import React from 'react';

export type ThesisStatus = 'reject' | 'watch' | 'candidate' | 'verified' | string;
export type CheckStatus = 'verified' | 'partial' | 'pending' | 'failed' | 'not_applicable' | string;

const THESIS_STYLES: Record<string, { label: string; cls: string; dot: string }> = {
  verified: { label: 'Verified', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  candidate: { label: 'Candidate', cls: 'bg-blue-50 text-blue-700 ring-blue-600/20', dot: 'bg-blue-500' },
  watch: { label: 'Watch', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
  reject: { label: 'Rejected', cls: 'bg-rose-50 text-rose-700 ring-rose-600/20', dot: 'bg-rose-500' },
  rejected: { label: 'Rejected', cls: 'bg-rose-50 text-rose-700 ring-rose-600/20', dot: 'bg-rose-500' },
  monitoring: { label: 'Monitoring', cls: 'bg-purple-50 text-purple-700 ring-purple-600/20', dot: 'bg-purple-500' },
  confirmed: { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  invalidated: { label: 'Invalidated', cls: 'bg-gray-50 text-gray-600 ring-gray-500/20', dot: 'bg-gray-400' },
  stale: { label: 'Stale', cls: 'bg-gray-50 text-gray-500 ring-gray-400/20', dot: 'bg-gray-300' },
};

export function ThesisStatusBadge({ status }: { status: string | null | undefined }) {
  const meta = THESIS_STYLES[status ?? ''] ?? { label: status || 'Unknown', cls: 'bg-gray-50 text-gray-600 ring-gray-500/20', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${meta.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

const CHECK_STYLES: Record<string, { label: string; cls: string; icon: string }> = {
  verified: { label: 'Verified', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', icon: '✓' },
  partial: { label: 'Partial', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20', icon: '◐' },
  pending: { label: 'Pending', cls: 'bg-gray-50 text-gray-600 ring-gray-500/20', icon: '…' },
  failed: { label: 'Failed', cls: 'bg-rose-50 text-rose-700 ring-rose-600/20', icon: '✕' },
  not_applicable: { label: 'N/A', cls: 'bg-slate-50 text-slate-500 ring-slate-400/20', icon: '—' },
};

export function CheckStatusBadge({ status }: { status: CheckStatus | null | undefined }) {
  const meta = CHECK_STYLES[status ?? ''] ?? { label: status || 'Pending', cls: 'bg-gray-50 text-gray-600 ring-gray-500/20', icon: '…' };
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${meta.cls}`}>
      <span aria-hidden className="text-[10px] leading-none">{meta.icon}</span>
      {meta.label}
    </span>
  );
}

export function LevelBadge({ level }: { level: string | null | undefined }) {
  const styles: Record<string, string> = {
    LOW: 'bg-slate-100 text-slate-600',
    MODERATE: 'bg-amber-100 text-amber-800',
    HIGH: 'bg-orange-100 text-orange-800',
    EXTREME: 'bg-rose-100 text-rose-800',
    UNKNOWN: 'bg-gray-100 text-gray-500',
  };
  const cls = styles[level ?? ''] ?? styles.UNKNOWN;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${cls}`}>
      {level || 'UNKNOWN'}
    </span>
  );
}

export function MeasuredTag({ measured, label }: { measured: boolean | null | undefined; label?: string }) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium';
  if (measured) {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700`}>
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {label ? `${label} · measured` : 'Measured'}
      </span>
    );
  }
  return (
    <span className={`${base} bg-amber-50 text-amber-700`}>
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      {label ? `${label} · proxy` : 'Proxy / Estimate'}
    </span>
  );
}
