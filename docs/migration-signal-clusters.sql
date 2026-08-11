-- Source-agnostic intelligence upgrade:
-- normalized signals, catalyst clusters, and research confidence fields.

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  document_id TEXT REFERENCES documents(id),
  source_type TEXT NOT NULL,
  external_id TEXT,
  published_at TIMESTAMP(3) NOT NULL,
  retrieved_at TIMESTAMP(3) NOT NULL,
  title TEXT NOT NULL,
  raw_text TEXT,
  entities JSONB NOT NULL DEFAULT '[]',
  event_type TEXT,
  amounts JSONB NOT NULL DEFAULT '[]',
  dates JSONB NOT NULL DEFAULT '[]',
  locations JSONB NOT NULL DEFAULT '[]',
  source_url TEXT NOT NULL,
  source_quality DOUBLE PRECISION,
  raw_metadata JSONB NOT NULL DEFAULT '{}',
  triage_score DOUBLE PRECISION,
  triage_factors JSONB,
  triaged_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS signals_source_external_id_key
  ON signals(source_id, external_id);
CREATE INDEX IF NOT EXISTS signals_source_type_published_at_idx
  ON signals(source_type, published_at);
CREATE INDEX IF NOT EXISTS signals_event_type_published_at_idx
  ON signals(event_type, published_at);

CREATE TABLE IF NOT EXISTS catalyst_clusters (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id),
  title TEXT NOT NULL,
  thesis TEXT,
  cluster_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  primary_entity_id TEXT REFERENCES entities(id),
  materiality_json JSONB,
  attention_json JSONB,
  price_reaction_json JSONB,
  adversarial_json JSONB,
  comparable_json JSONB,
  research_questions JSONB NOT NULL DEFAULT '[]',
  research_completeness DOUBLE PRECISION,
  research_confidence DOUBLE PRECISION,
  priority_score DOUBLE PRECISION,
  priority_factors JSONB,
  first_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_evaluated_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS catalyst_clusters_status_priority_score_idx
  ON catalyst_clusters(status, priority_score);
CREATE INDEX IF NOT EXISTS catalyst_clusters_cluster_type_first_seen_at_idx
  ON catalyst_clusters(cluster_type, first_seen_at);

CREATE TABLE IF NOT EXISTS catalyst_cluster_signals (
  id TEXT PRIMARY KEY,
  cluster_id TEXT NOT NULL REFERENCES catalyst_clusters(id),
  signal_id TEXT NOT NULL REFERENCES signals(id),
  role TEXT NOT NULL DEFAULT 'supporting',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS catalyst_cluster_signals_cluster_signal_key
  ON catalyst_cluster_signals(cluster_id, signal_id);

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS cluster_id TEXT REFERENCES catalyst_clusters(id),
  ADD COLUMN IF NOT EXISTS research_completeness DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS engine_version TEXT,
  ADD COLUMN IF NOT EXISTS run_id TEXT,
  ADD COLUMN IF NOT EXISTS last_researched_at TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS discovery_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'running',
  engine_version TEXT NOT NULL,
  target_candidates INTEGER,
  max_scan INTEGER,
  max_deep_research INTEGER,
  funnel_screened INTEGER,
  funnel_filing_candidates INTEGER,
  funnel_deep_researched INTEGER,
  funnel_qualified INTEGER,
  funnel_rejected INTEGER,
  funnel_watched INTEGER,
  started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS discovery_runs_started_at_idx
  ON discovery_runs(started_at DESC);
