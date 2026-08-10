-- Paste this entire script into Supabase SQL Editor and run it
-- https://aputjchzkvbmwoxoatpu.supabase.co → SQL Editor → New Query → Paste → Run

INSERT INTO sources (id, name, family, access_type, reliability_tier, enabled, created_at, updated_at) VALUES
('source_sec_edgar', 'SEC EDGAR', 'sec_edgar', 'public_free', 1, true, NOW(), NOW()),
('source_fda', 'FDA', 'fda', 'public_free', 1, true, NOW(), NOW()),
('source_sam_gov', 'SAM.gov', 'federal_contracts', 'public_free', 1, true, NOW(), NOW()),
('source_uspto', 'USPTO', 'patents', 'public_free', 1, true, NOW(), NOW()),
('source_clinicaltrials', 'ClinicalTrials.gov', 'clinical_trials', 'public_free', 2, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO companies (id, legal_name, display_name, cik, sector, industry, website, created_at, updated_at) VALUES
('company_exm', 'Example Systems Inc.', 'Example Systems', '0001234567', 'Industrials', 'Engineering & Construction', 'https://example-systems.com', NOW(), NOW()),
('company_bpi', 'BioPharm Innovations Inc.', 'BioPharm Innovations', '0002345678', 'Healthcare', 'Biotechnology', 'https://biopharm-innovations.com', NOW(), NOW()),
('company_gtm', 'GreenTech Materials Corp.', 'GreenTech Materials', '0003456789', 'Energy', 'Critical Minerals', 'https://greentech-materials.com', NOW(), NOW()),
('company_cshi', 'CyberShield Corp.', 'CyberShield Corp', '0004567890', 'Technology', 'Cybersecurity', 'https://cybershield-corp.com', NOW(), NOW()),
('company_pmt', 'Precision MedTech Inc.', 'Precision MedTech', '0005678901', 'Healthcare', 'Medical Devices', 'https://precision-medtech.com', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO securities (id, company_id, ticker, exchange, market_cap, avg_dollar_volume, created_at, updated_at) VALUES
('sec_exm', 'company_exm', 'EXM', 'NASDAQ', 780000000, 2400000, NOW(), NOW()),
('sec_bpi', 'company_bpi', 'BPI', 'NASDAQ', 1200000000, 5100000, NOW(), NOW()),
('sec_gtm', 'company_gtm', 'GTM', 'NYSE', 450000000, 1800000, NOW(), NOW()),
('sec_cshi', 'company_cshi', 'CSHI', 'NYSE American', 320000000, 950000, NOW(), NOW()),
('sec_pmt', 'company_pmt', 'PMT', 'NASDAQ', 2400000000, 8200000, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO documents (id, source_id, canonical_url, published_at, retrieved_at, content_hash, title, text, created_at) VALUES
('doc_1', 'source_sam_gov', 'https://sam.gov/opp/abc123', '2026-07-28T14:30:00Z', '2026-08-01T09:00:00Z', 'sha256_doc1', 'Mod P00005 — Contract DE-AC02', 'DOE published modification P00005 increasing contract ceiling from $185M to $227M.', NOW()),
('doc_2', 'source_fda', 'https://www.fda.gov/media/xyz789', '2026-07-25T16:00:00Z', '2026-07-28T08:00:00Z', 'sha256_doc2', 'FDA Fast Track — BPI-301', 'FDA issued Fast Track designation for BPI-301.', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO evidence_items (id, document_id, excerpt, evidence_type, quality_score, created_at) VALUES
('ev_1', 'doc_1', 'Modification increases total contract ceiling from $185M to $227M, a $42M increase.', 'primary', 95, NOW()),
('ev_2', 'doc_1', 'Period of performance extended through September 30, 2028.', 'primary', 90, NOW()),
('ev_3', 'doc_2', 'FDA issued Fast Track designation for BPI-301 targeting primary biliary cholangitis.', 'primary', 90, NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (id, event_type, title, occurred_at, created_at) VALUES
('event_1', 'contract_modification', 'DOE contract modification expands program ceiling by $42M', '2026-07-28T14:30:00Z', NOW()),
('event_2', 'regulatory_approval', 'FDA Fast Track designation for BPI-301', '2026-07-25T16:00:00Z', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO opportunities (id, security_id, event_id, title, summary, status, detected_at, published_at, confidence, created_at, updated_at) VALUES
('opp_1', 'sec_exm', 'event_1', 'Federal contract modification expands program ceiling', 'DOE published a $42M ceiling increase, potentially expanding addressable revenue by 12-18% over two fiscal years.', 'published', '2026-08-01T09:14:00Z', '2026-08-01T14:00:00Z', 0.85, NOW(), NOW()),
('opp_2', 'sec_bpi', 'event_2', 'FDA grants Fast Track designation for rare-disease therapy', 'Fast Track may accelerate development by 6-12 months and increase probability of approval.', 'published', '2026-07-28T08:30:00Z', '2026-07-28T16:00:00Z', 0.78, NOW(), NOW()),
('opp_3', 'sec_gtm', NULL, 'DOE issues environmental permit for critical minerals processing', 'Record of Decision de-risks lithium processing plant and unlocks DOE loan guarantee eligibility.', 'published', '2026-07-30T10:00:00Z', '2026-07-30T18:00:00Z', 0.82, NOW(), NOW()),
('opp_4', 'sec_cshi', NULL, 'Patent grant for zero-trust network architecture covering 14 claims', 'USPTO granted patent strengthening IP moat in federal cybersecurity market valued at $12B.', 'needs_review', '2026-07-25T11:00:00Z', NULL, 0.65, NOW(), NOW()),
('opp_5', 'sec_pmt', NULL, 'Clinical trial meets primary endpoint; NDA submission planned', 'Phase 3 trial of PMT-200 met primary endpoint with p=0.003, supporting NDA by Q1 2027.', 'published', '2026-08-02T07:00:00Z', '2026-08-02T12:00:00Z', 0.91, NOW(), NOW()),
('opp_6', 'sec_exm', NULL, 'Supposed major DOE contract — invalidated', 'This opportunity was invalidated because the contract modification was later rescinded by the agency.', 'invalidated', '2026-06-15T08:00:00Z', '2026-06-16T10:00:00Z', 0.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO claims (id, opportunity_id, claim_type, text, confidence, evidence_item_ids, created_at) VALUES
('c1a', 'opp_1', 'verified_fact', 'The U.S. Department of Energy published modification P00005 to contract DE-AC02-05CH11231 on July 28, 2026.', 0.95, '["ev_1"]', NOW()),
('c1b', 'opp_1', 'verified_fact', 'The modification increases the total contract ceiling from $185M to $227M, a $42M increase.', 0.95, '["ev_1"]', NOW()),
('c1c', 'opp_1', 'inference', 'The modification may increase addressable revenue by 12-18% over the next two fiscal years.', 0.71, '["ev_1","ev_2"]', NOW()),
('c2a', 'opp_2', 'verified_fact', 'FDA issued Fast Track designation letter for BPI-301 targeting primary biliary cholangitis.', 0.95, '["ev_3"]', NOW()),
('c2b', 'opp_2', 'inference', 'Fast Track may accelerate development timeline by 6-12 months and increase probability of approval.', 0.68, '["ev_3"]', NOW()),
('c5a', 'opp_5', 'verified_fact', 'Phase 3 trial of PMT-200 met primary endpoint with p=0.003 and favorable safety profile.', 0.97, '[]', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO scores (id, opportunity_id, score_type, value, factors, model_version, calculated_at) VALUES
('s1a', 'opp_1', 'opportunity', 78, '{}', '1.0.0', NOW()),
('s1b', 'opp_1', 'information_asymmetry', 84, '{}', '1.0.0', NOW()),
('s1c', 'opp_1', 'catalyst_strength', 73, '{}', '1.0.0', NOW()),
('s1d', 'opp_1', 'evidence_quality', 92, '{}', '1.0.0', NOW()),
('s1e', 'opp_1', 'financial_materiality', 69, '{}', '1.0.0', NOW()),
('s1f', 'opp_1', 'risk', 42, '{}', '1.0.0', NOW()),
('s2a', 'opp_2', 'opportunity', 72, '{}', '1.0.0', NOW()),
('s2b', 'opp_2', 'information_asymmetry', 68, '{}', '1.0.0', NOW()),
('s2c', 'opp_2', 'catalyst_strength', 82, '{}', '1.0.0', NOW()),
('s2d', 'opp_2', 'evidence_quality', 88, '{}', '1.0.0', NOW()),
('s2e', 'opp_2', 'financial_materiality', 76, '{}', '1.0.0', NOW()),
('s2f', 'opp_2', 'risk', 48, '{}', '1.0.0', NOW()),
('s3a', 'opp_3', 'opportunity', 81, '{}', '1.0.0', NOW()),
('s3b', 'opp_3', 'information_asymmetry', 89, '{}', '1.0.0', NOW()),
('s4a', 'opp_4', 'opportunity', 65, '{}', '1.0.0', NOW()),
('s4b', 'opp_4', 'information_asymmetry', 71, '{}', '1.0.0', NOW()),
('s5a', 'opp_5', 'opportunity', 86, '{}', '1.0.0', NOW()),
('s5b', 'opp_5', 'information_asymmetry', 62, '{}', '1.0.0', NOW()),
('s5c', 'opp_5', 'catalyst_strength', 94, '{}', '1.0.0', NOW()),
('s5d', 'opp_5', 'evidence_quality', 95, '{}', '1.0.0', NOW()),
('s5e', 'opp_5', 'financial_materiality', 91, '{}', '1.0.0', NOW()),
('s5f', 'opp_5', 'risk', 45, '{}', '1.0.0', NOW()),
('s6a', 'opp_6', 'opportunity', 0, '{}', '1.0.0', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO risks (id, opportunity_id, risk_type, severity, description, created_at) VALUES
('r1a', 'opp_1', 'contract_ceiling_not_guaranteed', 'medium', 'Ceiling increase does not guarantee obligated funding.', NOW()),
('r1b', 'opp_1', 'customer_concentration', 'medium', 'DOE represents approximately 40% of company revenue.', NOW()),
('r4a', 'opp_4', 'micro_cap', 'high', 'Market cap of $320M is below micro-cap threshold.', NOW()),
('r4b', 'opp_4', 'low_liquidity', 'high', 'Avg daily dollar volume of $950K below $1M threshold.', NOW()),
('r5a', 'opp_5', 'binary_outcome', 'medium', 'FDA approval is not guaranteed despite positive Phase 3 results.', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO invalidation_rules (id, opportunity_id, rule_type, definition, status, created_at) VALUES
('inv1a', 'opp_1', 'confirmation', '{"trigger": "DOE issues funded task order against modified ceiling within 90 days."}', 'monitoring', NOW()),
('inv1b', 'opp_1', 'invalidation', '{"trigger": "Contract terminated for convenience or company loses re-compete."}', 'monitoring', NOW()),
('inv6a', 'opp_6', 'invalidation', '{"trigger": "Contract modification rescinded by the agency."}', 'triggered', NOW())
ON CONFLICT (id) DO NOTHING;
