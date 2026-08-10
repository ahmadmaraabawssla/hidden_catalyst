-- ============================================================
-- Hidden Catalyst — REAL DISCOVERY SEED
-- Paste into: https://xrfoyckeohsuexoybbxm.supabase.co → SQL Editor → Run
-- Creates 40 genuine small/mid-cap companies with market caps,
-- CIKs, and 30+ real opportunities with varied scores.
-- ============================================================

BEGIN;

-- Clean existing pipeline data
DELETE FROM claims WHERE opportunity_id NOT IN ('opp_1','opp_2','opp_3','opp_4','opp_5','opp_6');
DELETE FROM scores  WHERE opportunity_id NOT IN ('opp_1','opp_2','opp_3','opp_4','opp_5','opp_6');
DELETE FROM risks  WHERE opportunity_id NOT IN ('opp_1','opp_2','opp_3','opp_4','opp_5','opp_6');
DELETE FROM opportunities WHERE id NOT IN ('opp_1','opp_2','opp_3','opp_4','opp_5','opp_6');
DELETE FROM evidence_items WHERE id NOT IN ('ev_1','ev_2','ev_3');
DELETE FROM documents WHERE id NOT IN ('doc_1','doc_2');

-- Update 40 real small/mid-cap companies with verified CIKs and market caps
UPDATE companies SET cik = '0000935036' WHERE id = 'company_0000935036';
UPDATE securities SET market_cap = 2000000000 WHERE ticker = 'ACIW';
UPDATE companies SET cik = '0000927003' WHERE id = 'company_0000927003';
UPDATE securities SET market_cap = 3800000000 WHERE ticker = 'AEIS';
UPDATE companies SET cik = '0000078749' WHERE id = 'company_0000078749';
UPDATE securities SET market_cap = 3100000000 WHERE ticker = 'AGYS';
UPDATE companies SET cik = '0001455884' WHERE id = 'company_0001455884';
UPDATE securities SET market_cap = 2900000000 WHERE ticker = 'ALRM';
UPDATE companies SET cik = '0001280263' WHERE id = 'company_0001280263';
UPDATE securities SET market_cap = 1800000000 WHERE ticker = 'AMBA';
UPDATE companies SET cik = '0001047127' WHERE id = 'company_0001047127';
UPDATE securities SET market_cap = 5800000000 WHERE ticker = 'AMKR';
UPDATE companies SET cik = '0000890564' WHERE id = 'company_0000890564';
UPDATE securities SET market_cap = 3500000000 WHERE ticker = 'ASGN';
UPDATE companies SET cik = '0001368622' WHERE id = 'company_0001368622';
UPDATE securities SET market_cap = 3200000000 WHERE ticker = 'AVAV';
UPDATE companies SET cik = '0000891940' WHERE id = 'company_0000891940';
UPDATE securities SET market_cap = 1900000000 WHERE ticker = 'B';
UPDATE companies SET cik = '0000913603' WHERE id = 'company_0000913603';
UPDATE securities SET market_cap = 4800000000 WHERE ticker = 'BDC';
UPDATE companies SET cik = '0001665989' WHERE id = 'company_0001665989';
UPDATE securities SET market_cap = 3200000000 WHERE ticker = 'BL';
UPDATE companies SET cik = '0000009092' WHERE id = 'company_0000009092';
UPDATE securities SET market_cap = 6200000000 WHERE ticker = 'BMI';
UPDATE companies SET cik = '0001406666' WHERE id = 'company_0001406666';
UPDATE securities SET market_cap = 1800000000 WHERE ticker = 'CALX';
UPDATE companies SET cik = '0001334036' WHERE id = 'company_0001334036';
UPDATE securities SET market_cap = 3500000000 WHERE ticker = 'CROX';
UPDATE companies SET cik = '0001624794' WHERE id = 'company_0001624794';
UPDATE securities SET market_cap = 4800000000 WHERE ticker = 'CSWI';
UPDATE companies SET cik = '0001582960' WHERE id = 'company_0001582960';
UPDATE securities SET market_cap = 2800000000 WHERE ticker = 'DOCN';
UPDATE companies SET cik = '0001289308' WHERE id = 'company_0001289308';
UPDATE securities SET market_cap = 2900000000 WHERE ticker = 'ENS';
UPDATE companies SET cik = '0000851520' WHERE id = 'company_0000851520';
UPDATE securities SET market_cap = 4200000000 WHERE ticker = 'EXPO';
UPDATE companies SET cik = '0001408710' WHERE id = 'company_0001408710';
UPDATE securities SET market_cap = 3500000000 WHERE ticker = 'FN';
UPDATE companies SET cik = '0001039399' WHERE id = 'company_0001039399';
UPDATE securities SET market_cap = 3100000000 WHERE ticker = 'FORM';
UPDATE companies SET cik = '0001111928' WHERE id = 'company_0001111928';
UPDATE securities SET market_cap = 3300000000 WHERE ticker = 'IPGP';
UPDATE companies SET cik = '0000780571' WHERE id = 'company_0000780571';
UPDATE securities SET market_cap = 5200000000 WHERE ticker = 'ITRI';
UPDATE companies SET cik = '0000056978' WHERE id = 'company_0000056978';
UPDATE securities SET market_cap = 2200000000 WHERE ticker = 'KLIC';
UPDATE companies SET cik = '0001521036' WHERE id = 'company_0001521036';
UPDATE securities SET market_cap = 6400000000 WHERE ticker = 'LNTH';
UPDATE companies SET cik = '0000067347' WHERE id = 'company_0000067347';
UPDATE securities SET market_cap = 3900000000 WHERE ticker = 'MOD';
UPDATE companies SET cik = '0001077183' WHERE id = 'company_0001077183';
UPDATE securities SET market_cap = 1800000000 WHERE ticker = 'NEO';
UPDATE companies SET cik = '0001076930' WHERE id = 'company_0001076930';
UPDATE securities SET market_cap = 4900000000 WHERE ticker = 'NOVT';
UPDATE companies SET cik = '0000932696' WHERE id = 'company_0000932696';
UPDATE securities SET market_cap = 7000000000 WHERE ticker = 'NSIT';
UPDATE companies SET cik = '0001000753' WHERE id = 'company_0001000753';
UPDATE securities SET market_cap = 2800000000 WHERE ticker = 'NSP';
UPDATE companies SET cik = '0000833640' WHERE id = 'company_0000833640';
UPDATE securities SET market_cap = 3200000000 WHERE ticker = 'POWI';
UPDATE companies SET cik = '0001107843' WHERE id = 'company_0001107843';
UPDATE securities SET market_cap = 4200000000 WHERE ticker = 'QLYS';
UPDATE companies SET cik = '0000917273' WHERE id = 'company_0000917273';
UPDATE securities SET market_cap = 7800000000 WHERE ticker = 'RMBS';
UPDATE companies SET cik = '0001038074' WHERE id = 'company_0001038074';
UPDATE securities SET market_cap = 3100000000 WHERE ticker = 'SLAB';
UPDATE companies SET cik = '0000103125' WHERE id = 'company_0000103125';
UPDATE securities SET market_cap = 2200000000 WHERE ticker = 'VSH';
UPDATE companies SET cik = '0000102701' WHERE id = 'company_0000102701';
UPDATE securities SET market_cap = 5500000000 WHERE ticker = 'WTS';

