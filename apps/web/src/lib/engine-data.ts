/**
 * Engine data access for the web app.
 *
 * The source-agnostic-v2 engine writes the full research report into
 * `catalyst_clusters.structured_attributes.researchReport` plus the
 * `materiality_json`, `attention_json`, `price_reaction_json`, and
 * `adversarial_json` columns. These types mirror that JSON so the UI can
 * render the epistemic report faithfully instead of reconstructing it from
 * legacy v1 fields (claims / risks / hidden_angle).
 *
 * Uses raw `pg` (not Prisma) because the Prisma client is not regenerated
 * for every schema field and the existing pages already read via pg.
 */
import { Pool } from 'pg';

export type ThesisStatus = 'reject' | 'watch' | 'candidate' | 'verified';
export type CheckStatus = 'verified' | 'partial' | 'pending' | 'failed' | 'not_applicable';

export interface ResearchCheck {
  id: string;
  status: CheckStatus;
  source: string;
  check: string;
  result: string;
  why: string;
}

export interface ResearchClaim {
  status: 'verified' | 'inferred' | 'unverified' | 'rejected';
  text: string;
  evidence?: string;
  reason?: string;
}

export interface MaterialityResult {
  metric: string;
  numerator: number | null;
  denominator: number | null;
  ratio: number | null;
  level: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' | 'UNKNOWN';
  confidence: number | null;
  explanation: string;
}

export interface AttentionProfile {
  attentionScore: number;
  measured: boolean;
  source: 'fmp' | 'estimate';
  pressRelease: { found: boolean; count: number; headlines: string[] };
  news: { count: number; sentiment: number };
}

export interface PriceReactionResult {
  eventDate: string;
  returns: {
    t20: number | null;
    t5: number | null;
    t1: number | null;
    eventDay: number | null;
    p1: number | null;
    p5: number | null;
    p20: number | null;
  };
  volumeVsBaseline: number | null;
  marketReaction: 'minimal' | 'moderate' | 'strong' | 'unknown';
  pricedInScore: number | null;
  measured: boolean;
}

export interface AdversarialResult {
  findings: Array<{ title?: string; type?: string; description?: string; evidence?: string }>;
  confidencePenalty: number;
  fatalContradiction: boolean;
}

export interface ScenarioRow {
  label: string;
  input: number;
  output: number;
}

export interface ScenarioTable {
  title: string;
  note: string;
  inputLabel: string;
  outputLabel: string;
  rows: ScenarioRow[];
}

export interface ResearchReport {
  thesis: string | null;
  thesisStatus: ThesisStatus;
  direction: 'positive' | 'negative' | 'mixed' | 'unclear';
  summary: string;
  verifiedFacts: ResearchClaim[];
  inferredClaims: ResearchClaim[];
  unverifiedClaims: ResearchClaim[];
  rejectedClaims: ResearchClaim[];
  researchChecks: ResearchCheck[];
  materiality: MaterialityResult;
  adversarial: AdversarialResult;
  scenarioTables: ScenarioTable[];
  missingInputs: string[];
  openQuestions: string[];
  confidence: number;
  completeness: number;
  qualificationReasons: string[];
}

export interface SignalSource {
  id: string;
  title: string;
  sourceType: string;
  eventType: string | null;
  publishedAt: string;
  sourceUrl: string;
  role: string;
  externalId: string;
  amount: number | null;
  ceiling: number | null;
  amountIsCeiling: boolean;
}

export interface OpportunityResearch {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  verificationStatus: string;
  detectedAt: string;
  eventDate: string | null;
  publishedAt: string | null;
  confidence: number | null;
  researchCompleteness: number | null;
  engineVersion: string | null;
  ticker: string;
  exchange: string;
  latestPrice: number | null;
  marketCap: number | null;
  companyName: string;
  sector: string | null;
  industry: string | null;
  clusterType: string | null;
  clusterStatus: string | null;
  clusterThesis: string | null;
  priorityScore: number | null;
  report: ResearchReport | null;
  materiality: MaterialityResult | null;
  attention: AttentionProfile | null;
  priceReaction: PriceReactionResult | null;
  adversarial: AdversarialResult | null;
  signals: SignalSource[];
  lastUpgrade: {
    at: string;
    from: { thesis: string | null; priceMeasured: boolean };
    to: { thesis: string; priceMeasured: boolean };
  } | null;
}

function pgClient() {
  // ── Shared pool ──
  // Supabase pooler runs in session mode (pool_size 15). A fresh Client per
  // function call leaks a connection per query and hits "max clients reached".
  // A single module-level pool reuses connections and stays well under the cap.
  const globalPool = globalThis as unknown as { __hcPgPool?: Pool };
  if (!globalPool.__hcPgPool) {
    globalPool.__hcPgPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  }
  return globalPool.__hcPgPool;
}

