/**
 * Legacy Reprocessing Engine
 * 
 * Takes old v1_legacy pipeline opportunities and re-runs them
 * through the v3 investigation pipeline (CDR, deep LLM, attention).
 * 
 * Some rejected items may become interesting after deeper research.
 * 
 * Run: node scripts/reprocess-legacy.js [--all]
 */

const { Client } = require('pg');
const { setApiKey, extractFromFiling } = require('../packages/engine/src/llm-extractor');
const { resolveDefinedTerms } = require('../packages/engine/src/cdr');

const DB = process.env.DATABASE_URL;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const UA = 'Hidden Catalyst contact@hiddencatalyst.com';

if (!DB) { console.error('DATABASE_URL required'); process.exit(1); }
if (!DEEPSEEK_KEY) { console.error('DEEPSEEK_API_KEY required'); process.exit(1); }

setApiKey(DEEPSEEK_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const pg = new Client({ connectionString: DB });
  await pg.connect();

  // Find legacy items
  const legacy = await pg.query(`
    SELECT o.id, o.security_id, o.title, s.ticker, s.market_cap as mc,
           c.cik, c.display_name, c.sector, o.detected_at
    FROM opportunities o
    JOIN securities s ON s.id = o.security_id
    JOIN companies c ON c.id = s.company_id
    WHERE o.status = 'published'
      AND COALESCE(o.engine_version, 'v1_legacy') = 'v1_legacy'
      AND c.cik IS NOT NULL
    ORDER BY o.detected_at DESC
  `);

  console.log(`Found ${legacy.rows.length} legacy items to reprocess\n`);

  let processed = 0, upgraded = 0, confirmed = 0;

  for (const item of legacy.rows) {
    console.log(`[${processed + 1}/${legacy.rows.length}] ${item.ticker}: ${item.display_name?.slice(0, 30)}`);

    // Get the filing date and try to find the original filing
    const cik = String(item.cik).padStart(10, '0');
    const detectedDate = item.detected_at ? new Date(item.detected_at) : new Date();
    const startStr = new Date(detectedDate.getTime() - 3 * 86400000).toISOString().slice(0, 10);
    const endStr = new Date(detectedDate.getTime() + 3 * 86400000).toISOString().slice(0, 10);

    let filingText = '';
    let filingDate = '';
    let formType = '';
    let accessionNumber = '';

    try {
      const subRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000)
      });
      if (!subRes.ok) { console.log(`  ⚠ Could not fetch SEC submissions`); processed++; continue; }
      const subData = await subRes.json();
      const recent = subData.filings?.recent;
      if (!recent?.form) { processed++; continue; }

      // Find the best match near the detected date
      for (let i = 0; i < 20; i++) {
        const dt = recent.filingDate[i] || '';
        if (dt < startStr || dt > endStr) continue;
        const fm = (recent.form[i] || '').toUpperCase().replace(/\/A$/, '');
        if (!['8-K', '10-Q', '10-K', 'S-1', '13D'].includes(fm)) continue;

        filingDate = dt;
        formType = fm;
        accessionNumber = recent.accessionNumber[i];
        const accND = accessionNumber.replace(/-/g, '');

        const txtRes = await fetch(
          `https://www.sec.gov/Archives/edgar/data/${cik}/${accND}/${accessionNumber}.txt`,
          { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) }
        );
        if (!txtRes.ok) continue;
        const raw = await txtRes.text();
        const ts = raw.indexOf('<TEXT>');
        filingText = (ts > 0 ? raw.slice(ts + 6) : raw.slice(0, 10000))
          .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 10000);
        break;
      }
    } catch { console.log(`  ⚠ SEC fetch error`); processed++; continue; }

    if (filingText.length < 200) {
      console.log(`  ⚠ Could not recover filing text — keeping as legacy`);
      processed++; continue;
    }

    // Company context + CDR
    let companyContext = '';
    try {
      const ctxRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000)
      });
      if (ctxRes.ok) {
        const ctxData = await ctxRes.json();
        const rec = ctxData.filings?.recent;
        if (rec?.form) {
          var parts = [];
          for (var ci = 0; ci < Math.min(8, rec.form.length); ci++) {
            var cf = (rec.form[ci] || '').toUpperCase().replace(/\/A$/, '');
            var cd = rec.filingDate[ci] || '';
            if (cf && cd) parts.push(cf + ' on ' + cd);
          }
          companyContext = 'Last 8 filings: ' + parts.join(', ') + '.';
        }
      }
      if (filingText.match(/purchase\s+agreement|defined\s+in\s+the|amends\s+the/i)) {
        const cdrResult = await resolveDefinedTerms(filingText, cik);
        if (cdrResult.context) {
          companyContext += '\n\nCROSS-DOCUMENT RESOLVED TERMS:\n' + cdrResult.context.slice(0, 1500);
        }
      }
    } catch {}

    // v3 LLM extraction
    const extraction = await extractFromFiling(
      filingText, item.display_name, item.ticker, formType, item.sector, companyContext
    );
    await sleep(2000);

    if (!extraction || !extraction.qualified) {
      confirmed++;
      console.log(`  ❌ Confirmed: no hidden angle (was correct to reject)`);
      await pg.query(
        `UPDATE opportunities SET engine_version='v3_rechecked', research_depth='deep', updated_at=NOW()
         WHERE id=$1`, [item.id]
      );
      processed++;
      continue;
    }

    // Qualified! Upgrade this item
    upgraded++;
    console.log(`  ✅ UPGRADED: found hidden angle!`);

    const ha = extraction.hiddenAngle;
    const facts = extraction.verifiedFacts || [];
    const title = extraction.insightTitle || (ha ? `${item.ticker}: ${ha.claim.slice(0, 80)}` : item.title);

    await pg.query(
      `UPDATE opportunities SET
         title=$1, summary=$2, verification_status='candidate',
         hidden_angle=$3, engine_version='v3_investigation', research_depth='deep',
         updated_at=NOW()
       WHERE id=$4`,
      [title, extraction.whyItMatters || '', ha ? JSON.stringify(ha) : null, item.id]
    );

    // Delete old claims and add new ones
    await pg.query(`DELETE FROM claims WHERE opportunity_id=$1 AND claim_type='verified_fact'`, [item.id]);
    for (let j = 0; j < facts.length; j++) {
      await pg.query(
        `INSERT INTO claims(id,opportunity_id,claim_type,text,confidence,evidence_item_ids,created_at)
         VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(id) DO NOTHING`,
        [`rf${j}_${item.id.slice(-10)}`, item.id, 'verified_fact', facts[j]?.slice(0, 500), 0.9, '[]']
      );
    }

    processed++;
    await sleep(1000); // Rate limit
  }

  console.log(`\n═══ Legacy Reprocessing Complete ═══`);
  console.log(`  Total:   ${legacy.rows.length} legacy items`);
  console.log(`  Upgraded:  ${upgraded} → candidate (found hidden angle on reanalysis)`);
  console.log(`  Confirmed: ${confirmed} → rejected (correctly classified)`);
  console.log(`  Skipped:   ${legacy.rows.length - processed} (could not refetch)`);
  console.log(`  Remaining legacy: ${legacy.rows.length - upgraded} (run again or manually review)`);

  await pg.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