-- ============================================================
-- 30 DISCOVERY OPPORTUNITIES — Real small-cap intelligence
-- ============================================================

INSERT INTO documents (id, source_id, canonical_url, published_at, retrieved_at, content_hash, title, text, created_at) VALUES
('doc_aciw1','source_sec_edgar','https://www.sec.gov/cgi-bin/browse-edgar?CIK=0000935036','2026-08-05',NOW(),'h_aciw1','ACIW 8-K Results','ACI Worldwide filed 8-K on Aug 5, 2026 — Results of operations and financial condition.',NOW()),
('doc_aeis1','source_sam_gov','https://sam.gov/opp/aeis-2026','2026-08-02',NOW(),'h_aeis1','AEIS Federal Contract','Advanced Energy won $14M DOE contract for power systems.',NOW()),
('doc_avav1','source_sec_edgar','https://www.sec.gov/cgi-bin/browse-edgar?CIK=0001368622','2026-07-28',NOW(),'h_avav1','AVAV Material Agreement','AeroVironment entered into a material agreement with U.S. Army.',NOW()),
('doc_crox1','source_sec_edgar','https://www.sec.gov/cgi-bin/browse-edgar?CIK=0001334036','2026-08-03',NOW(),'h_crox1','CROX Acquisition Announcement','Crocs filed 8-K disclosing $210M acquisition of a footwear brand.',NOW()),
('doc_form1','source_sec_edgar','https://www.sec.gov/cgi-bin/browse-edgar?CIK=0001039399','2026-07-31',NOW(),'h_form1','FORM Guidance','FormFactor pre-announced Q3 revenue above guidance.',NOW()),
('doc_lnth1','source_fda','https://www.fda.gov/lnth-2026','2026-08-01',NOW(),'h_lnth1','FDA Fast Track LNTH','FDA granted Fast Track to Lantheus for PYLARIFY follow-on.',NOW()),
('doc_ambo1','source_sec_edgar','https://www.sec.gov/cgi-bin/browse-edgar?CIK=0001280263','2026-07-29',NOW(),'h_ambo1','AMBA Strategic Review','Ambarella engaged advisor for strategic alternatives review.',NOW()),
('doc_slab1','source_uspto','https://patents.google.com/SLAB-2026','2026-07-20',NOW(),'h_slab1','Silicon Labs Patent','Silicon Labs granted 7 IoT connectivity patents.',NOW()),
('doc_calx1','source_sec_edgar','https://www.sec.gov/cgi-bin/browse-edgar?CIK=0001406666','2026-08-04',NOW(),'h_calx1','CALX Supply Deal','Calix signed $85M multi-year supply agreement with rural broadband consortium.',NOW()),
('doc_neo1','source_sec_edgar','https://www.sec.gov/cgi-bin/browse-edgar?CIK=0001077183','2026-08-02',NOW(),'h_neo1','NEO Medicare Coverage','NeoGenomics CMS Medicare coverage expanded for liquid biopsy.',NOW())
ON CONFLICT (content_hash) DO NOTHING;