function asString(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : String(value);
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

/** Parse a JSON column defensively into a typed object or null. */
function jsonOrNull<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return null; }
  }
  return value as T;
}

function parseReport(value: unknown): ResearchReport | null {
  const raw = jsonOrNull<Record<string, unknown>>(value);
  if (!raw || typeof raw !== 'object') return null;
  const checks = Array.isArray(raw.researchChecks) ? raw.researchChecks as unknown as ResearchCheck[] : [];
  const facts = Array.isArray(raw.verifiedFacts) ? raw.verifiedFacts as unknown as ResearchClaim[] : [];
  const inferred = Array.isArray(raw.inferredClaims) ? raw.inferredClaims as unknown as ResearchClaim[] : [];
  const unverified = Array.isArray(raw.unverifiedClaims) ? raw.unverifiedClaims as unknown as ResearchClaim[] : [];
  const rejected = Array.isArray(raw.rejectedClaims) ? raw.rejectedClaims as unknown as ResearchClaim[] : [];
  const scenarios = Array.isArray(raw.scenarioTables) ? raw.scenarioTables as unknown as ScenarioTable[] : [];
  return {
    thesis: raw.thesis != null ? asString(raw.thesis) : null,
    thesisStatus: (raw.thesisStatus as ThesisStatus) || 'watch',
    direction: (raw.direction as ResearchReport['direction']) || 'unclear',
    summary: asString(raw.summary),
    verifiedFacts: facts,
    inferredClaims: inferred,
    unverifiedClaims: unverified,
    rejectedClaims: rejected,
    researchChecks: checks,
    materiality: raw.materiality as unknown as MaterialityResult,
    adversarial: raw.adversarial as unknown as AdversarialResult,
    scenarioTables: scenarios,
    missingInputs: Array.isArray(raw.missingInputs) ? raw.missingInputs as string[] : [],
    openQuestions: Array.isArray(raw.openQuestions) ? raw.openQuestions as string[] : [],
    confidence: asNumber(raw.confidence) ?? 0,
    completeness: asNumber(raw.completeness) ?? 0,
    qualificationReasons: Array.isArray(raw.qualificationReasons) ? raw.qualificationReasons as string[] : [],
  };
}

function parseAttention(value: unknown): AttentionProfile | null {
  const raw = jsonOrNull<Record<string, unknown>>(value);
  if (!raw || typeof raw !== 'object') return null;
  const pr = jsonOrNull<Record<string, unknown>>(raw.pressRelease);
  const news = jsonOrNull<Record<string, unknown>>(raw.news);
  return {
    attentionScore: asNumber(raw.attentionScore) ?? 0,
    measured: asBool(raw.measured),
    source: (raw.source as 'fmp' | 'estimate') || 'estimate',
    pressRelease: {
      found: asBool(pr?.found),
      count: asNumber(pr?.count) ?? 0,
      headlines: Array.isArray(pr?.headlines) ? pr.headlines as string[] : [],
    },
    news: { count: asNumber(news?.count) ?? 0, sentiment: asNumber(news?.sentiment) ?? 0 },
  };
}

function parsePriceReaction(value: unknown): PriceReactionResult | null {
  const raw = jsonOrNull<Record<string, unknown>>(value);
  if (!raw || typeof raw !== 'object') return null;
  const ret = jsonOrNull<Record<string, unknown>>(raw.returns);
  return {
    eventDate: asString(raw.eventDate),
    returns: {
      t20: asNumber(ret?.t20),
      t5: asNumber(ret?.t5),
      t1: asNumber(ret?.t1),
      eventDay: asNumber(ret?.eventDay),
      p1: asNumber(ret?.p1),
      p5: asNumber(ret?.p5),
      p20: asNumber(ret?.p20),
    },
    volumeVsBaseline: asNumber(raw.volumeVsBaseline),
    marketReaction: (raw.marketReaction as PriceReactionResult['marketReaction']) || 'unknown',
    pricedInScore: asNumber(raw.pricedInScore),
    measured: asBool(raw.measured),
  };
}

function parseAdversarial(value: unknown): AdversarialResult | null {
  const raw = jsonOrNull<Record<string, unknown>>(value);
  if (!raw || typeof raw !== 'object') return null;
  return {
    findings: Array.isArray(raw.findings) ? raw.findings as AdversarialResult['findings'] : [],
    confidencePenalty: asNumber(raw.confidencePenalty) ?? 0,
    fatalContradiction: asBool(raw.fatalContradiction),
  };
}

