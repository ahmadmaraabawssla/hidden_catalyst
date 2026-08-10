/**
 * Typed API client for Hidden Catalyst.
 * Used by both server components (with absolute URLs) and client components (with relative URLs).
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `API error: ${res.status}`);
  }

  return res.json();
}

// ─── Types ───

export interface OpportunityListItem {
  id: string;
  title: string;
  status: string;
  summary: string | null;
  detectedAt: string;
  publishedAt: string | null;
  security: {
    ticker: string;
    exchange: string;
    marketCap: number | null;
    company: { displayName: string; sector: string | null };
  };
  scores: { scoreType: string; value: number }[];
  risks: { riskType: string; severity: string }[];
  claims: { claimType: string; text: string }[];
  _count: { claims: number };
}

export interface OpportunityDetail {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  detectedAt: string;
  publishedAt: string | null;
  confidence: number | null;
  security: {
    ticker: string;
    exchange: string;
    marketCap: number | null;
    avgDollarVolume: number | null;
    company: { displayName: string; sector: string | null; industry: string | null; cik: string | null };
  };
  claims: { id: string; claimType: string; text: string; confidence: number | null; evidenceItemIds: string[] }[];
  scores: { scoreType: string; value: number; factors: any; modelVersion: string }[];
  risks: { riskType: string; severity: string; description: string | null }[];
  invalidationRules: { ruleType: string; definition: any; status: string }[];
  reviewActions: { action: string; reason: string | null; createdAt: string; actor: { email: string } }[];
  event: { title: string; eventType: string } | null;
}

export interface CompanyProfile {
  ticker: string;
  exchange: string;
  marketCap: number | null;
  avgDollarVolume: number | null;
  company: {
    displayName: string;
    sector: string | null;
    industry: string | null;
    website: string | null;
    cik: string | null;
  };
  opportunities: {
    id: string;
    title: string;
    status: string;
    publishedAt: string | null;
    scores: { value: number }[];
  }[];
}

export interface WatchlistData {
  id: string;
  name: string;
  createdAt: string;
  items: { id: string; entityType: string; entityId: string; security: { ticker: string; exchange: string } | null }[];
}

export interface SearchResults {
  companies: { id: string; displayName: string; sector: string | null; securities: { ticker: string; exchange: string }[] }[];
  opportunities: { id: string; title: string; security: { ticker: string }; scores: { value: number }[] }[];
  documents: { id: string; title: string | null; publishedAt: string; source: { name: string } }[];
}

export interface SourceHealth {
  id: string;
  name: string;
  family: string;
  enabled: boolean;
  _count: { documents: number };
  ingestionRuns: { id: string; status: string; startedAt: string; countsJson: any }[];
}

// ─── Public API ───

export async function getOpportunities(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return fetchAPI<{ opportunities: OpportunityListItem[]; total: number }>(`/api/opportunities${qs}`);
}

export async function getOpportunity(id: string) {
  return fetchAPI<OpportunityDetail>(`/api/opportunities/${id}`);
}

export async function getCompany(ticker: string) {
  return fetchAPI<CompanyProfile>(`/api/companies/${ticker}`);
}

export async function search(query: string) {
  return fetchAPI<SearchResults>(`/api/search?q=${encodeURIComponent(query)}`);
}

export async function getWatchlists() {
  return fetchAPI<WatchlistData[]>(`/api/watchlists`);
}

export async function createWatchlist(name: string) {
  return fetchAPI<WatchlistData>(`/api/watchlists`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// ─── Admin API ───

export async function getReviewQueue() {
  return fetchAPI<OpportunityListItem[]>(`/api/admin/review`);
}

export async function approveOpportunity(id: string, publish = true) {
  return fetchAPI<any>(`/api/admin/review/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ publish }),
  });
}

export async function rejectOpportunity(id: string, reason: string) {
  return fetchAPI<any>(`/api/admin/review/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function invalidateOpportunity(id: string, reason: string) {
  return fetchAPI<any>(`/api/admin/opportunities/${id}/invalidate`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function getSourceHealth() {
  return fetchAPI<SourceHealth[]>(`/api/admin/sources`);
}

export async function triggerIngestion(sourceId: string) {
  return fetchAPI<any>(`/api/admin/sources/${sourceId}/run`, { method: 'POST' });
}

export async function getDashboardStats() {
  return fetchAPI<{ published: number; needsReview: number; totalDocs: number; totalSources: number }>(`/api/admin/stats`);
}