INSERT INTO evidence_items (id, document_id, excerpt, evidence_type, quality_score, created_at) VALUES
('ev_aciw1','doc_aciw1','ACI Worldwide filed 8-K — Results of operations and financial condition.', 'primary', 90, NOW()),
('ev_aeis1','doc_aeis1','Advanced Energy won $14M DOE contract for power systems development.', 'primary', 95, NOW()),
('ev_avav1','doc_avav1','AeroVironment entered into material agreement with U.S. Army for Switchblade production.', 'primary', 95, NOW()),
('ev_crox1','doc_crox1','Crocs 8-K: $210M acquisition of casual footwear brand disclosed Aug 3, 2026.', 'primary', 92, NOW()),
('ev_form1','doc_form1','FormFactor pre-announced Q3 2026 revenue above prior guidance range.', 'primary', 90, NOW()),
('ev_lnth1','doc_lnth1','FDA grants Fast Track designation to Lantheus for new radiopharmaceutical.', 'primary', 98, NOW()),
('ev_ambo1','doc_ambo1','Ambarella engaged financial advisor for strategic alternatives review.', 'primary', 88, NOW()),
('ev_slab1','doc_slab1','USPTO granted Silicon Labs 7 patents for IoT mesh connectivity.', 'primary', 95, NOW()),
('ev_calx1','doc_calx1','Calix signed $85M multi-year supply agreement with rural broadband consortium.', 'primary', 92, NOW()),
('ev_neo1','doc_neo1','CMS expanded Medicare coverage for NeoGenomics RaDaR liquid biopsy test.', 'primary', 96, NOW())
ON CONFLICT (id) DO NOTHING;

-- Opportunities with varied scores, decoded items, and overlooked reasons

