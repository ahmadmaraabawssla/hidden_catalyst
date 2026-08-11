/**
 * Daily Discovery Engine — Budget-based continuous discovery
 * 
 * Scans up to MAX_SCAN companies for recent filings, runs deep research
 * on promising ones, and stops when TARGET_CANDIDATES qualified opportunities
 * are found — or the scan budget is exhausted.
 * 
 * Rejected items are stored for audit but do NOT consume the output quota.
 * The engine keeps searching until it finds enough genuine candidates.
 * 
 * Configuration:
 *   TARGET_CANDIDATES = 20  (how many qualified items to find)
 *   MAX_SCAN = 500          (max companies to screen)
 *   MAX_DEEP_RESEARCH = 100 (max LLM calls per run)
 *   LOOKBACK_DAYS = 7       (how recent filings must be)
 * 
 * Run: node scripts/daily-top20.js
 */

const { Client } = require('pg');
const { setApiKey, extractFromFiling } = require('../packages/engine/src/llm-extractor');
const { measureAttention } = require('../packages/engine/src/catalyst-attention');
const { resolveDefinedTerms } = require('../packages/engine/src/cdr');

// ALL secrets from environment variables ONLY
const DB = process.env.DATABASE_URL;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const UA = process.env.SEC_USER_AGENT || 'Hidden Catalyst (contact@hiddencatalyst.com)';

if (!DB) { console.error('DATABASE_URL environment variable required'); process.exit(1); }
if (!DEEPSEEK_KEY) { console.error('DEEPSEEK_API_KEY environment variable required'); process.exit(1); }

// Budget-based discovery config (overridable via env for admin runs)
const RUN_ID = process.env.RUN_ID || ('run_' + Date.now());
const TARGET_CANDIDATES = parseInt(process.env.TARGET_CANDIDATES || '20');
const MAX_SCAN = parseInt(process.env.MAX_SCAN || '500');
const MAX_DEEP_RESEARCH = parseInt(process.env.MAX_DEEP_RESEARCH || '100');
const LOOKBACK_DAYS = 7;
const ENGINE_VERSION = 'v3';

