/**
 * Discovery Engine — Budget-Based Continuous Discovery
 * 
 * Philosophy:
 *   Harvest continuously → filter aggressively → investigate promising signals →
 *   stop only when TARGET_CANDIDATES reached OR search budget exhausted.
 * 
 * Target 20 is OUTPUT, not INPUT. If only 3 qualify, show 3 and keep searching.
 * 
 * Config:
 *   TARGET_CANDIDATES = 20    (qualified opportunities to publish)
 *   MAX_RAW_EVENTS = 2000     (max SEC filings to screen)
 *   MAX_DEEP_RESEARCH = 100   (max LLM analyses to run)
 *   LOOKBACK_DAYS = 14        (how far back to search)
 * 
 * Run: node scripts/discovery.js
 */

const { Client } = require('pg');
const { setApiKey, extractFromFiling } = require('../packages/engine/src/llm-extractor');
const { measureAttention } = require('../packages/engine/src/catalyst-attention');
const { resolveDefinedTerms } = require('../packages/engine/src/cdr');

const DB = process.env.DATABASE_URL;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const UA = process.env.SEC_USER_AGENT || 'Hidden Catalyst (contact@hiddencatalyst.com)';
const ENGINE_VERSION = 'v3_investigation';

if (!DB) { console.error('DATABASE_URL required'); process.exit(1); }
if (!DEEPSEEK_KEY) { console.error('DEEPSEEK_API_KEY required'); process.exit(1); }

// ─── CONFIG ───
const CONFIG = {
  TARGET_CANDIDATES: 20,      // qualified opportunities to publish
  MAX_RAW_EVENTS: 2000,       // max SEC filings to screen
  MAX_DEEP_RESEARCH: 100,     // max LLM analyses
  LOOKBACK_DAYS: 14,          // how far back to search
  BATCH_SIZE: 50,             // SEC submissions fetch batch
  SEC_RATE_LIMIT_MS: 60,      // ms between SEC API calls
  LLM_RATE_LIMIT_MS: 2000,    // ms between LLM calls
};

