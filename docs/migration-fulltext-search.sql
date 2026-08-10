-- Run this in Supabase SQL Editor to enable full-text search and vector search
-- https://aputjchzkvbmwoxoatpu.supabase.co → SQL Editor → New Query → Paste → Run

-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add full-text search tsvector columns
ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 3. Add vector embedding column for semantic search
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 4. Update tsvector from existing text
UPDATE documents SET search_vector = to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(text, ''));
UPDATE opportunities SET search_vector = to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(summary, ''));

-- 5. Create GIN indexes for fast full-text search
CREATE INDEX IF NOT EXISTS idx_documents_search ON documents USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_opportunities_search ON opportunities USING GIN (search_vector);

-- 6. Create IVFFlat index for vector similarity search (build after data exists)
-- CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 7. Create trigram indexes for fuzzy company name matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_companies_display_name_trgm ON companies USING GIN (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_companies_legal_name_trgm ON companies USING GIN (legal_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entities_canonical_name_trgm ON entities USING GIN (canonical_name gin_trgm_ops);

-- 8. Create a function to auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION documents_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION opportunities_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.summary, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Create triggers
DROP TRIGGER IF EXISTS trg_documents_search_vector ON documents;
CREATE TRIGGER trg_documents_search_vector
  BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_search_vector_update();

DROP TRIGGER IF EXISTS trg_opportunities_search_vector ON opportunities;
CREATE TRIGGER trg_opportunities_search_vector
  BEFORE INSERT OR UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION opportunities_search_vector_update();
