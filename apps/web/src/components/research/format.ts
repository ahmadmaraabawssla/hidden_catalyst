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

/** "3 days ago", "today", "2 hours ago" — human readable, not expert jargon. */
export function relativeTime(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  const hours = Math.round(diffMs / 3600000);
  const days = Math.round(diffMs / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return formatDate(val);
}

/** Shelf life (days) per catalyst type, after which a catalyst is "old news". */
export function shelfLifeDays(clusterType: string | null | undefined): number {
  const t = (clusterType || '').toLowerCase();
  if (/8-k|8k|financing|merger|acquisition|liability|true.?up/.test(t)) return 3;
  if (/contract|award|grant/.test(t)) return 14;
  if (/fda|approval|trial|clinical|patent|regulatory/.test(t)) return 30;
  if (/10-q|10-k|10q|10k|earnings/.test(t)) return 14;
  return 7; // default
}

/** Is a catalyst older than its shelf life (i.e. "old news")? */
export function isStale(detectedAt: string | null | undefined, clusterType: string | null | undefined): boolean {
  if (!detectedAt) return false;
  const d = new Date(detectedAt);
  if (Number.isNaN(d.getTime())) return false;
  const ageDays = (Date.now() - d.getTime()) / 86400000;
  return ageDays > shelfLifeDays(clusterType);
}

/** Plain-English thesis status. */
export function plainThesis(status: string | null | undefined): { label: string; meaning: string } {
  switch (status) {
    case 'verified':
      return { label: 'Verified', meaning: 'Fully checked out — the evidence holds up and the market has had time to react.' };
    case 'candidate':
      return { label: 'Promising', meaning: 'A real signal worth a closer look, but not fully confirmed yet.' };
    case 'watch':
      return { label: 'Watching', meaning: 'Something caught our attention, but key details are still missing.' };
    case 'reject':
    case 'rejected':
      return { label: 'Not a catalyst', meaning: 'This turned out to be routine — nothing hidden here.' };
    default:
      return { label: status || 'Unknown', meaning: '' };
  }
}

/** Plain-English materiality level. */
export function plainMateriality(level: string | null | undefined): { label: string; tone: string } {
  switch (level) {
    case 'EXTREME':
      return { label: 'Very big', tone: 'This is huge relative to the company\'s size.' };
    case 'HIGH':
      return { label: 'Big', tone: 'This is a significant deal for this company.' };
    case 'MODERATE':
      return { label: 'Meaningful', tone: 'This is noticeable, but not transformative.' };
    case 'LOW':
      return { label: 'Small', tone: 'This is minor relative to the company\'s size.' };
    case 'UNKNOWN':
      return { label: 'Unclear', tone: 'We couldn\'t size this up yet.' };
    default:
      return { label: '—', tone: '' };
  }
}
