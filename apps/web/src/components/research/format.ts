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

/**
 * Strip EDGAR foreign-issuer markers and legal suffixes from a display name so
 * "BAE SYSTEMS PLC /FI/" renders as "BAE SYSTEMS PLC" rather than leaking the
 * filing-format marker into the UI.
 */
export function cleanCompanyName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .replace(/\s*\/FI\/\s*$/i, '')
    .replace(/\s*\(ADR\)\s*$/i, '')
    .replace(/\s*\/AD\s*$/i, '')
    .replace(/\s*\-ADR\s*$/i, '')
    .trim();
}

/**
 * Format a materiality ratio with enough significant digits that tiny
 * (but non-zero) values don't collapse to "0.0%".
 */
export function formatRatio(val: number | null | undefined): string {
  if (val == null) return '—';
  const pct = val * 100;
  if (pct >= 1) return pct.toFixed(1) + '%';
  if (pct >= 0.01) return pct.toFixed(2) + '%';
  if (pct > 0) return pct.toExponential(1) + '%';
  return '0%';
}
