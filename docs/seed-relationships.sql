-- Seed relationships and entities for the graph visualization
-- Run in Supabase SQL Editor

INSERT INTO entities (id, entity_type, canonical_name, attributes, created_at, updated_at) VALUES
('entity_doe', 'agency', 'U.S. Department of Energy', '{"jurisdiction":"federal","domain":"energy"}', NOW(), NOW()),
('entity_fda', 'agency', 'U.S. Food and Drug Administration', '{"jurisdiction":"federal","domain":"health"}', NOW(), NOW()),
('entity_uspto', 'agency', 'U.S. Patent and Trademark Office', '{"jurisdiction":"federal","domain":"intellectual_property"}', NOW(), NOW()),
('entity_bechtel', 'company', 'Bechtel National Inc.', '{"industry":"Engineering & Construction"}', NOW(), NOW()),
('entity_exm', 'company', 'Example Systems Inc.', '{"industry":"Engineering & Construction"}', NOW(), NOW()),
('entity_bpi', 'company', 'BioPharm Innovations Inc.', '{"industry":"Biotechnology"}', NOW(), NOW()),
('entity_gtm', 'company', 'GreenTech Materials Corp.', '{"industry":"Critical Minerals"}', NOW(), NOW()),
('entity_cshi', 'company', 'CyberShield Corp.', '{"industry":"Cybersecurity"}', NOW(), NOW()),
('entity_pmt', 'company', 'Precision MedTech Inc.', '{"industry":"Medical Devices"}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Entity mappings (link entities to companies)
INSERT INTO entity_mappings (id, company_id, entity_id, confidence, created_at) VALUES
('map_exm', 'company_exm', 'entity_exm', 1.0, NOW()),
('map_bpi', 'company_bpi', 'entity_bpi', 1.0, NOW()),
('map_gtm', 'company_gtm', 'entity_gtm', 1.0, NOW()),
('map_cshi', 'company_cshi', 'entity_cshi', 1.0, NOW()),
('map_pmt', 'company_pmt', 'entity_pmt', 1.0, NOW())
ON CONFLICT (id) DO NOTHING;

-- Relationships
INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, directness, confidence, evidence_id, created_at) VALUES
('rel_exm_doe', 'entity_exm', 'entity_doe', 'awarded_to', 'direct', 1.0, 'ev_1', NOW()),
('rel_exm_bechtel', 'entity_exm', 'entity_bechtel', 'partner_of', 'direct', 0.85, NULL, NOW()),
('rel_bpi_fda', 'entity_bpi', 'entity_fda', 'regulated_by', 'direct', 1.0, 'ev_3', NOW()),
('rel_gtm_doe', 'entity_gtm', 'entity_doe', 'awarded_to', 'direct', 0.9, NULL, NOW()),
('rel_cshi_uspto', 'entity_cshi', 'entity_uspto', 'granted_by', 'direct', 1.0, NULL, NOW()),
('rel_bechtel_doe', 'entity_bechtel', 'entity_doe', 'awarded_to', 'direct', 0.95, NULL, NOW())
ON CONFLICT (id) DO NOTHING;

-- Update opportunities with market reaction data
UPDATE opportunities SET 
  price_change_pct = 2.3,
  volume_change_pct = 15.0,
  sector_change_pct = 0.4,
  price_reaction_date = NOW()
WHERE id = 'opp_1';

UPDATE opportunities SET
  price_change_pct = 4.8,
  volume_change_pct = 32.0,
  sector_change_pct = 1.1,
  price_reaction_date = NOW()
WHERE id = 'opp_5';