setApiKey(DEEPSEEK_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MATERIAL_FORMS = ['8-K', '10-Q', '10-K', 'S-1', '13D', '13G'];
const SKIP_FORMS = new Set(['3','4','5','3/A','4/A','144','N-PX','NPORT-P','N-CSR','N-CSRS','6-K','ARS','CERT','25','8-A12B','PX14A6G','S-8','424B2','FWP','25-NSE','SD']);

// ─── Pre-filter: quick rejection of obvious routine filings ───
function preFilter(formType, filingText) {
  if (!filingText || filingText.length < 200) return { pass: false, reason: 'empty_filing' };

  var text = filingText.slice(0, 3000).toLowerCase();

  // Quick rejection patterns
  if (/\bquarterly\s+(?:financial|report|results)\b/i.test(text) &&
      !/(?:acquisition|merger|financing|ELOC|warrant|material\s+definitive|entry\s+into|closing)/i.test(text)) {
    return { pass: false, reason: 'routine_quarterly_report' };
  }
  if (/\bdeclared\s+(?:a\s+)?(?:quarterly\s+)?dividend\b/i.test(text) &&
      !/(?:special\s+dividend|increase|suspension|extraordinary)/i.test(text)) {
    return { pass: false, reason: 'routine_dividend' };
  }
  if (/\b(resignation|appointment)\s+of\s+(?:director|officer|chief)\b/i.test(text) &&
      !/(?:investigation|restatement|misconduct|fraud)/i.test(text)) {
    return { pass: false, reason: 'routine_governance' };
  }
  if (/\bdeath\s+of\b/i.test(text) && !/(?:ceo|founder|chairman|controlling\s+shareholder)/i.test(text)) {
    return { pass: false, reason: 'board_member_death' };
  }
  if (/\bamendment\s+to\s+(?:bylaws|articles|charter)\b/i.test(text) &&
      !/(?:activist|takeover|defense|poison\s+pill)/i.test(text)) {
    return { pass: false, reason: 'routine_bylaw_amendment' };
  }

  // Positive signals
  var score = 0;
  if (/ELOC|equity\s+line|purchase\s+agreement|financing\s+agreement|commitment\s+fee|true[\s-]*up/i.test(text)) score += 3;
  if (/merger|acquisition|takeover|tender\s+offer/i.test(text)) score += 3;
  if (/patent|FDA|fast\s+track|breakthrough|approval|clinical\s+trial|phase\s+[123]/i.test(text)) score += 3;
  if (/contract|award|government|federal|DOD|NASA|DARPA/i.test(text)) score += 2;
  if (/reverse\s+split|delisting|deficiency|compliance\s+plan/i.test(text)) score += 2;
  if (/13[dg]|beneficial\s+owner|activist|5%/i.test(text)) score += 2;
  if (/S-1|IPO|offering|underwriting|registration\s+statement/i.test(text)) score += 1;

  if (score === 0) return { pass: false, reason: 'no_signal' };
  return { pass: true, reason: formType + '_signal_' + score };
}

// ─── Pre-score for ranking within the research queue ───
function preScore(company, formType, filingDate) {
  const mc = company.mc || 800000000;
  const daysAgo = (Date.now() - new Date(filingDate).getTime()) / 86400000;
  let s = 0;
  if (mc < 200e6) s = 30; else if (mc < 500e6) s = 25;
  else if (mc < 1e9) s = 22; else if (mc < 2e9) s = 18;
  else if (mc < 5e9) s = 15; else if (mc < 10e9) s = 10; else s = 5;
  const formScores = { '8-K': 30, 'S-1': 28, '13D': 25, '13G': 20, '10-Q': 15, '10-K': 12 };
  s += (formScores[formType] || 10);
  s += Math.max(0, 20 - daysAgo * 2);
  return s;
}

// ─── Main Discovery Loop ───
async function main() {
  const pg = new Client({ connectionString: DB });
  await pg.connect();

  console.log('═══ Discovery Engine v3 ═══');
  console.log(`Budget: ${CONFIG.MAX_RAW_EVENTS} raw, ${CONFIG.MAX_DEEP_RESEARCH} deep, target ${CONFIG.TARGET_CANDIDATES} candidates`);
  console.log(`Lookback: ${CONFIG.LOOKBACK_DAYS} days\n`);

  let screened = 0, prefiltered = 0, researched = 0;
  let rejected = 0, watchCount = 0, candidateCount = 0;

  // ── Phase 1: Harvest candidates ──
  console.log('Phase 1: Harvesting candidate companies...');
  const companies = await pg.query(`
    SELECT c.id, c.cik, c.display_name, s.ticker, s.id as sec_id,
           COALESCE(NULLIF(s.market_cap, 0), 800000000) as mc, c.sector
    FROM companies c
    JOIN securities s ON s.company_id = c.id
    WHERE c.cik IS NOT NULL AND s.active = true
      AND s.exchange IN ('NYSE', 'NASDAQ', 'NYSE American')
    ORDER BY s.market_cap ASC NULLS FIRST
    LIMIT 500
  `);
  console.log(`  Pool: ${companies.rows.length} companies eligible\n`);

  // ── Phase 2: Screen filings ──
  console.log('Phase 2: Screening filings...');
  const researchQueue = [];
  let budgetExhausted = false;

  for (const co of companies.rows) {
    if (screened >= CONFIG.MAX_RAW_EVENTS) { budgetExhausted = true; break; }
    if (candidateCount >= CONFIG.TARGET_CANDIDATES) break;

    screened++;
    const cik = String(co.cik).padStart(10, '0');

    try {
      const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const f = data.filings?.recent;
      if (!f?.form) continue;
      await sleep(CONFIG.SEC_RATE_LIMIT_MS);

      for (let i = 0; i < Math.min(10, f.form.length); i++) {
        const fm = (f.form[i] || '').toUpperCase();
        const cleanForm = fm.replace(/\/A$/, '');
        if (!MATERIAL_FORMS.includes(cleanForm)) continue;
        if (SKIP_FORMS.has(fm)) continue;

        const dt = f.filingDate[i];
        if (!dt) continue;
        const daysAgo = (Date.now() - new Date(dt).getTime()) / 86400000;
        if (daysAgo > CONFIG.LOOKBACK_DAYS) continue;

        // Quick pre-filter — download snippet and check
        let snippet = '';
        try {
          const acc = f.accessionNumber[i];
          const accND = acc.replace(/-/g, '');
          const txtRes = await fetch(
            `https://www.sec.gov/Archives/edgar/data/${cik}/${accND}/${acc}.txt`,
            { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) }
          );
          if (txtRes.ok) {
            const raw = await txtRes.text();
            const ts = raw.indexOf('<TEXT>');
            snippet = (ts > 0 ? raw.slice(ts + 6) : raw.slice(0, 10000))
              .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000);
          }
        } catch {}

        const pf = preFilter(cleanForm, snippet);
        if (!pf.pass) {
          rejected++;
          if (screened % 100 === 0) console.log(`  Screened ${screened} | rejected ${rejected} | queue ${researchQueue.length}`);
          break;
        }

        prefiltered++;
        researchQueue.push({
          ...co, formType: cleanForm, filingDate: dt,
          accessionNumber: f.accessionNumber[i],
          preScore: preScore(co, cleanForm, dt),
          snippet: snippet,
          filterReason: pf.reason,
        });
        break; // One filing per company
      }
    } catch {}

    if (screened % 100 === 0) {
      console.log(`  Screened ${screened} | rejected ${rejected} | queue ${researchQueue.length} | candidates ${candidateCount}`);
    }
  }

  // Sort research queue by pre-score
  researchQueue.sort((a, b) => b.preScore - a.preScore);
  console.log(`\nPhase 2 complete: ${screened} screened, ${rejected} rejected, ${researchQueue.length} in research queue\n`);

  // ── Phase 3: Deep research ──
  console.log('Phase 3: Deep research on queue...');
  const deepQueue = researchQueue.slice(0, CONFIG.MAX_DEEP_RESEARCH);

  for (let idx = 0; idx < deepQueue.length; idx++) {
    if (researched >= CONFIG.MAX_DEEP_RESEARCH) { budgetExhausted = true; break; }
    if (candidateCount >= CONFIG.TARGET_CANDIDATES) break;

    const co = deepQueue[idx];
    console.log(`  [${idx + 1}/${deepQueue.length}] ${co.ticker} (${co.display_name.slice(0, 25)}) — ${co.formType} — pre:${co.preScore}`);
    researched++;

    // Download full filing text
    let filingText = co.snippet;
    if (filingText.length < 500 && co.formType === '8-K') {
      try {
        const cik = String(co.cik).padStart(10, '0');
        const accND = co.accessionNumber.replace(/-/g, '');
        const txtRes = await fetch(
          `https://www.sec.gov/Archives/edgar/data/${cik}/${accND}/${co.accessionNumber}.txt`,
          { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) }
        );
        if (txtRes.ok) {
          const raw = await txtRes.text();
          const ts = raw.indexOf('<TEXT>');
          filingText = (ts > 0 ? raw.slice(ts + 6) : raw.slice(0, 12000))
            .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 10000);
        }
      } catch {}
    }

    // Company context + CDR
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
        }
      }

      // CDR
      if (filingText.match(/purchase\s+agreement|defined\s+in\s+the|amends\s+the|referenced\s+in/i)) {
        const cdrResult = await resolveDefinedTerms(filingText, cik);
        if (cdrResult.context) {
          companyContext += '\n\nCROSS-DOCUMENT RESOLVED TERMS:\n' + cdrResult.context.slice(0, 1500);
        }
      }
    } catch {}

    // LLM extraction
    let extraction = null;
    if (filingText.length > 200) {
      extraction = await extractFromFiling(filingText, co.display_name, co.ticker, co.formType, co.sector, companyContext);
      await sleep(CONFIG.LLM_RATE_LIMIT_MS);
    }

    // ── Qualification gate ──
    if (!extraction || !extraction.qualified) {
      const reason = extraction?.isRoutine ? 'routine_filing' : 'no_hidden_angle';
      const verStatus = extraction?.isRoutine ? 'rejected' : 'watch';
      rejected++;
      if (verStatus === 'watch') watchCount++;

      // Store rejected/watch
      const hash = 'disc_' + co.cik + '_' + co.accessionNumber.replace(/-/g, '').slice(0, 14);
      try {
        await pg.query(
          `INSERT INTO opportunities(id,security_id,title,summary,status,verification_status,detected_at,created_at,updated_at)
           VALUES($1,$2,$3,$4,'published', $5, $6,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`,
          ['o_' + hash, co.sec_id,
           extraction ? `[${verStatus.toUpperCase()}] ${co.display_name} (${co.ticker}) — ${co.formType}` : `${co.display_name} — ${co.formType}`,
           `Pre-filter: ${co.filterReason}. ${extraction?.eventSummary || 'No hidden angle found'}. Engine: ${ENGINE_VERSION}.`,
           verStatus, co.filingDate]
        );
      } catch {}
      continue;
    }

    // ── Qualified: compute scores and store ──
    const materiality = extraction?.materialityScore || 55;
    const mc = co.mc;
    const daysSince = Math.round((Date.now() - new Date(co.filingDate).getTime()) / 86400000);

    let companyAttn;
    if (mc < 100e6) companyAttn = 38; else if (mc < 300e6) companyAttn = 35;
    else if (mc < 500e6) companyAttn = 30; else if (mc < 1e9) companyAttn = 25;
    else if (mc < 2e9) companyAttn = 18; else if (mc < 5e9) companyAttn = 10;
    else if (mc < 10e9) companyAttn = 5; else companyAttn = 2;

    const catalystAttn = extraction?.catalystAttentionScore
      ? (100 - extraction.catalystAttentionScore) : 40;
    const infoAsym = Math.min(100, companyAttn + catalystAttn + 5);

    let evidenceQual = 85;
    if (daysSince <= 3) evidenceQual += 3;
    else if (daysSince <= 14) evidenceQual -= 3;
    else evidenceQual -= 8;
    evidenceQual = Math.max(10, Math.min(100, evidenceQual));

    const catalystStr = Math.min(95, Math.max(30, materiality));
    const finMateriality = Math.min(95, Math.max(25, materiality));
    const timing = daysSince <= 1 ? 95 : daysSince <= 3 ? 85 : daysSince <= 7 ? 70 : daysSince <= 14 ? 50 : 30;
    const priceReaction = Math.min(90, Math.max(30, catalystAttn));
    const riskScore = mc < 100e6 ? 60 : mc < 300e6 ? 50 : mc < 1e9 ? 40 : mc < 5e9 ? 30 : 20;

    const oppScore = Math.round(Math.max(5, Math.min(98,
      0.25 * infoAsym + 0.15 * catalystStr + 0.20 * evidenceQual +
      0.15 * finMateriality + 0.10 * timing + 0.15 * priceReaction -
      0.10 * riskScore
    )));

    const hash = 'disc_' + co.cik + '_' + co.accessionNumber.replace(/-/g, '').slice(0, 14);
    const title = extraction?.insightTitle ||
      (extraction?.hiddenAngle
        ? `${co.ticker}: ${extraction.hiddenAngle.claim.slice(0, 80)}`
        : `${co.display_name} (${co.ticker}) — ${co.formType}`);

    const summary = extraction?.whyItMatters ||
      `${co.display_name} (${co.ticker}) filed ${co.formType} on ${co.filingDate}. Engine: ${ENGINE_VERSION}.`;

    candidateCount++;

    try {
      await pg.query(
        `INSERT INTO opportunities(id,security_id,title,summary,status,verification_status,hidden_angle,detected_at,created_at,updated_at)
         VALUES($1,$2,$3,$4,'published',$5,$6,$7,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`,
        ['o_' + hash, co.sec_id, title, summary, extraction?.verificationStatus || 'candidate',
         extraction?.hiddenAngle ? JSON.stringify(extraction.hiddenAngle) : null, co.filingDate]
      );

      // Scores
      const scoreRows = [['opportunity', oppScore], ['information_asymmetry', infoAsym], ['company_attention', companyAttn],
        ['catalyst_attention', catalystAttn], ['catalyst_strength', catalystStr], ['evidence_quality', evidenceQual],
        ['financial_materiality', finMateriality], ['timing', timing], ['price_reaction', priceReaction], ['risk', riskScore]];
      for (const [st, sv] of scoreRows) {
        await pg.query(
          `INSERT INTO scores(id,opportunity_id,score_type,value,factors,model_version,calculated_at)
           VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(id) DO NOTHING`,
          ['s_' + st + '_' + hash, 'o_' + hash, st, sv,
           JSON.stringify({ mc, pipeline: 'discovery-v3', engine: ENGINE_VERSION }), '3.0.0']
        );
      }

      // Facts
      const facts = extraction?.verifiedFacts || [];
      for (let j = 0; j < facts.length; j++) {
        const ft = typeof facts[j] === 'string' ? facts[j] : (facts[j]?.fact + ': ' + (facts[j]?.value || ''));
        await pg.query(
          `INSERT INTO claims(id,opportunity_id,claim_type,text,confidence,evidence_item_ids,created_at)
           VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(id) DO NOTHING`,
          [`cf${j}_${hash}`, 'o_' + hash, 'verified_fact', ft?.slice(0, 500), 0.9, '[]']
        );
      }

      // Contradictions
      if (extraction?.contradictions) {
        for (let j = 0; j < extraction.contradictions.length; j++) {
          await pg.query(
            `INSERT INTO risks(id,opportunity_id,risk_type,severity,description,created_at)
             VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(id) DO NOTHING`,
            ['ct_' + j + '_' + hash, 'o_' + hash, 'contradiction', 'medium', extraction.contradictions[j]]
          );
        }
      }

      // Missing info
      if (extraction?.missingInfo) {
        for (let j = 0; j < extraction.missingInfo.length; j++) {
          await pg.query(
            `INSERT INTO risks(id,opportunity_id,risk_type,severity,description,created_at)
             VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(id) DO NOTHING`,
            ['mi_' + j + '_' + hash, 'o_' + hash, 'missing_info', 'low', extraction.missingInfo[j]]
          );
        }
      }

      // What to watch
      if (extraction?.whatToWatch) {
        for (let j = 0; j < extraction.whatToWatch.length; j++) {
          await pg.query(
            `INSERT INTO invalidation_rules(id,opportunity_id,rule_type,definition,status,created_at)
             VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(id) DO NOTHING`,
            ['wt_' + j + '_' + hash, 'o_' + hash, 'confirmation',
             JSON.stringify({ signal: extraction.whatToWatch[j] }), 'monitoring']
          );
        }
      }

      // Open questions
      if (extraction?.openQuestions) {
        for (let j = 0; j < extraction.openQuestions.length; j++) {
          await pg.query(
            `INSERT INTO invalidation_rules(id,opportunity_id,rule_type,definition,status,created_at)
             VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(id) DO NOTHING`,
            ['oq_' + j + '_' + hash, 'o_' + hash, 'open_question',
             JSON.stringify({ question: extraction.openQuestions[j] }), 'open']
          );
        }
      }

      console.log(`  ✅ ${co.ticker}: CANDIDATE — score ${oppScore} (${facts.length} facts)`);
    } catch (e) {
      console.log(`  ⚠ ${co.ticker}: storage error — ${(e.message || '').slice(0, 60)}`);
    }
  }

  // ── Phase 4: Report ──
  console.log(`\n═══ Discovery Complete ═══`);
  console.log(`  Screened:    ${screened} filings`);
  console.log(`  Pre-filtered: ${prefiltered} → research queue`);
  console.log(`  Researched:  ${researched} deep (LLM)`);
  console.log(`  Rejected:    ${rejected} routine/no-signal`);
  console.log(`  Watch:       ${watchCount} interesting but insufficient`);
  console.log(`  Candidates:  ${candidateCount} qualified (target: ${CONFIG.TARGET_CANDIDATES})`);
  console.log(`  Budget used:  ${Math.round(screened / CONFIG.MAX_RAW_EVENTS * 100)}% raw, ${Math.round(researched / CONFIG.MAX_DEEP_RESEARCH * 100)}% deep`);
  if (budgetExhausted) console.log(`  ⚠ Search budget exhausted before reaching target.`);
  if (candidateCount < CONFIG.TARGET_CANDIDATES) console.log(`  ℹ Target not met. Run again to search more companies.`);

  await pg.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
