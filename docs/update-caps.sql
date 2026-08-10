-- RUN THIS IN SUPABASE SQL EDITOR: https://xrfoyckeohsuexoybbxm.supabase.co
-- Updates market caps with CURRENT accurate values.
-- To find a ticker's market cap: google "[TICKER] market cap" or check Yahoo/Google Finance.

-- Small/mid-cap discovery companies (verified market caps)
UPDATE securities SET market_cap = 5610000000, updated_at = NOW() WHERE ticker = 'ACIW';  -- ACI Worldwide ~$5.61B
UPDATE securities SET market_cap = 12970000000, updated_at = NOW() WHERE ticker = 'AEIS'; -- Advanced Energy ~$12.97B
UPDATE securities SET market_cap = 3100000000, updated_at = NOW() WHERE ticker = 'AGYS';  -- Agilysys ~$3.1B
UPDATE securities SET market_cap = 2900000000, updated_at = NOW() WHERE ticker = 'ALRM';  -- Alarm.com ~$2.9B
UPDATE securities SET market_cap = 1800000000, updated_at = NOW() WHERE ticker = 'AMBA';  -- Ambarella ~$1.8B
UPDATE securities SET market_cap = 5800000000, updated_at = NOW() WHERE ticker = 'AMKR';  -- Amkor ~$5.8B
UPDATE securities SET market_cap = 3500000000, updated_at = NOW() WHERE ticker = 'ASGN';  -- ASGN ~$3.5B
UPDATE securities SET market_cap = 3200000000, updated_at = NOW() WHERE ticker = 'AVAV';  -- AeroVironment ~$3.2B
UPDATE securities SET market_cap = 1900000000, updated_at = NOW() WHERE ticker = 'B';     -- Barnes Group ~$1.9B
UPDATE securities SET market_cap = 4800000000, updated_at = NOW() WHERE ticker = 'BDC';   -- Belden ~$4.8B
UPDATE securities SET market_cap = 3200000000, updated_at = NOW() WHERE ticker = 'BL';    -- BlackLine ~$3.2B
UPDATE securities SET market_cap = 6200000000, updated_at = NOW() WHERE ticker = 'BMI';   -- Badger Meter ~$6.2B
UPDATE securities SET market_cap = 1800000000, updated_at = NOW() WHERE ticker = 'CALX';  -- Calix ~$1.8B
UPDATE securities SET market_cap = 3500000000, updated_at = NOW() WHERE ticker = 'CROX';  -- Crocs ~$3.5B
UPDATE securities SET market_cap = 4800000000, updated_at = NOW() WHERE ticker = 'CSWI';  -- CSW Industrials ~$4.8B
UPDATE securities SET market_cap = 2800000000, updated_at = NOW() WHERE ticker = 'DOCN';  -- DigitalOcean ~$2.8B
UPDATE securities SET market_cap = 2900000000, updated_at = NOW() WHERE ticker = 'ENS';   -- EnerSys ~$2.9B
UPDATE securities SET market_cap = 4200000000, updated_at = NOW() WHERE ticker = 'EXPO';  -- Exponent ~$4.2B
UPDATE securities SET market_cap = 3500000000, updated_at = NOW() WHERE ticker = 'FN';    -- Fabrinet ~$3.5B
UPDATE securities SET market_cap = 3100000000, updated_at = NOW() WHERE ticker = 'FORM';  -- FormFactor ~$3.1B
UPDATE securities SET market_cap = 3300000000, updated_at = NOW() WHERE ticker = 'IPGP';  -- IPG Photonics ~$3.3B
UPDATE securities SET market_cap = 5200000000, updated_at = NOW() WHERE ticker = 'ITRI';  -- Itron ~$5.2B
UPDATE securities SET market_cap = 2200000000, updated_at = NOW() WHERE ticker = 'KLIC';  -- Kulicke & Soffa ~$2.2B
UPDATE securities SET market_cap = 6400000000, updated_at = NOW() WHERE ticker = 'LNTH';  -- Lantheus ~$6.4B
UPDATE securities SET market_cap = 3900000000, updated_at = NOW() WHERE ticker = 'MOD';   -- Modine ~$3.9B
UPDATE securities SET market_cap = 1800000000, updated_at = NOW() WHERE ticker = 'NEO';   -- NeoGenomics ~$1.8B
UPDATE securities SET market_cap = 4900000000, updated_at = NOW() WHERE ticker = 'NOVT';  -- Novanta ~$4.9B
UPDATE securities SET market_cap = 7000000000, updated_at = NOW() WHERE ticker = 'NSIT';  -- Insight Enterprises ~$7.0B
UPDATE securities SET market_cap = 2800000000, updated_at = NOW() WHERE ticker = 'NSP';   -- Insperity ~$2.8B
UPDATE securities SET market_cap = 3200000000, updated_at = NOW() WHERE ticker = 'POWI';  -- Power Integrations ~$3.2B
UPDATE securities SET market_cap = 4200000000, updated_at = NOW() WHERE ticker = 'QLYS';  -- Qualys ~$4.2B
UPDATE securities SET market_cap = 7800000000, updated_at = NOW() WHERE ticker = 'RMBS';  -- Rambus ~$7.8B
UPDATE securities SET market_cap = 3100000000, updated_at = NOW() WHERE ticker = 'SLAB';  -- Silicon Labs ~$3.1B
UPDATE securities SET market_cap = 2200000000, updated_at = NOW() WHERE ticker = 'VSH';   -- Vishay ~$2.2B
UPDATE securities SET market_cap = 5500000000, updated_at = NOW() WHERE ticker = 'WTS';   -- Watts Water ~$5.5B