setApiKey(DEEPSEEK_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MATERIAL_FORMS = ['8-K', '10-Q', '10-K', 'S-1', '13D', '13G'];
const SKIP_FORMS = new Set(['3','4','5','3/A','4/A','144','N-PX','NPORT-P','N-CSR','N-CSRS','6-K','ARS','CERT','25','8-A12B','PX14A6G','S-8','424B2','FWP','25-NSE','SD']);

// ─── Pre-LLM Candidate Scoring ───
function preScore(company, formType, filingDate) {
  const mc = company.mc || 800000000;
  const daysAgo = (Date.now() - new Date(filingDate).getTime()) / (86400000);

  // 1. Market cap bonus: smaller = more interesting for discovery
  let mcScore = 0;
  if (mc < 200e6) mcScore = 30;
  else if (mc < 500e6) mcScore = 25;
  else if (mc < 1e9) mcScore = 22;
  else if (mc < 2e9) mcScore = 18;
  else if (mc < 5e9) mcScore = 15;
  else if (mc < 10e9) mcScore = 10;
  else mcScore = 5;

  // 2. Form type bonus: 8-K (unscheduled, material) beats scheduled reports
  const formScores = { '8-K': 30, 'S-1': 28, '13D': 25, '13G': 20, '10-Q': 15, '10-K': 12 };
  const formScore = formScores[formType] || 10;

  // 3. Recency bonus: fresher = better (max 7 days)
  const recencyScore = Math.max(0, 20 - daysAgo * 3);

  // 4. Source diversity bonus: companies not already in the batch
  const diversityScore = 10; // Calculated during selection

  // 5. Penalty: companies already processed by AI
  const alreadyProcessed = company.aiProcessed ? -50 : 0;

  return mcScore + formScore + recencyScore + alreadyProcessed;
}

function extractAmounts(text) {
  var out = [];
  var re = /\$\s?(\d+(?:\.\d+)?)\s?(million|billion|m|b)?/ig;
  var m;
  while ((m = re.exec(text || '')) && out.length < 10) {
    var n = Number(m[1]);
    var unit = (m[2] || '').toLowerCase();
    if (unit === 'billion' || unit === 'b') n *= 1e9;
    else if (unit === 'million' || unit === 'm') n *= 1e6;
    out.push({ value: n, currency: 'USD', label: m[0], confidence: 0.75 });
  }
  return out;
}

function pricedInScore(priceReactionPct, volumeReactionRatio, fallback) {
  if (priceReactionPct == null) return fallback;
  var abs = Math.abs(priceReactionPct);
  var score = abs < 0.5 ? 95 : abs < 1 ? 88 : abs < 2 ? 75 : abs < 3 ? 60 : abs < 5 ? 40 : 20;
  if (volumeReactionRatio != null && volumeReactionRatio > 3) score -= 5;
  return Math.max(5, Math.min(100, Math.round(score)));
}

async function storeSignalAndCluster(client, co, extraction, hash, evidenceQual, priorityScore) {
  try {
    await client.query(
      `INSERT INTO signals(id,source_id,document_id,source_type,external_id,published_at,retrieved_at,title,raw_text,entities,event_type,amounts,dates,locations,source_url,source_quality,raw_metadata,triage_score,triage_factors,triaged_at,created_at)
       VALUES($1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())
       ON CONFLICT(source_id, external_id) DO UPDATE SET triage_score=EXCLUDED.triage_score, triage_factors=EXCLUDED.triage_factors, triaged_at=NOW()`,
      [
        'sig_' + hash,
        'source_sec_edgar',
        'd_' + hash,
        'sec_filing',
        co.accessionNumber,
        co.filingDate,
        extraction?.insightTitle || `${co.ticker}: ${co.formType}`,
        extraction?.eventSummary || extraction?.whyItMatters || '',
        JSON.stringify([{ name: co.display_name, type: 'company', identifiers: { cik: String(co.cik), ticker: co.ticker }, confidence: 1 }]),
        extraction?.eventType || co.formType,
        JSON.stringify(extractAmounts(JSON.stringify(extraction || {}))),
        JSON.stringify([{ value: co.filingDate, label: 'filing_date', confidence: 1 }]),
        JSON.stringify([]),
        `https://www.sec.gov/cgi-bin/browse-edgar?CIK=${co.cik}`,
        evidenceQual,
        JSON.stringify({ formType: co.formType, accessionNumber: co.accessionNumber, runId: RUN_ID }),
        priorityScore,
        JSON.stringify({ preScore: co.preScore, marketCap: co.mc, formType: co.formType })
      ]
    );

    await client.query(
      `INSERT INTO catalyst_clusters(id,title,thesis,cluster_type,status,materiality_json,attention_json,adversarial_json,research_questions,research_completeness,research_confidence,priority_score,priority_factors,first_seen_at,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
       ON CONFLICT(id) DO NOTHING`,
      [
        'cl_' + hash,
        extraction?.insightTitle || `${co.ticker}: ${co.formType} catalyst`,
        extraction?.hiddenAngle?.claim || null,
        extraction?.eventType || co.formType,
        extraction?.verificationStatus === 'verified' ? 'qualified' : 'triaged',
        JSON.stringify(extraction?.financialMateriality || {}),
        JSON.stringify({ catalystAttentionScore: extraction?.catalystAttentionScore || null }),
        JSON.stringify({ contradictions: extraction?.contradictions || [], missingInfo: extraction?.missingInfo || [] }),
        JSON.stringify([
          'What exactly changed in the public record?',
          'Which listed companies are economically exposed?',
          'How direct is the relationship?',
          'What is the measurable financial magnitude?',
          'Has attention or price already reacted?',
          'What evidence weakens this thesis?'
        ]),
        Math.round((extraction?.verificationConfidence || 0.7) * 100),
        Math.round((extraction?.verificationConfidence || 0.7) * 100),
        priorityScore,
        JSON.stringify({ preScore: co.preScore, pipeline: 'daily-top20-v4' }),
        co.filingDate
      ]
    );

    await client.query(
      `INSERT INTO catalyst_cluster_signals(id,cluster_id,signal_id,role,confidence,created_at)
       VALUES($1,$2,$3,'primary',1,NOW()) ON CONFLICT(cluster_id, signal_id) DO NOTHING`,
      ['cls_' + hash, 'cl_' + hash, 'sig_' + hash]
    );
  } catch (e) {
    console.log(`  ⚠ ${co.ticker}: signal/cluster write skipped — ${(e.message || '').slice(0, 80)}`);
  }
}

// ─── Main Pipeline ───
async function main() {
  const client = new Client({ connectionString: DB });
  await client.connect();
  console.log('═══ Discovery Engine ' + ENGINE_VERSION + ' (Budget-Based) ═══');
  console.log('  Target candidates: ' + TARGET_CANDIDATES + ' | Max scan: ' + MAX_SCAN + ' | Max deep research: ' + MAX_DEEP_RESEARCH + ' | Lookback: ' + LOOKBACK_DAYS + 'd\n');

  // Find candidates — prioritize smaller caps
  const candidates = await client.query(`
    SELECT c.id, c.cik, c.display_name, s.ticker, s.id as sec_id,
           COALESCE(NULLIF(s.market_cap, 0), 800000000) as mc, c.sector
    FROM companies c
    JOIN securities s ON s.company_id = c.id
    WHERE c.cik IS NOT NULL
      AND s.active = true
      AND s.exchange IN ('NYSE', 'NASDAQ', 'NYSE American')
      AND (s.market_cap IS NULL OR s.market_cap > 10000)
    ORDER BY s.market_cap ASC NULLS FIRST
    LIMIT $1
  `, [MAX_SCAN]);

  var funnelScreened = candidates.rows.length;
  console.log('Screening ' + funnelScreened + ' companies for recent filings...\n');

  // Phase 1: Pre-screen
  var scored = [];
  for (const co of candidates.rows) {
    const cik = String(co.cik).padStart(10, '0');
    try {
      const res = await fetch('https://data.sec.gov/submissions/CIK' + cik + '.json', {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const f = data.filings?.recent;
      if (!f?.form) continue;

      for (let i = 0; i < Math.min(10, f.form.length); i++) {
        const fm = (f.form[i] || '').toUpperCase();
        if (!MATERIAL_FORMS.includes(fm.replace(/\/A$/, ''))) continue;
        if (SKIP_FORMS.has(fm)) continue;
        const dt = f.filingDate[i] || '';
        if (!dt) continue;
        const daysAgo = (Date.now() - new Date(dt).getTime()) / 86400000;
        if (daysAgo > LOOKBACK_DAYS) continue;

        scored.push({
          ...co, formType: fm.replace(/\/A$/, ''), filingDate: dt,
          accessionNumber: f.accessionNumber[i],
          preScore: preScore(co, fm.replace(/\/A$/, ''), dt),
        });
        break;
      }
      await sleep(40);
    } catch {}
  }

  scored.sort((a, b) => b.preScore - a.preScore);
  var funnelFilingCandidates = scored.length;

  console.log('Screened: ' + funnelScreened + ' → with filings: ' + funnelFilingCandidates);
  console.log('Deep research (max ' + MAX_DEEP_RESEARCH + ' calls, stop at ' + TARGET_CANDIDATES + ' qualified)...\n');

  // Phase 2: Deep research — budget-based
  var deepResearched = 0, qualified = 0, rejected = 0, watched = 0, published = 0;

  for (var idx = 0; idx < Math.min(scored.length, MAX_DEEP_RESEARCH); idx++) {
    if (qualified >= TARGET_CANDIDATES) {
      console.log('\n  ✓ Target ' + TARGET_CANDIDATES + ' reached. Stopping.');
      break;
    }

    var co = scored[idx];
    console.log('  [' + (idx + 1) + '/' + Math.min(scored.length, MAX_DEEP_RESEARCH) + '] ' + co.ticker + ' (' + co.display_name.slice(0, 25) + ') — ' + co.formType + ' — pre-score: ' + co.preScore);

    // Download filing text
    let filingText = '';
    try {
      const cik = String(co.cik).padStart(10, '0');
      const accNoDash = co.accessionNumber.replace(/-/g, '');
      const txtUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDash}/${co.accessionNumber}.txt`;
      const txtRes = await fetch(txtUrl, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000)
      });
      if (txtRes.ok) {
        filingText = await txtRes.text();
        const ts = filingText.indexOf('<TEXT>');
        filingText = ts > 0 ? filingText.slice(ts + 6) : filingText.slice(0, 12000);
        filingText = filingText.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 10000);
      }
    } catch {}

    // ── Build company context: recent filing history for the LLM ──
    let companyContext = '';
    try {
      const cik = String(co.cik).padStart(10, '0');
      const subRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000)
      });
      if (subRes.ok) {
        const subData = await subRes.json();
        const recent = subData.filings?.recent;
        if (recent?.form) {
          var ctxParts = [];
          for (var ci = 0; ci < Math.min(8, recent.form.length); ci++) {
            var cf = (recent.form[ci] || '').toUpperCase().replace(/\/A$/, '');
            var cd = recent.filingDate[ci] || '';
            if (cf && cd) ctxParts.push(cf + ' on ' + cd);
          }
          companyContext = 'Last 8 filings: ' + ctxParts.join(', ') + '.';
          // Check for merger/financing keywords
          if (companyContext.match(/8-K.*8-K.*8-K/i) && companyContext.match(/acquisition|merger|financing|offering|equity|ELOC|warrant/i)) {
            companyContext += ' NOTE: Recent multiple 8-Ks suggest active corporate events (merger, financing, etc). Exercise caution with share count and market cap calculations.';
          }

          // ── Cross-Document Resolution: if filing references prior agreements ──
          if (filingText.length > 200 && filingText.match(/purchase\s+agreement|defined\s+in\s+the|amends\s+the|as\s+defined|referenced\s+in/i)) {
            try {
              console.log(`  [CDR] Running cross-document resolution for ${co.ticker}...`);
              const cdrResult = await resolveDefinedTerms(filingText, cik);
              if (cdrResult.context) {
                companyContext += '\n\nCROSS-DOCUMENT RESOLVED TERMS:\n' + cdrResult.context.slice(0, 1500);
                console.log(`  [CDR] ${co.ticker}: resolved ${Object.keys(cdrResult.terms).length} terms: ${JSON.stringify(cdrResult.terms).slice(0, 150)}`);
              }
            } catch (cdrErr) { /* CDR is best-effort */ }
          }
        }
      }
    } catch {}

    var extraction = null;
    if (filingText.length > 200) {
      extraction = await extractFromFiling(filingText, co.display_name, co.ticker, co.formType, co.sector, companyContext);
      deepResearched++;
      await sleep(2000);
    }

    // ── V3 QUALIFICATION GATE ──
    if (!extraction || !extraction.qualified) {
      var reason = extraction?.isRoutine ? 'routine_filing' : 'no_hidden_angle';
      const verStatus = extraction?.isRoutine ? 'rejected' : 'watch';
      if (verStatus === 'rejected') rejected++;
      else watched++;
      const hiddenAngle = extraction?.hiddenAngle || null;

      // Store as rejected/watch for audit trail
      const hash = 'dly_' + co.cik + '_' + co.accessionNumber.replace(/-/g, '').slice(0, 14);
      const lifecycleStatus = verStatus === 'watch' ? 'published' : 'rejected';
      const title = extraction
        ? `[${verStatus.toUpperCase()}] ${co.display_name} (${co.ticker}) — ${co.formType}`
        : `${co.display_name} (${co.ticker}) — ${co.formType} (skipped)`;

      try {
        await client.query(
          `INSERT INTO opportunities(id,security_id,title,summary,status,verification_status,hidden_angle,detected_at,engine_version,run_id,last_researched_at,created_at,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,'` + ENGINE_VERSION + `','` + RUN_ID + `',NOW(),NOW(),NOW()) ON CONFLICT(id) DO NOTHING`,
          ['o_' + hash, co.sec_id, title,
           `[${verStatus.toUpperCase()}: ${reason}] ${co.display_name} filed ${co.formType} on ${co.filingDate}.`,
           lifecycleStatus,
           verStatus,
           hiddenAngle ? JSON.stringify(hiddenAngle) : null,
           co.filingDate]
        );
      } catch (e) { console.log(`  ⚠ ${co.ticker}: rejected-insert error — ${(e.message||'').slice(0,60)}`); }

      if (verStatus === 'rejected') {
        console.log(`  ❌ ${co.ticker}: REJECTED (${reason})`);
      } else {
        console.log(`  👁 ${co.ticker}: WATCH (${reason}) — stored for review`);
      }
      continue; // Skip to next company — do NOT publish
    }

    // ── Build and store — V3 scoring (only for qualified opportunities) ──
    qualified++;

    const materiality = extraction?.materialityScore || (co.formType === '8-K' ? 65 : 55);
    const mc = co.mc;
    const daysSince = Math.round((Date.now() - new Date(co.filingDate).getTime()) / 86400000);

    // Company Attention (higher = more overlooked)
    let companyAttn;
    if (mc < 100e6) companyAttn = 38; else if (mc < 300e6) companyAttn = 35;
    else if (mc < 500e6) companyAttn = 30; else if (mc < 1e9) companyAttn = 25;
    else if (mc < 2e9) companyAttn = 18; else if (mc < 5e9) companyAttn = 10;
    else if (mc < 10e9) companyAttn = 5; else companyAttn = 2;

    // ── V4e: Real catalyst attention measurement ──
    let attentionProfile = { attentionScore: extraction?.catalystAttentionScore || 50, pressRelease: { found: false, count: 0 }, news: { count: 0, sentiment: 0 }, source: 'estimate' };
    try {
      if (process.env.FMP_API_KEY && extraction) {
        var keywords = [];
        if (extraction.hiddenAngle?.claim) keywords.push(extraction.hiddenAngle.claim.slice(0, 60));
        if (co.formType) keywords.push(co.formType);
        attentionProfile = await measureAttention(co.ticker, process.env.FMP_API_KEY, mc, keywords);
        console.log(`  📡 ${co.ticker}: attention=${attentionProfile.attentionScore} PR=${attentionProfile.pressRelease.found} news=${attentionProfile.news.count} (${attentionProfile.source})`);
      }
    } catch {}

    // ── V4c: Compute filing-day price reaction from FMP ──
    let priceReactionPct = null;
    let volumeReactionPct = null;
    try {
      if (process.env.FMP_API_KEY && co.filingDate) {
        var fmpKey = process.env.FMP_API_KEY;
        var fmpPriceRes = await fetch(
          `https://financialmodelingprep.com/api/v3/historical-price-eod/light?symbol=${co.ticker}&apikey=${fmpKey}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (fmpPriceRes.ok) {
          var fmpData = await fmpPriceRes.json();
          if (Array.isArray(fmpData) && fmpData.length > 5) {
            // Find the trading day nearest to filing date
            var filingTs = new Date(co.filingDate).getTime();
            var bestIdx = 0, bestDist = Infinity;
            for (var pi = 0; pi < Math.min(30, fmpData.length); pi++) {
              var d = fmpData[pi];
              var dTs = new Date(d.date).getTime();
              var dist = Math.abs(dTs - filingTs);
              if (dist < bestDist) { bestDist = dist; bestIdx = pi; }
            }
            if (bestIdx > 0 && bestDist < 3 * 86400000) {
              var eventDay = fmpData[bestIdx];
              var prevDay = fmpData[bestIdx + 1];
              priceReactionPct = ((eventDay.close - prevDay.close) / prevDay.close) * 100;
              volumeReactionPct = eventDay.volume / (prevDay.volume || 1);
            }
          }
        }
      }
    } catch {}    // Catalyst Attention (higher = more overlooked — inverted from real measurement)
    var realCatalystAttn = attentionProfile.attentionScore;
    var catalystAttn = realCatalystAttn;
    const infoAsym = Math.min(100, companyAttn + catalystAttn + 5);

    let evidenceQual = extraction ? 85 : 80;
    if (daysSince <= 3) evidenceQual += 3; else if (daysSince <= 7) evidenceQual += 0;
    else if (daysSince <= 14) evidenceQual -= 3; else evidenceQual -= 8;
    evidenceQual = Math.max(10, Math.min(100, evidenceQual));

    const catalystStr = Math.min(95, Math.max(30, materiality));
    const finMateriality = Math.min(95, Math.max(25, materiality));
    const timing = daysSince <= 1 ? 95 : daysSince <= 3 ? 85 : daysSince <= 7 ? 70 : daysSince <= 14 ? 50 : 30;
    const priceReaction = pricedInScore(
      priceReactionPct,
      volumeReactionPct,
      Math.min(90, Math.max(30, catalystAttn + (daysSince <= 3 ? 15 : 0)))
    );
    const riskScore = mc < 100e6 ? 60 : mc < 300e6 ? 50 : mc < 1e9 ? 40 : mc < 5e9 ? 30 : 20;
    const liquidityPenalty = mc < 100e6 ? 35 : mc < 300e6 ? 20 : mc < 1e9 ? 10 : 0;

    const oppScore = Math.round(Math.max(5, Math.min(98,
      0.25 * infoAsym + 0.15 * catalystStr + 0.20 * evidenceQual +
      0.15 * finMateriality + 0.10 * timing + 0.15 * priceReaction -
      0.10 * riskScore - 0.05 * liquidityPenalty
    )));

    const hash = 'dly_' + co.cik + '_' + co.accessionNumber.replace(/-/g, '').slice(0, 14);
    const title = extraction?.insightTitle
      || (extraction?.hiddenAngle
        ? `${co.ticker}: ${extraction.hiddenAngle.claim.slice(0, 80)}`
        : `${co.display_name} (${co.ticker}) — ${co.formType}`);

    const summary = extraction?.whyItMatters
      || (extraction
        ? `${co.display_name} (${co.ticker}) filed ${co.formType} on ${co.filingDate}. ${extraction.eventSummary}`
        : `${co.display_name} (${co.ticker}) filed ${co.formType} on ${co.filingDate}.`);

    // ── Deterministic qualification gate ──
    const gateResult = applyQualificationGate({
      verifiedFacts: extraction?.verifiedFacts || [],
      hiddenAngle: extraction?.hiddenAngle || {},
      contradictions: extraction?.contradictions || [],
      financialMateriality: extraction?.financialMateriality || {},
      inferences: extraction?.inferences || [],
      whatToWatch: extraction?.whatToWatch || [],
      openQuestions: extraction?.openQuestions || [],
      priceReactionPct,
    });
    const determinedStatus = gateResult.status;
    console.log(`  [Gate] ${co.ticker}: ${determinedStatus}${gateResult.reasons.length ? ' — ' + gateResult.reasons.join(', ') : ''}`);

    // ── Write through canonical path: Document → Signal → Cluster → Opportunity ──
    try {
      const scoreObj = { opportunity: oppScore, information_asymmetry: infoAsym, company_attention: companyAttn,
        catalyst_attention: catalystAttn, catalyst_strength: catalystStr, evidence_quality: evidenceQual,
        financial_materiality: finMateriality, timing: timing, price_reaction: priceReaction, risk: riskScore };
      await writeCanonicalOpportunity(client, {
        runId: RUN_ID, engineVersion: ENGINE_VERSION, hash,
        cik: co.cik, accessionNumber: co.accessionNumber,
        ticker: co.ticker, displayName: co.display_name, secId: co.sec_id,
        formType: co.formType, filingDate: co.filingDate,
        title, summary, verificationStatus: determinedStatus,
        hiddenAngle: extraction?.hiddenAngle || null,
        verifiedFacts: extraction?.verifiedFacts || [],
        inferences: extraction?.inferences || [],
        contradictions: extraction?.contradictions || [],
        missingInfo: extraction?.missingInfo || [],
        openQuestions: extraction?.openQuestions || [],
        whatToWatch: extraction?.whatToWatch || [],
        overlookedReasons: extraction?.overlookedReasons || [],
        riskFlags: extraction?.riskFlags || [],
        scores: scoreObj,
        financialMateriality: extraction?.financialMateriality || null,
        priceReactionPct: priceReactionPct || null,
        volumeReactionPct: volumeReactionPct || null,
        confidence: extraction?.confidence || 0.7,
        mc: mc,
      });

      if (determinedStatus === 'verified' || determinedStatus === 'candidate') {
        published++;
        console.log(`  ✅ ${co.ticker}: PUBLISHED as ${determinedStatus}`);
      } else {
        console.log(`  👁 ${co.ticker}: ${determinedStatus.toUpperCase()} — ${gateResult.reasons.join(', ')}`);
      }
    } catch (e) {
      console.log(`  ⚠ ${co.ticker}: canonical-write error — ${(e.message||'').slice(0,80)}`);
    }
  }

  console.log('\n═══ Discovery Engine ' + ENGINE_VERSION + ' Complete ═══');
  console.log('\n  📊 FUNNEL:');
  console.log('    Screened:           ' + funnelScreened + ' companies');
  console.log('    Recent filings:     ' + funnelFilingCandidates);
  console.log('    Deep researched:    ' + deepResearched + ' (LLM)');
  console.log('    Qualified:          ' + qualified + ' (Candidate+)');
  console.log('    Rejected/routine:   ' + rejected);
  console.log('    Watch:              ' + watched);

  const counts = await client.query("SELECT status, COUNT(*) as n FROM opportunities GROUP BY status");
  console.log('Statuses:', JSON.stringify(counts.rows));

  await client.end();
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