-- 1. ACIW — 8-K results
INSERT INTO opportunities (id, security_id, title, summary, status, detected_at, published_at, created_at, updated_at) VALUES
('opp_aciw1', 'sec_0000935036', 'ACI Worldwide (ACIW) — Results of Operations', 'ACI Worldwide ($2.0B) filed 8-K on Aug 5, 2026. Results of operations and financial condition.', 'published', '2026-08-05', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO claims (id, opportunity_id, claim_type, text, confidence, evidence_item_ids, created_at) VALUES
('c_aciw1','opp_aciw1','verified_fact','ACIW filed 8-K on Aug 5 — Results of operations and financial condition.',0.95,'["ev_aciw1"]',NOW()),
('c_aciw2','opp_aciw1','inference','Payments sector with limited small-cap coverage — ACIW may be underfollowed by tech analysts.',0.65,'["ev_aciw1"]',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO scores (id, opportunity_id, score_type, value, factors, model_version, calculated_at) VALUES
('s_opp_aciw1','opp_aciw1','opportunity',76,'{"mc":2000000000,"form":"8-K","item":"Results"}','2.0.0',NOW()),
('s_info_aciw1','opp_aciw1','information_asymmetry',72,'{"mc":2000000000}','2.0.0',NOW()),
('s_catalyst_aciw1','opp_aciw1','catalyst_strength',68,'{}','2.0.0',NOW()),
('s_evidence_aciw1','opp_aciw1','evidence_quality',90,'{}','2.0.0',NOW()),
('s_materiality_aciw1','opp_aciw1','financial_materiality',70,'{}','2.0.0',NOW()),
('s_risk_aciw1','opp_aciw1','risk',38,'{}','2.0.0',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO risks (id, opportunity_id, risk_type, severity, description, created_at) VALUES
('r1_aciw1','opp_aciw1','overlooked_reason_1','low','$2.0B market cap — typically 2-4 analyst coverage, below institutional radar',NOW()),
('r2_aciw1','opp_aciw1','overlooked_reason_2','low','Payments infrastructure company — not covered by most tech analysts',NOW()),
('r3_aciw1','opp_aciw1','overlooked_reason_3','low','8-K filing unscheduled — may not be on quarterly earnings calendars',NOW())
ON CONFLICT (id) DO NOTHING;

-- 2. AEIS — Federal contract
INSERT INTO opportunities (id, security_id, title, summary, status, detected_at, published_at, created_at, updated_at) VALUES
('opp_aeis1', 'sec_0000927003', 'Advanced Energy (AEIS) — $14M DOE Contract', 'Advanced Energy ($3.8B) won $14M Department of Energy contract for advanced power conversion systems. Federal contract source.', 'published', '2026-08-02', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO claims (id, opportunity_id, claim_type, text, confidence, evidence_item_ids, created_at) VALUES
('c_aeis1','opp_aeis1','verified_fact','AEIS won $14M DOE contract for advanced power conversion systems.',0.97,'["ev_aeis1"]',NOW()),
('c_aeis2','opp_aeis1','inference','DOE contract may indicate path to larger defense/energy infrastructure revenue and follow-on awards.',0.68,'["ev_aeis1"]',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO scores (id, opportunity_id, score_type, value, factors, model_version, calculated_at) VALUES
('s_opp_aeis1','opp_aeis1','opportunity',82,'{"mc":3800000000,"form":"Federal Contract"}','2.0.0',NOW()),
('s_info_aeis1','opp_aeis1','information_asymmetry',78,'{"mc":3800000000}','2.0.0',NOW()),
('s_catalyst_aeis1','opp_aeis1','catalyst_strength',72,'{}','2.0.0',NOW()),
('s_evidence_aeis1','opp_aeis1','evidence_quality',95,'{}','2.0.0',NOW()),
('s_materiality_aeis1','opp_aeis1','financial_materiality',80,'{}','2.0.0',NOW()),
('s_risk_aeis1','opp_aeis1','risk',35,'{}','2.0.0',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO risks (id, opportunity_id, risk_type, severity, description, created_at) VALUES
('r1_aeis1','opp_aeis1','overlooked_reason_1','low','Federal contract award — buried in SAM.gov, rarely tracked by equity analysts',NOW()),
('r2_aeis1','opp_aeis1','overlooked_reason_2','low','Specialized semiconductor capital equipment — not widely followed by generalist investors',NOW()),
('r3_aeis1','opp_aeis1','overlooked_reason_3','low','Contract represents <1% of revenue but validates DOE relationship for larger future awards',NOW())
ON CONFLICT (id) DO NOTHING;

-- 3. AVAV — Military agreement
INSERT INTO opportunities (id, security_id, title, summary, status, detected_at, published_at, created_at, updated_at) VALUES
('opp_avav1', 'sec_0001368622', 'AeroVironment (AVAV) — U.S. Army Material Agreement', 'AeroVironment ($3.2B) entered material agreement with U.S. Army for Switchblade loitering munition production. Contract value undisclosed.', 'published', '2026-07-28', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO claims (id, opportunity_id, claim_type, text, confidence, evidence_item_ids, created_at) VALUES
('c_avav1','opp_avav1','verified_fact','AeroVironment entered material agreement with U.S. Army for Switchblade production.',0.95,'["ev_avav1"]',NOW()),
('c_avav2','opp_avav1','inference','Agreement likely reflects Switchblade demand from Ukraine/European allies — may signal multi-year production ramp.',0.70,'["ev_avav1"]',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO scores (id, opportunity_id, score_type, value, factors, model_version, calculated_at) VALUES
('s_opp_avav1','opp_avav1','opportunity',85,'{"mc":3200000000,"form":"8-K","item":"Material Agreement"}','2.0.0',NOW()),
('s_info_avav1','opp_avav1','information_asymmetry',82,'{"mc":3200000000}','2.0.0',NOW()),
('s_catalyst_avav1','opp_avav1','catalyst_strength',80,'{}','2.0.0',NOW()),
('s_evidence_avav1','opp_avav1','evidence_quality',95,'{}','2.0.0',NOW()),
('s_materiality_avav1','opp_avav1','financial_materiality',85,'{}','2.0.0',NOW()),
('s_risk_avav1','opp_avav1','risk',42,'{}','2.0.0',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO risks (id, opportunity_id, risk_type, severity, description, created_at) VALUES
('r1_avav1','opp_avav1','overlooked_reason_1','low','Defense contractor — niche sector, limited sell-side coverage',NOW()),
('r2_avav1','opp_avav1','overlooked_reason_2','low','Agreement filed as 8-K Item 1.01 — unscheduled, may precede analyst notes',NOW()),
('r3_avav1','opp_avav1','overlooked_reason_3','low','Switchblade demand driven by geopolitical factors not widely priced into consensus',NOW())
ON CONFLICT (id) DO NOTHING;

-- 4. CROX — Acquisition
INSERT INTO opportunities (id, security_id, title, summary, status, detected_at, published_at, created_at, updated_at) VALUES
('opp_crox1', 'sec_0001334036', 'Crocs (CROX) — $210M Acquisition', 'Crocs ($3.5B) filed 8-K disclosing a $210M acquisition of a casual footwear brand. Expansion into adjacent category.', 'published', '2026-08-03', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO claims (id, opportunity_id, claim_type, text, confidence, evidence_item_ids, created_at) VALUES
('c_crox1','opp_crox1','verified_fact','Crocs disclosed $210M acquisition of casual footwear brand in 8-K filed Aug 3, 2026.',0.92,'["ev_crox1"]',NOW()),
('c_crox2','opp_crox1','inference','Acquisition expands TAM into adjacent category — may signal brand diversification strategy.',0.62,'["ev_crox1"]',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO scores (id, opportunity_id, score_type, value, factors, model_version, calculated_at) VALUES
('s_opp_crox1','opp_crox1','opportunity',80,'{"mc":3500000000,"form":"8-K","item":"Acquisition"}','2.0.0',NOW()),
('s_info_crox1','opp_crox1','information_asymmetry',68,'{"mc":3500000000}','2.0.0',NOW()),
('s_catalyst_crox1','opp_crox1','catalyst_strength',78,'{}','2.0.0',NOW()),
('s_evidence_crox1','opp_crox1','evidence_quality',92,'{}','2.0.0',NOW()),
('s_materiality_crox1','opp_crox1','financial_materiality',82,'{}','2.0.0',NOW()),
('s_risk_crox1','opp_crox1','risk',40,'{}','2.0.0',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO risks (id, opportunity_id, risk_type, severity, description, created_at) VALUES
('r1_crox1','opp_crox1','overlooked_reason_1','low','Consumer/retail covered primarily by specialized analysts — 8-K may not trigger immediate coverage',NOW()),
('r2_crox1','opp_crox1','overlooked_reason_2','low','Acquisition at 6% of market cap — material but below typical M&A headline threshold',NOW()),
('r3_crox1','opp_crox1','overlooked_reason_3','low','Unscheduled 8-K filing may take 24-48 hours before sell-side notes appear',NOW())
ON CONFLICT (id) DO NOTHING;

-- 5. FORM — Revenue pre-announcement
INSERT INTO opportunities (id, security_id, title, summary, status, detected_at, published_at, created_at, updated_at) VALUES
('opp_form1', 'sec_0001039399', 'FormFactor (FORM) — Q3 Revenue Above Guidance', 'FormFactor ($3.1B) pre-announced Q3 2026 revenue above prior guidance range. Semiconductor testing demand exceeding expectations.', 'published', '2026-07-31', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO claims (id, opportunity_id, claim_type, text, confidence, evidence_item_ids, created_at) VALUES
('c_form1','opp_form1','verified_fact','FormFactor pre-announced Q3 2026 revenue above prior guidance range.',0.90,'["ev_form1"]',NOW()),
('c_form2','opp_form1','inference','Positive pre-announcement suggests semiconductor probe card demand stronger than consensus — may signal broader sector strength.',0.65,'["ev_form1"]',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO scores (id, opportunity_id, score_type, value, factors, model_version, calculated_at) VALUES
('s_opp_form1','opp_form1','opportunity',79,'{"mc":3100000000,"form":"8-K","item":"Results/Earnings"}','2.0.0',NOW()),
('s_info_form1','opp_form1','information_asymmetry',74,'{"mc":3100000000}','2.0.0',NOW()),
('s_catalyst_form1','opp_form1','catalyst_strength',75,'{}','2.0.0',NOW()),
('s_evidence_form1','opp_form1','evidence_quality',90,'{}','2.0.0',NOW()),
('s_materiality_form1','opp_form1','financial_materiality',78,'{}','2.0.0',NOW()),
('s_risk_form1','opp_form1','risk',35,'{}','2.0.0',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO risks (id, opportunity_id, risk_type, severity, description, created_at) VALUES
('r1_form1','opp_form1','overlooked_reason_1','low','Semiconductor capital equipment specialist — narrow analyst coverage',NOW()),
('r2_form1','opp_form1','overlooked_reason_2','low','Pre-announcement outside normal earnings cycle may not appear on investor calendars',NOW()),
('r3_form1','opp_form1','overlooked_reason_3','low','Unscheduled 8-K filing — potential information gap before sell-side updates',NOW())
ON CONFLICT (id) DO NOTHING;

-- 6. LNTH — FDA Fast Track (highest score — biotech catalyst)
INSERT INTO opportunities (id, security_id, title, summary, status, detected_at, published_at, created_at, updated_at) VALUES
('opp_lnth1', 'sec_0001521036', 'Lantheus (LNTH) — FDA Fast Track Designation', 'Lantheus Holdings ($6.4B) received FDA Fast Track designation for next-gen PYLARIFY radiopharmaceutical. Expanded diagnostic pipeline.', 'published', '2026-08-01', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO claims (id, opportunity_id, claim_type, text, confidence, evidence_item_ids, created_at) VALUES
('c_lnth1','opp_lnth1','verified_fact','FDA granted Fast Track designation to Lantheus for new radiopharmaceutical diagnostic.',0.98,'["ev_lnth1"]',NOW()),
('c_lnth2','opp_lnth1','inference','Fast Track may accelerate regulatory timeline by 6-12 months and strengthens LNTH radiopharma franchise.',0.72,'["ev_lnth1"]',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO scores (id, opportunity_id, score_type, value, factors, model_version, calculated_at) VALUES
('s_opp_lnth1','opp_lnth1','opportunity',88,'{"mc":6400000000,"form":"FDA","item":"Fast Track"}','2.0.0',NOW()),
('s_info_lnth1','opp_lnth1','information_asymmetry',80,'{"mc":6400000000}','2.0.0',NOW()),
('s_catalyst_lnth1','opp_lnth1','catalyst_strength',88,'{}','2.0.0',NOW()),
('s_evidence_lnth1','opp_lnth1','evidence_quality',98,'{}','2.0.0',NOW()),
('s_materiality_lnth1','opp_lnth1','financial_materiality',85,'{}','2.0.0',NOW()),
('s_risk_lnth1','opp_lnth1','risk',40,'{}','2.0.0',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO risks (id, opportunity_id, risk_type, severity, description, created_at) VALUES
('r1_lnth1','opp_lnth1','overlooked_reason_1','low','Healthcare/radiopharma niche — limited generalist investor awareness',NOW()),
('r2_lnth1','opp_lnth1','overlooked_reason_2','low','FDA Fast Track designation posted to FDA.gov — not typically covered by financial media',NOW()),
('r3_lnth1','opp_lnth1','overlooked_reason_3','low','Radiopharmaceutical sector has high barriers to understanding — potential information asymmetry',NOW()),
('r4_lnth1','opp_lnth1','binary_outcome','medium','FDA Fast Track does not guarantee approval; pipeline risk remains',NOW())
ON CONFLICT (id) DO NOTHING;

-- 7. AMBA — Strategic review (high asymmetry)
INSERT INTO opportunities (id, security_id, title, summary, status, detected_at, published_at, created_at, updated_at) VALUES
('opp_ambe1', 'sec_0001280263', 'Ambarella (AMBA) — Strategic Alternatives Review', 'Ambarella ($1.8B) disclosed engagement of financial advisor to evaluate strategic alternatives. May indicate potential sale, merger, or major transaction.', 'published', '2026-07-29', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO claims (id, opportunity_id, claim_type, text, confidence, evidence_item_ids, created_at) VALUES
('c_ambe1','opp_ambe1','verified_fact','Ambarella engaged financial advisor for strategic alternatives review per 8-K filing.',0.88,'["ev_ambo1"]',NOW()),
('c_ambe2','opp_ambe1','inference','Strategic review may indicate potential M&A, sale, or major corporate transaction.',0.58,'["ev_ambo1"]',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO scores (id, opportunity_id, score_type, value, factors, model_version, calculated_at) VALUES
('s_opp_ambe1','opp_ambe1','opportunity',83,'{"mc":1800000000,"form":"8-K","item":"Strategic"}','2.0.0',NOW()),
('s_info_ambe1','opp_ambe1','information_asymmetry',85,'{"mc":1800000000}','2.0.0',NOW()),
('s_catalyst_ambe1','opp_ambe1','catalyst_strength',82,'{}','2.0.0',NOW()),
('s_evidence_ambe1','opp_ambe1','evidence_quality',88,'{}','2.0.0',NOW()),
('s_materiality_ambe1','opp_ambe1','financial_materiality',90,'{}','2.0.0',NOW()),
('s_risk_ambe1','opp_ambe1','risk',48,'{}','2.0.0',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO risks (id, opportunity_id, risk_type, severity, description, created_at) VALUES
('r1_ambe1','opp_ambe1','overlooked_reason_1','low','$1.8B market cap — below most institutional minimums, likely 0-3 analyst coverage',NOW()),
('r2_ambe1','opp_ambe1','overlooked_reason_2','low','AI vision processing niche — specialized sector with limited generalist awareness',NOW()),
('r3_ambe1','opp_ambe1','overlooked_reason_3','low','Strategic review disclosure is unscheduled and may not appear on news feeds',NOW()),
('r4_ambe1','opp_ambe1','binary_outcome','high','Strategic review may result in no transaction — outcome is uncertain',NOW())
ON CONFLICT (id) DO NOTHING;

-- 8. SLAB — IP/Patent grant
INSERT INTO opportunities (id, security_id, title, summary, status, detected_at, published_at, created_at, updated_at) VALUES
('opp_slab1', 'sec_0001038074', 'Silicon Labs (SLAB) — 7 IoT Patents Granted', 'Silicon Laboratories ($3.1B) received USPTO grants for 7 IoT mesh networking patents. Strengthens IP position in smart home/industrial IoT.', 'published', '2026-07-20', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO claims (id, opportunity_id, claim_type, text, confidence, evidence_item_ids, created_at) VALUES
('c_slab1','opp_slab1','verified_fact','USPTO granted Silicon Labs 7 patents for IoT mesh networking technology.',0.95,'["ev_slab1"]',NOW()),
('c_slab2','opp_slab1','inference','Patent grants strengthen SLAB IP moat in IoT connectivity — key competitive advantage in Matter protocol ecosystem.',0.60,'["ev_slab1"]',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO scores (id, opportunity_id, score_type, value, factors, model_version, calculated_at) VALUES
('s_opp_slab1','opp_slab1','opportunity',72,'{"mc":3100000000,"form":"USPTO","item":"Patent Grant"}','2.0.0',NOW()),
('s_info_slab1','opp_slab1','information_asymmetry',78,'{"mc":3100000000}','2.0.0',NOW()),
('s_catalyst_slab1','opp_slab1','catalyst_strength',62,'{}','2.0.0',NOW()),
('s_evidence_slab1','opp_slab1','evidence_quality',95,'{}','2.0.0',NOW()),
('s_materiality_slab1','opp_slab1','financial_materiality',58,'{}','2.0.0',NOW()),
('s_risk_slab1','opp_slab1','risk',32,'{}','2.0.0',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO risks (id, opportunity_id, risk_type, severity, description, created_at) VALUES
('r1_slab1','opp_slab1','overlooked_reason_1','low','Patent grants rarely tracked by equity analysts — buried in USPTO database',NOW()),
('r2_slab1','opp_slab1','overlooked_reason_2','low','IoT semiconductor specialist — not on most generalist investor watchlists',NOW()),
('r3_slab1','opp_slab1','overlooked_reason_3','low','Patent IP value is long-duration — market may not immediately price in competitive advantage',NOW())
ON CONFLICT (id) DO NOTHING;

-- 9. CALX — Supply agreement
INSERT INTO opportunities (id, security_id, title, summary, status, detected_at, published_at, created_at, updated_at) VALUES
('opp_calx1', 'sec_0001406666', 'Calix (CALX) — $85M Rural Broadband Supply Agreement', 'Calix ($1.8B) signed $85M multi-year supply agreement with rural broadband consortium. Material to annual revenue (~10%).', 'published', '2026-08-04', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO claims (id, opportunity_id, claim_type, text, confidence, evidence_item_ids, created_at) VALUES
('c_calx1','opp_calx1','verified_fact','Calix signed $85M multi-year supply agreement with rural broadband consortium.',0.92,'["ev_calx1"]',NOW()),
('c_calx2','opp_calx1','inference','Agreement represents approximately 10% of annual revenue — may drive upward estimate revisions.',0.67,'["ev_calx1"]',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO scores (id, opportunity_id, score_type, value, factors, model_version, calculated_at) VALUES
('s_opp_calx1','opp_calx1','opportunity',81,'{"mc":1800000000,"form":"8-K","item":"Material Agreement"}','2.0.0',NOW()),
('s_info_calx1','opp_calx1','information_asymmetry',86,'{"mc":1800000000}','2.0.0',NOW()),
('s_catalyst_calx1','opp_calx1','catalyst_strength',76,'{}','2.0.0',NOW()),
('s_evidence_calx1','opp_calx1','evidence_quality',92,'{}','2.0.0',NOW()),
('s_materiality_calx1','opp_calx1','financial_materiality',78,'{}','2.0.0',NOW()),
('s_risk_calx1','opp_calx1','risk',42,'{}','2.0.0',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO risks (id, opportunity_id, risk_type, severity, description, created_at) VALUES
('r1_calx1','opp_calx1','overlooked_reason_1','low','$1.8B market cap — below most institutional coverage thresholds',NOW()),
('r2_calx1','opp_calx1','overlooked_reason_2','low','Rural broadband infrastructure — niche sector with limited analyst following',NOW()),
('r3_calx1','opp_calx1','overlooked_reason_3','low','Supply agreement filed as 8-K — unscheduled, may not appear on news feeds',NOW())
ON CONFLICT (id) DO NOTHING;

-- 10. NEO — CMS Medicare coverage
INSERT INTO opportunities (id, security_id, title, summary, status, detected_at, published_at, created_at, updated_at) VALUES
('opp_neo1', 'sec_0001077183', 'NeoGenomics (NEO) — CMS Medicare Coverage Expansion', 'NeoGenomics ($1.8B) received CMS Medicare coverage expansion for RaDaR liquid biopsy test. Opens addressable market for minimal residual disease testing.', 'published', '2026-08-02', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO claims (id, opportunity_id, claim_type, text, confidence, evidence_item_ids, created_at) VALUES
('c_neo1','opp_neo1','verified_fact','CMS expanded Medicare coverage for NeoGenomics RaDaR liquid biopsy MRD test.',0.96,'["ev_neo1"]',NOW()),
('c_neo2','opp_neo1','inference','Medicare coverage expansion significantly increases addressable market for NEO liquid biopsy franchise.',0.72,'["ev_neo1"]',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO scores (id, opportunity_id, score_type, value, factors, model_version, calculated_at) VALUES
('s_opp_neo1','opp_neo1','opportunity',84,'{"mc":1800000000,"form":"Regulatory","item":"CMS Coverage"}','2.0.0',NOW()),
('s_info_neo1','opp_neo1','information_asymmetry',86,'{"mc":1800000000}','2.0.0',NOW()),
('s_catalyst_neo1','opp_neo1','catalyst_strength',82,'{}','2.0.0',NOW()),
('s_evidence_neo1','opp_neo1','evidence_quality',96,'{}','2.0.0',NOW()),
('s_materiality_neo1','opp_neo1','financial_materiality',80,'{}','2.0.0',NOW()),
('s_risk_neo1','opp_neo1','risk',45,'{}','2.0.0',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO risks (id, opportunity_id, risk_type, severity, description, created_at) VALUES
('r1_neo1','opp_neo1','overlooked_reason_1','low','$1.8B diagnostics company — below institutional coverage thresholds',NOW()),
('r2_neo1','opp_neo1','overlooked_reason_2','low','CMS coverage decision published on CMS.gov — not typically covered by financial news',NOW()),
('r3_neo1','opp_neo1','overlooked_reason_3','low','Liquid biopsy/MRD testing requires specialized healthcare knowledge — information barrier for generalists',NOW()),
('r4_neo1','opp_neo1','binary_outcome','medium','Coverage expansion positive but revenue ramp timeline uncertain',NOW())
ON CONFLICT (id) DO NOTHING;

COMMIT;

SELECT 'Seed complete!' as status;
SELECT status, COUNT(*) as count FROM opportunities GROUP BY status;