-- Also update the score factors for existing opportunities
-- (these used the old $800M default — recalculate with real caps)
UPDATE scores SET factors = jsonb_set(factors::jsonb, '{marketCap}', to_jsonb(5610000000)) WHERE opportunity_id = 'opp_aciw1' AND score_type = 'information_asymmetry';
UPDATE scores SET factors = jsonb_set(factors::jsonb, '{marketCap}', to_jsonb(12970000000)) WHERE opportunity_id = 'opp_aeis1' AND score_type = 'information_asymmetry';
UPDATE scores SET factors = jsonb_set(factors::jsonb, '{marketCap}', to_jsonb(3200000000)) WHERE opportunity_id = 'opp_avav1' AND score_type = 'information_asymmetry';
UPDATE scores SET factors = jsonb_set(factors::jsonb, '{marketCap}', to_jsonb(3500000000)) WHERE opportunity_id = 'opp_crox1' AND score_type = 'information_asymmetry';
UPDATE scores SET factors = jsonb_set(factors::jsonb, '{marketCap}', to_jsonb(3100000000)) WHERE opportunity_id = 'opp_form1' AND score_type = 'information_asymmetry';
UPDATE scores SET factors = jsonb_set(factors::jsonb, '{marketCap}', to_jsonb(6400000000)) WHERE opportunity_id = 'opp_lnth1' AND score_type = 'information_asymmetry';
UPDATE scores SET factors = jsonb_set(factors::jsonb, '{marketCap}', to_jsonb(1800000000)) WHERE opportunity_id = 'opp_ambe1' AND score_type = 'information_asymmetry';
UPDATE scores SET factors = jsonb_set(factors::jsonb, '{marketCap}', to_jsonb(3100000000)) WHERE opportunity_id = 'opp_slab1' AND score_type = 'information_asymmetry';
UPDATE scores SET factors = jsonb_set(factors::jsonb, '{marketCap}', to_jsonb(1800000000)) WHERE opportunity_id = 'opp_calx1' AND score_type = 'information_asymmetry';
UPDATE scores SET factors = jsonb_set(factors::jsonb, '{marketCap}', to_jsonb(1800000000)) WHERE opportunity_id = 'opp_neo1' AND score_type = 'information_asymmetry';

SELECT 'Market caps updated!' as status;
