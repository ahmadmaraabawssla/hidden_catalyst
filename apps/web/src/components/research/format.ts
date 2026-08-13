import React from 'react';

export function formatMC(val: number | null | undefined): string {
  if (val == null) return '—';
  if (val >= 1e12) return '$' + (val / 1e12).toFixed(1) + 'T';
  if (val >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return '$' + (val / 1e6).toFixed(0) + 'M';
  return '$' + Math.round(val).toLocaleString();
}

export function formatPrice(val: number | null | undefined): string {
  if (val == null) return '—';
  if (val >= 100) return '$' + val.toFixed(2);
  if (val >= 1) return '$' + val.toFixed(2);
  return '$' + val.toFixed(4);
}

export function formatPct(val: number | null | undefined): string {
  if (val == null) return '—';
  return (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
}

export function formatDate(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatMoney(val: number | null | undefined): string {
  if (val == null) return '—';
  return '$' + val.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