function parseMateriality(value: unknown): MaterialityResult | null {
  const raw = jsonOrNull<Record<string, unknown>>(value);
  if (!raw || typeof raw !== 'object') return null;
  return {
    metric: asString(raw.metric),
    numerator: asNumber(raw.numerator),
    denominator: asNumber(raw.denominator),
    ratio: asNumber(raw.ratio),
    level: (raw.level as MaterialityResult['level']) || 'UNKNOWN',
    confidence: asNumber(raw.confidence),
    explanation: asString(raw.explanation),
  };
}

function mapOpportunity(row: Record<string, unknown>): OpportunityResearch {
  const report = parseReport(row.report_json);
  return {
    id: asString(row.id),
    title: asString(row.title),
    summary: row.summary != null ? asString(row.summary) : null,
    status: asString(row.status),
    verificationStatus: asString(row.verification_status),
    detectedAt: asString(row.detected_at),
    eventDate: row.event_date != null ? asString(row.event_date) : null,
    publishedAt: row.published_at != null ? asString(row.published_at) : null,
    confidence: asNumber(row.confidence),
    researchCompleteness: asNumber(row.research_completeness),
    engineVersion: row.engine_version != null ? asString(row.engine_version) : null,
    ticker: asString(row.ticker),
    exchange: asString(row.exchange),
    latestPrice: asNumber(row.latest_price),
    marketCap: asNumber(row.market_cap),
    companyName: asString(row.company_name),
    sector: row.sector != null ? asString(row.sector) : null,
    industry: row.industry != null ? asString(row.industry) : null,
    clusterType: row.cluster_type != null ? asString(row.cluster_type) : null,
    clusterStatus: row.cluster_status != null ? asString(row.cluster_status) : null,
    clusterThesis: row.cluster_thesis != null ? asString(row.cluster_thesis) : null,
    priorityScore: asNumber(row.priority_score),
    report,
    materiality: parseMateriality(row.materiality_json) ?? report?.materiality ?? null,
    attention: parseAttention(row.attention_json),
    priceReaction: parsePriceReaction(row.price_reaction_json),
    adversarial: parseAdversarial(row.adversarial_json) ?? report?.adversarial ?? null,
    signals: [],
    lastUpgrade: parseLastUpgrade(row.last_upgrade),
  };
}

function parseLastUpgrade(value: unknown): OpportunityResearch['lastUpgrade'] {
  const raw = jsonOrNull<Record<string, unknown>>(value);
  if (!raw || typeof raw !== 'object') return null;
  const from = jsonOrNull<Record<string, unknown>>(raw.from);
  const to = jsonOrNull<Record<string, unknown>>(raw.to);
  return {
    at: asString(raw.at),
    from: { thesis: from?.thesis != null ? asString(from.thesis) : null, priceMeasured: asBool(from?.priceMeasured) },
    to: { thesis: asString(to?.thesis), priceMeasured: asBool(to?.priceMeasured) },
  };
}

const OPPORTUNITY_SELECT = `
  o.id, o.title, o.summary, o.status, o.verification_status,
  o.detected_at, o.published_at, o.confidence, o.research_completeness, o.engine_version,
  s.ticker, s.exchange, s.latest_price, s.market_cap,
  c.display_name AS company_name, c.sector, c.industry,
  cl.cluster_type, cl.status AS cluster_status, cl.thesis AS cluster_thesis, cl.priority_score,
  cl.materiality_json, cl.attention_json, cl.price_reaction_json, cl.adversarial_json,
  cl.structured_attributes -> 'researchReport' AS report_json,
  cl.structured_attributes -> 'lastUpgrade' AS last_upgrade,
  (SELECT MIN(sg.published_at) FROM catalyst_cluster_signals csg JOIN signals sg ON sg.id = csg.signal_id WHERE csg.cluster_id = cl.id) AS event_date
`;

const OPPORTUNITY_JOIN = `
  FROM opportunities o
  JOIN securities s ON s.id = o.security_id
  JOIN companies c ON c.id = s.company_id
  LEFT JOIN catalyst_clusters cl ON cl.id = o.cluster_id
`;

/**
 * List opportunities from the v2 engine by thesis (verification) status.
 *
 * The engine's `status` column is an internal pipeline state (candidate /
 * published / rejected); the user-facing state is `verification_status`
 * (verified / candidate / watch / rejected). The feed surfaces the
 * user-facing state, so we filter on verification_status, not status.
 */
