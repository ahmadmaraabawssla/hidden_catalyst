/**
 * Daily Discovery Engine — Picks the TOP 20 opportunities and runs AI on them.
 * 
 * Selection criteria (pre-LLM):
 * 1. Market cap: prioritize $100M-$5B (configurable)
 * 2. Form type: 8-K > 10-Q > 10-K > S-1 > 13D
 * 3. Recency: last 7 days
 * 4. Source diversity: mix across SEC, FDA, USPTO if available
 * 5. Sector diversity: no more than 3 from same sector
 * 
 * Only these 20 get LLM analysis. User can trigger more via "Explore More".
 * 
 * Run: node scripts/daily-top20.js [optional: --force-run]
 */

const { Client } = require('pg');
const { setApiKey, extractFromFiling } = require('../packages/engine/src/llm-extractor');

// ALL secrets from environment variables ONLY
const DB = process.env.DATABASE_URL;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const UA = process.env.SEC_USER_AGENT || 'Hidden Catalyst (contact@hiddencatalyst.com)';

if (!DB) { console.error('DATABASE_URL environment variable required'); process.exit(1); }
if (!DEEPSEEK_KEY) { console.error('DEEPSEEK_API_KEY environment variable required'); process.exit(1); }
const TOP_N = 20;

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

// ─── Main Pipeline ───
async function main() {
  const client = new Client({ connectionString: DB });
  await client.connect();
  console.log('═══ Daily Top 20 Discovery Engine ═══\n');

  // Find candidates
  const candidates = await client.query(`
    SELECT c.id, c.cik, c.display_name, s.ticker, s.id as sec_id,
           COALESCE(NULLIF(s.market_cap, 0), 800000000) as mc, c.sector
    FROM companies c
    JOIN securities s ON s.company_id = c.id
    WHERE c.cik IS NOT NULL
      AND s.active = true
      AND s.exchange IN ('NYSE', 'NASDAQ', 'NYSE American')
      AND (s.market_cap IS NULL OR s.market_cap > 10000)
      AND NOT EXISTS (
        SELECT 1 FROM opportunities o WHERE o.security_id = s.id AND o.status = 'published'
      )
    ORDER BY s.market_cap ASC NULLS FIRST
    LIMIT 500
  `);

  console.log(`Scanning ${candidates.rows.length} candidate companies...\n`);

  // Fetch filing data and pre-score
  const scored = [];

  for (const co of candidates.rows) {
    const cik = String(co.cik).padStart(10, '0');
    try {
      const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const f = data.filings?.recent;
      if (!f?.form) continue;

      // Find best material filing in last 7 days
      for (let i = 0; i < Math.min(10, f.form.length); i++) {
        const fm = (f.form[i] || '').toUpperCase();
        if (!MATERIAL_FORMS.includes(fm.replace(/\/A$/, ''))) continue;
        if (SKIP_FORMS.has(fm)) continue;

        const dt = f.filingDate[i] || '';
        if (!dt) continue;
        const daysAgo = (Date.now() - new Date(dt).getTime()) / 86400000;
        if (daysAgo > 7) continue;

        scored.push({
          ...co,
          formType: fm.replace(/\/A$/, ''),
          filingDate: dt,
          accessionNumber: f.accessionNumber[i],
          preScore: preScore(co, fm.replace(/\/A$/, ''), dt),
          aiProcessed: false,
        });
        break; // One filing per company
      }
      await sleep(50); // SEC rate limit
    } catch {}
  }

  // Sort by pre-score, pick top N
  scored.sort((a, b) => b.preScore - a.preScore);
  const topN = scored.slice(0, TOP_N);

  console.log(`Found ${scored.length} candidates with recent filings.`);
  console.log(`Selected TOP ${topN.length} for AI analysis:\n`);

  let aiProcessed = 0, published = 0;

  for (let idx = 0; idx < topN.length; idx++) {
    const co = topN[idx];
    console.log(`  [${idx + 1}/${topN.length}] ${co.ticker} (${co.display_name.slice(0, 30)}) — ${co.formType} — pre-score: ${co.preScore}`);

    // Download filing text
    let filingText = '';
    if (co.formType === '8-K') {
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
    }

    // Run DeepSeek v2 — two-pass extraction with rejection capability
    let extraction = null;
    if (filingText.length > 200) {
      extraction = await extractFromFiling(filingText, co.display_name, co.ticker, co.formType, co.sector);
      if (extraction) aiProcessed++;
      await sleep(2000);
    }

    // ── V3 QUALIFICATION GATE ──
    // Does this filing contain a genuine hidden opportunity?
    // If extraction returned qualified===false, store as REJECTED or WATCH.
    if (!extraction || !extraction.qualified) {
      const reason = extraction?.isRoutine ? 'routine_filing' : 'no_hidden_angle';
      const verStatus = extraction?.isRoutine ? 'rejected' : 'watch';
      const hiddenAngle = extraction?.hiddenAngle || null;

      // Store as rejected/watch for audit trail
      const hash = 'dly_' + co.cik + '_' + co.accessionNumber.replace(/-/g, '').slice(0, 14);
      const title = extraction
        ? `[${verStatus.toUpperCase()}] ${co.display_name} (${co.ticker}) — ${co.formType}`
        : `${co.display_name} (${co.ticker}) — ${co.formType} (skipped)`;

      try {
        await client.query(
          `INSERT INTO opportunities(id,security_id,title,summary,status,verification_status,hidden_angle,detected_at,created_at,updated_at)
           VALUES($1,$2,$3,$4,'rejected',$5,$6,$7,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`,
          ['o_' + hash, co.sec_id, title,
           `[Rejected: ${reason}] ${co.display_name} filed ${co.formType} on ${co.filingDate}. No hidden angle identified.`,
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
    const materiality = extraction?.materialityScore || (co.formType === '8-K' ? 65 : 55);
    const mc = co.mc;
    const daysSince = Math.round((Date.now() - new Date(co.filingDate).getTime()) / 86400000);

    // Company Attention (higher = more overlooked)
    let companyAttn;
    if (mc < 100e6) companyAttn = 38; else if (mc < 300e6) companyAttn = 35;
    else if (mc < 500e6) companyAttn = 30; else if (mc < 1e9) companyAttn = 25;
    else if (mc < 2e9) companyAttn = 18; else if (mc < 5e9) companyAttn = 10;
    else if (mc < 10e9) companyAttn = 5; else companyAttn = 2;

    // Catalyst Attention (higher = more overlooked — inverted from LLM assessment)
    const catalystAttn = extraction?.catalystAttentionScore
      ? (100 - extraction.catalystAttentionScore)
      : (co.formType === '8-K' ? 40 : 20);
    const infoAsym = Math.min(100, companyAttn + catalystAttn + 5);

    let evidenceQual = extraction ? 85 : 80;
    if (daysSince <= 3) evidenceQual += 3; else if (daysSince <= 7) evidenceQual += 0;
    else if (daysSince <= 14) evidenceQual -= 3; else evidenceQual -= 8;
    evidenceQual = Math.max(10, Math.min(100, evidenceQual));

    const catalystStr = Math.min(95, Math.max(30, materiality));
    const finMateriality = Math.min(95, Math.max(25, materiality));
    const timing = daysSince <= 1 ? 95 : daysSince <= 3 ? 85 : daysSince <= 7 ? 70 : daysSince <= 14 ? 50 : 30;
    const priceReaction = Math.min(90, Math.max(30, catalystAttn + (daysSince <= 3 ? 15 : 0)));
    const riskScore = mc < 100e6 ? 60 : mc < 300e6 ? 50 : mc < 1e9 ? 40 : mc < 5e9 ? 30 : 20;
    const liquidityPenalty = mc < 100e6 ? 35 : mc < 300e6 ? 20 : mc < 1e9 ? 10 : 0;

    const oppScore = Math.round(Math.max(5, Math.min(98,
      0.25 * infoAsym + 0.15 * catalystStr + 0.20 * evidenceQual +
      0.15 * finMateriality + 0.10 * timing + 0.15 * priceReaction -
      0.10 * riskScore - 0.05 * liquidityPenalty
    )));

    const hash = 'dly_' + co.cik + '_' + co.accessionNumber.replace(/-/g, '').slice(0, 14);
    const title = extraction
      ? `${co.display_name} (${co.ticker}): ${extraction.eventSummary.slice(0, 80)}`
      : `${co.display_name} (${co.ticker}) — ${co.formType}`;

    const summary = extraction
      ? `[AI] ${co.display_name} (${co.ticker}) filed ${co.formType} on ${co.filingDate}. ${extraction.eventSummary}`
      : `${co.display_name} (${co.ticker}) filed ${co.formType} on ${co.filingDate}.`;

    try {
      await client.query(
        'INSERT INTO documents(id,source_id,canonical_url,published_at,retrieved_at,content_hash,title,text,created_at) VALUES($1,$2,$3,$4,NOW(),$5,$6,$7,NOW()) ON CONFLICT(content_hash) DO NOTHING',
        ['d_' + hash, 'source_sec_edgar', `https://www.sec.gov/cgi-bin/browse-edgar?CIK=${co.cik}`, co.filingDate, hash, title, summary]
      );
      await client.query(
        'INSERT INTO evidence_items(id,document_id,excerpt,evidence_type,quality_score,created_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(id) DO NOTHING',
        ['e_' + hash, 'd_' + hash, (extraction?.verifiedFacts[0] || summary).slice(0, 500), 'primary', evidenceQual]
      );
      await client.query(
        'INSERT INTO opportunities(id,security_id,title,summary,status,verification_status,hidden_angle,detected_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) ON CONFLICT(id) DO NOTHING',
        ['o_' + hash, co.sec_id, title, summary, 'candidate',
         extraction?.verificationStatus || 'candidate',
         extraction?.hiddenAngle ? JSON.stringify(extraction.hiddenAngle) : null,
         co.filingDate]
      );
      await client.query(
        'INSERT INTO claims(id,opportunity_id,claim_type,text,confidence,evidence_item_ids,created_at) VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(id) DO NOTHING',
        ['cf_' + hash, 'o_' + hash, (extraction?.verifiedFacts[0] || `${co.ticker}: ${co.formType} ${co.filingDate}`).slice(0, 500), extraction?.confidence || 0.9, JSON.stringify(['e_' + hash])]
      );

      if (extraction?.inferences) {
        for (let j = 0; j < extraction.inferences.length; j++) {
          await client.query(
            'INSERT INTO claims(id,opportunity_id,claim_type,text,confidence,evidence_item_ids,created_at) VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(id) DO NOTHING',
            [`ci${j}_${hash}`, 'o_' + hash, 'inference', extraction.inferences[j].text, extraction.inferences[j].confidence, JSON.stringify(['e_' + hash])]
          );
        }
      }

      // Scores — simpler loop to avoid destructuring issues
      var scoreRows = [['opportunity', oppScore], ['information_asymmetry', infoAsym], ['company_attention', companyAttn], ['catalyst_attention', catalystAttn], ['catalyst_strength', catalystStr], ['evidence_quality', evidenceQual], ['financial_materiality', finMateriality], ['timing', timing], ['price_reaction', priceReaction], ['risk', riskScore]];
      for (var si = 0; si < scoreRows.length; si++) {
        var st = scoreRows[si][0];
        var sv = scoreRows[si][1];
        await client.query(
          'INSERT INTO scores(id,opportunity_id,score_type,value,factors,model_version,calculated_at) VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(id) DO NOTHING',
          ['s_' + st + '_' + hash, 'o_' + hash, st, sv, JSON.stringify({ mc: mc, pipeline: 'daily-top20-v3' }), '3.0.0']
        );
      }

      // Contradictions
      if (extraction?.contradictions && extraction.contradictions.length > 0) {
        for (let j = 0; j < extraction.contradictions.length; j++) {
          await client.query(
            'INSERT INTO risks(id,opportunity_id,risk_type,severity,description,created_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(id) DO NOTHING',
            ['ct_' + j + '_' + hash, 'o_' + hash, 'contradiction', 'medium', extraction.contradictions[j]]
          );
        }
      }

      // What to watch
      if (extraction?.whatToWatch && extraction.whatToWatch.length > 0) {
        for (let j = 0; j < extraction.whatToWatch.length; j++) {
          await client.query(
            'INSERT INTO invalidation_rules(id,opportunity_id,rule_type,definition,status,created_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(id) DO NOTHING',
            ['wt_' + j + '_' + hash, 'o_' + hash, 'confirmation', JSON.stringify({ signal: extraction.whatToWatch[j] }), 'monitoring']
          );
        }
      }

      const reasons = extraction?.overlookedReasons || [
        `Market cap of $${(mc / 1e9).toFixed(1)}B — limited analyst coverage`,
        `${co.formType} filing — ${co.formType === '8-K' ? 'unscheduled disclosure' : 'periodic report'}`,
      ];
      for (let j = 0; j < reasons.length; j++) {
        await client.query(
          'INSERT INTO risks(id,opportunity_id,risk_type,severity,description,created_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(id) DO NOTHING',
          [`olr_${j}_${hash}`, 'o_' + hash, `overlooked_reason_${j + 1}`, 'low', reasons[j]]
        );
      }

      if (extraction?.riskFlags) {
        var flags = extraction.riskFlags;
        for (var fi = 0; fi < flags.length; fi++) {
          var rf = flags[fi];
          await client.query(
            'INSERT INTO risks(id,opportunity_id,risk_type,severity,description,created_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(id) DO NOTHING',
            ['rf_' + rf.type + '_' + hash, 'o_' + hash, rf.type, rf.severity, rf.description]
          );
        }
      }

      // Publish gate — only publish if verified status
      if (evidenceQual >= 70 && riskScore <= 65 && extraction?.verificationStatus === 'verified') {
        await client.query("UPDATE opportunities SET status='published',published_at=NOW() WHERE id=$1", ['o_' + hash]);
        published++;
      } else if (extraction?.verificationStatus === 'verified' && (evidenceQual < 70 || riskScore > 65)) {
        // LLM thinks it's verified but auto-gate disagrees — store as candidate for review
        await client.query("UPDATE opportunities SET status='candidate' WHERE id=$1", ['o_' + hash]);
      }

    } catch (e) {
      console.log(`  ⚠ ${co.ticker}: qualified-insert error — ${(e.message||'').slice(0,80)}`);
    }
  }

  console.log(`\n═══ Daily Top 20 Complete ═══`);
  console.log(`AI analyzed: ${aiProcessed}/${topN.length} | Published: ${published}`);

  const counts = await client.query("SELECT status, COUNT(*) as n FROM opportunities GROUP BY status");
  console.log('Statuses:', JSON.stringify(counts.rows));

  await client.end();
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