export async function getEngineOpportunities(opts?: {
  verificationStatus?: string[];
  limit?: number;
}): Promise<OpportunityResearch[]> {
  const params: unknown[] = [];
  const statuses = opts?.verificationStatus ?? ['verified', 'candidate', 'watch'];
  params.push(statuses);
  // Match the engine's DISCOVERY_MAX_MARKET_CAP (default $20B) so the display
  // layer and the harvest layer agree: a mega-cap (e.g. Bank of Nova Scotia
  // $152B) is NOT "underfollowed" and must not appear as a discovery, even if
  // it was harvested before the underfollowed-selection filter existed.
  const maxCap = Number(process.env.DISCOVERY_MAX_MARKET_CAP || 20_000_000_000);
  params.push(maxCap);
  const query = `
    SELECT ${OPPORTUNITY_SELECT}
    ${OPPORTUNITY_JOIN}
    WHERE o.engine_version = 'source-agnostic-v2'
      AND o.verification_status = ANY($1::text[])
      AND o.status != 'rejected'
      AND o.status != 'archived'
      AND s.active = true
      AND s.exchange IN ('NYSE', 'NASDAQ', 'NYSE American')
      AND (s.market_cap IS NULL OR s.market_cap <= $2)
    ORDER BY
      CASE o.verification_status WHEN 'verified' THEN 0 WHEN 'candidate' THEN 1 ELSE 2 END,
      o.published_at DESC NULLS LAST,
      o.detected_at DESC
    LIMIT ${opts?.limit ?? 100}
  `;
  try {
    const res = await pgClient().query(query, params);
    return res.rows.map(mapOpportunity);
  } catch {
    return [];
  }
}

/**
 * True counts of discovery opportunities by verification status, respecting
 * the same market-cap ceiling as the list query (so the badge number matches
 * what's actually shown). Returns { qualified, watch }.
 */
export async function getEngineCounts(): Promise<{ qualified: number; watch: number }> {
  try {
    const maxCap = Number(process.env.DISCOVERY_MAX_MARKET_CAP || 20_000_000_000);
    const res = await pgClient().query(
      `SELECT
         COUNT(*) FILTER (WHERE o.verification_status IN ('verified','candidate')) AS qualified,
         COUNT(*) FILTER (WHERE o.verification_status = 'watch') AS watch
       FROM opportunities o
       JOIN securities s ON s.id = o.security_id
       WHERE o.engine_version = 'source-agnostic-v2'
         AND o.status NOT IN ('rejected','archived')
         AND s.active = true
         AND s.exchange IN ('NYSE','NASDAQ','NYSE American')
         AND (s.market_cap IS NULL OR s.market_cap <= $1)`,
      [maxCap]
    );
    const row = res.rows[0];
    return {
      qualified: Number(row?.qualified ?? 0),
      watch: Number(row?.watch ?? 0),
    };
  } catch {
    return { qualified: 0, watch: 0 };
  }
}

/** Fetch a single opportunity with its full research report + signals. */
export async function getEngineOpportunity(id: string): Promise<OpportunityResearch | null> {
  const pool = pgClient();
  const res = await pool.query(
    `SELECT ${OPPORTUNITY_SELECT} ${OPPORTUNITY_JOIN} WHERE o.id = $1`,
    [id]
  );
  if (!res.rows[0]) return null;
  const opp = mapOpportunity(res.rows[0] as Record<string, unknown>);

  // Load linked signals
  const sigRes = await pool.query(
    `SELECT s.id, s.title, s.source_type, s.event_type, s.published_at, s.source_url, cs.role,
            s.external_id, s.raw_metadata
     FROM catalyst_cluster_signals cs
     JOIN signals s ON s.id = cs.signal_id
     WHERE cs.cluster_id = (SELECT cluster_id FROM opportunities WHERE id = $1)
     ORDER BY (cs.role = 'primary') DESC, s.published_at DESC
     LIMIT 10`,
    [id]
  );
  opp.signals = sigRes.rows.map((r) => {
    const meta = jsonOrNull<Record<string, unknown>>(r.raw_metadata);
    return {
      id: asString(r.id),
      title: asString(r.title),
      sourceType: asString(r.source_type),
      eventType: r.event_type != null ? asString(r.event_type) : null,
      publishedAt: asString(r.published_at),
      sourceUrl: asString(r.source_url),
      role: asString(r.role),
      externalId: asString(r.external_id),
      amount: asNumber(meta?.amount),
      ceiling: asNumber(meta?.ceiling),
      amountIsCeiling: asBool(meta?.amountIsCeiling),
    };
  });
  return opp;
}

/** When the engine last finished a run (newest signal.retrieved_at or ingestion run). */
export async function getLastEngineRun(): Promise<string | null> {
  try {
    const res = await pgClient().query(
      `SELECT MAX(retrieved_at) AS last_run FROM signals`
    );
    const val = res.rows[0]?.last_run as string | null | undefined;
    return val ? String(val) : null;
  } catch {
    return null;
  }
}
