/**
 * Hidden Catalyst — AI Discovery Pipeline
 * 
 * Full end-to-end: SEC filing → LLM extraction → DB → scoring → publish
 * 
 * Uses DeepSeek to actually READ and UNDERSTAND 8-K filings.
 * Extracts: events, parties, dollar amounts, materiality, scenarios, risks.
 * 
 * Run: node scripts/ai-pipeline.js [batch_size=10]
 */
const { Client } = require('pg');
const { extractFromFiling, setApiKey } = require('../packages/engine/src/llm-extractor');

// ALL secrets from environment variables ONLY
const DB = process.env.DATABASE_URL;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const UA = process.env.SEC_USER_AGENT || 'Hidden Catalyst Research (contact@hiddencatalyst.com)';

if (!DB) { console.error('DATABASE_URL environment variable required'); process.exit(1); }
if (!DEEPSEEK_KEY) { console.error('DEEPSEEK_API_KEY environment variable required'); process.exit(1); }

setApiKey(DEEPSEEK_KEY);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Only material forms
const MATERIAL_FORMS = new Set(['8-K', '10-Q', '10-K', 'S-1', '13D', '13G']);
const SKIP_FORMS = new Set('3,4,5,3/A,4/A,144,N-PX,NPORT-P,N-CSR,N-CSRS,6-K,ARS,CERT,25,8-A12B,PX14A6G,S-8,424B2,FWP,25-NSE,SD'.split(','));

async function main() {
  const N = parseInt(process.argv[2]) || 10;
  const client = new Client({ connectionString: DB });
  await client.connect();
  console.log(`AI Discovery Pipeline — ${N} companies\n`);

  // Target: $100M-$10B, have CIK, no existing published opps
  // Sanity check: market_cap < 10000 means corrupted (price was stored as cap)
  const companies = await client.query(`
    SELECT c.id, c.cik, c.display_name, s.ticker, s.id as sec_id,
           COALESCE(NULLIF(s.market_cap, 0), 800000000) as mc
    FROM companies c JOIN securities s ON s.company_id = c.id
    WHERE c.cik IS NOT NULL AND s.active = true AND s.exchange IN ('NYSE','NASDAQ','NYSE American')
      AND s.market_cap IS NOT NULL AND s.market_cap > 10000
      AND s.market_cap BETWEEN 100000000 AND 10000000000
      AND NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.security_id = s.id AND o.status = 'published')
    ORDER BY s.market_cap ASC LIMIT $1
  `, [N]);

  console.log(`${companies.rows.length} candidates.\n`);

  let processed = 0, aiExtracted = 0, published = 0;

  for (const co of companies.rows) {
    const cik = String(co.cik).padStart(10, '0');
    const mc = co.mc;

    try {
      // ── Step 1: Fetch filing index ──
      const idxRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
      });
      if (!idxRes.ok) continue;

      const idx = await idxRes.json();
      const f = idx.filings?.recent;
      if (!f?.form) continue;

      // Find latest 8-K (best for LLM extraction)
      let bestIdx = -1, bestForm = '';
      for (let i = 0; i < Math.min(15, f.form.length); i++) {
        const fm = (f.form[i] || '').toUpperCase();
        if (fm === '8-K') { bestIdx = i; bestForm = '8-K'; break; }
        if (MATERIAL_FORMS.has(fm.replace(/\/A$/, '')) && !SKIP_FORMS.has(fm) && bestIdx < 0) {
          bestIdx = i; bestForm = fm.replace(/\/A$/, '');
        }
      }
      if (bestIdx < 0) continue;

      const acc = f.accessionNumber[bestIdx] || '';
      const dt = f.filingDate[bestIdx] || '';
      if (!dt || !acc) continue;

      // ── Step 2: Download actual filing text ──
      let filingText = '';
      if (bestForm === '8-K') {
        try {
          const accNoDash = acc.replace(/-/g, '');
          const txtUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDash}/${acc}.txt`;
          const txtRes = await fetch(txtUrl, {
            headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000)
          });
          if (txtRes.ok) {
            const fullText = await txtRes.text();
            // Extract narrative section (between <TEXT> tags)
            const textStart = fullText.indexOf('<TEXT>');
            if (textStart > 0) {
              filingText = fullText.slice(textStart + 6);
              // Strip HTML/XML tags
              filingText = filingText.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&\w+;/g, ' ');
              filingText = filingText.replace(/\s+/g, ' ').trim();
              // Keep enough for LLM but not too much
              filingText = filingText.slice(0, 10000);
            }
          }
        } catch (e) {
          console.log(`  ${co.ticker}: filing download failed — ${e.message.slice(0, 50)}`);
        }
      }

      // ── Step 3: LLM Extraction (only for 8-K with actual text) ──
      let extraction = null;
      if (bestForm === '8-K' && filingText.length > 200) {
        console.log(`  🤖 ${co.ticker}: analyzing 8-K (${filingText.length} chars)...`);
        extraction = await extractFromFiling(filingText, co.display_name, co.ticker, '8-K');
        if (extraction) aiExtracted++;
      }

      // ── Step 4: Build data from extraction (or fallback) ──
      const eventSummary = extraction?.eventSummary
        || `${co.display_name} filed ${bestForm} on ${dt}`;

      const materiality = extraction?.materialityScore
        || (bestForm === '8-K' ? 65 : bestForm === '10-K' ? 70 : 55);

      const claimText = extraction
        ? (extraction.verifiedFacts[0] || extraction.eventSummary).slice(0, 500)
        : `${co.ticker}: ${bestForm} filed ${dt}`;

      // ── V2 Scoring: multi-factor, penalizes megacaps ──
      // Information Asymmetry — market cap + coverage heuristics
      let mcScore;
      if (mc < 100e6) mcScore = 40;
      else if (mc < 300e6) mcScore = 38;
      else if (mc < 500e6) mcScore = 35;
      else if (mc < 1e9) mcScore = 30;
      else if (mc < 2e9) mcScore = 25;
      else if (mc < 5e9) mcScore = 18;
      else if (mc < 10e9) mcScore = 10;
      else if (mc < 50e9) mcScore = 5;
      else mcScore = 2;

      const infoAsym = Math.min(100, mcScore + 10 + 5 + 5); // + neutral analyst/inst/news

      // Evidence Quality — source-based
      const daysSince = Math.round((Date.now() - new Date(dt).getTime()) / 86400000);
      let evidenceQual = extraction ? 88 : 82;
      if (daysSince <= 3) evidenceQual += 3;
      else if (daysSince <= 7) evidenceQual += 0;
      else if (daysSince <= 14) evidenceQual -= 3;
      else evidenceQual -= 8;
      evidenceQual = Math.max(10, Math.min(100, evidenceQual));

      // Catalyst Strength — scaled by company size
      const mcScale = mc < 300e6 ? 1.3 : mc < 1e9 ? 1.1 : mc < 5e9 ? 1.0 : mc < 10e9 ? 0.85 : 0.7;
      const catalystStr = Math.round(Math.min(95, Math.max(30, 60 * mcScale)));

      // Financial Materiality
      const finMateriality = Math.round(Math.min(95, Math.max(25, 55 * mcScale)));

      // Timing
      const timing = daysSince <= 1 ? 95 : daysSince <= 3 ? 85 : daysSince <= 7 ? 70 : daysSince <= 14 ? 50 : 30;

      // Price Reaction — default if no market data
      const priceReaction = mc < 2e9 ? 75 : mc < 10e9 ? 60 : 40;

      // Risk & Liquidity
      const riskScore = mc < 100e6 ? 60 : mc < 300e6 ? 50 : mc < 1e9 ? 40 : mc < 5e9 ? 30 : 20;
      const liquidityPenalty = mc < 100e6 ? 35 : mc < 300e6 ? 20 : mc < 1e9 ? 10 : 0;

      // V2 Formula: 0.25*asym + 0.20*catalyst + 0.20*evidence + 0.15*materiality + 0.10*timing + 0.10*priceReact - 0.10*risk - 0.05*liquidity
      const oppScore = Math.round(Math.max(5, Math.min(98,
        0.25 * infoAsym + 0.20 * catalystStr + 0.20 * evidenceQual +
        0.15 * finMateriality + 0.10 * timing + 0.10 * priceReaction -
        0.10 * riskScore - 0.05 * liquidityPenalty
      )));

      // ── Step 5: Store in DB ──
      const hash = 'ai_' + cik + '_' + acc.replace(/-/g, '').slice(0, 16);
      const title = extraction
        ? `${co.display_name} (${co.ticker}): ${extraction.eventSummary.slice(0, 80)}`
        : `${co.display_name} (${co.ticker}) — ${bestForm}`;

      const summary = extraction
        ? `[AI Analysis] ${co.display_name} (${co.ticker}) filed 8-K on ${dt}. ${extraction.eventSummary} Materiality: ${materiality}/100.`
        : `${co.display_name} (${co.ticker}) filed ${bestForm} on ${dt}.`;

      try {
        // Document
        await client.query(
          `INSERT INTO documents(id,source_id,canonical_url,published_at,retrieved_at,content_hash,title,text,created_at) 
           VALUES($1,'source_sec_edgar',$2,$3,NOW(),$4,$5,$6,NOW()) ON CONFLICT(content_hash) DO NOTHING`,
          ['d_' + hash, `https://www.sec.gov/cgi-bin/browse-edgar?CIK=${cik}`, dt, hash, title, summary]
        );

        // Evidence
        await client.query(
          `INSERT INTO evidence_items(id,document_id,excerpt,evidence_type,quality_score,created_at) 
           VALUES($1,$2,$3,'primary',$4,NOW()) ON CONFLICT(id) DO NOTHING`,
          ['e_' + hash, 'd_' + hash, claimText.slice(0, 500), evidenceQual]
        );

        // Opportunity
        await client.query(
          `INSERT INTO opportunities(id,security_id,title,summary,status,detected_at,created_at,updated_at) 
           VALUES($1,$2,$3,$4,'candidate',$5,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`,
          ['o_' + hash, co.sec_id, title, summary, dt]
        );

        // Verified fact claim
        await client.query(
          `INSERT INTO claims(id,opportunity_id,claim_type,text,confidence,evidence_item_ids,created_at) 
           VALUES($1,$2,'verified_fact',$3,$4,$5,NOW()) ON CONFLICT(id) DO NOTHING`,
          ['cf_' + hash, 'o_' + hash, (extraction?.verifiedFacts[0] || claimText).slice(0, 500),
            extraction?.confidence || 0.9, JSON.stringify(['e_' + hash])]
        );

        // Inference claims from LLM
        if (extraction?.inferences) {
          for (let i = 0; i < extraction.inferences.length; i++) {
            const inf = extraction.inferences[i];
            await client.query(
              `INSERT INTO claims(id,opportunity_id,claim_type,text,confidence,evidence_item_ids,created_at) 
               VALUES($1,$2,'inference',$3,$4,$5,NOW()) ON CONFLICT(id) DO NOTHING`,
              [`ci${i}_${hash}`, 'o_' + hash, inf.text, inf.confidence, JSON.stringify(['e_' + hash])]
            );
          }
        }

        // Scores (v2)
        const scoreRows = [
          ['opportunity', oppScore], ['information_asymmetry', infoAsym],
          ['catalyst_strength', catalystStr], ['evidence_quality', evidenceQual],
          ['financial_materiality', finMateriality], ['timing', timing],
          ['price_reaction', priceReaction], ['risk', riskScore],
        ];
        for (const [t, v] of scoreRows) {
          await client.query(
            `INSERT INTO scores(id,opportunity_id,score_type,value,factors,model_version,calculated_at) 
             VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(id) DO NOTHING`,
            ['s_' + t + '_' + hash, 'o_' + hash, t, v,
              JSON.stringify({ mc, aiExtracted: !!extraction, model: 'deepseek-chat' }), '3.0.0']
          );
        }

        // Overlooked reasons
        const reasons = extraction?.overlookedReasons || [
          `Market cap of ${formatMC(mc)} suggests limited analyst coverage`,
          `8-K filing — unscheduled disclosure may precede analyst coverage`,
          `SEC EDGAR primary source — may not be covered by financial media`
        ];
        for (let i = 0; i < reasons.length; i++) {
          await client.query(
            `INSERT INTO risks(id,opportunity_id,risk_type,severity,description,created_at) 
             VALUES($1,$2,$3,'low',$4,NOW()) ON CONFLICT(id) DO NOTHING`,
            [`olr_${i}_${hash}`, 'o_' + hash, `overlooked_reason_${i + 1}`, reasons[i]]
          );
        }

        // Risk flags from LLM
        if (extraction?.riskFlags) {
          for (const rf of extraction.riskFlags) {
            await client.query(
              `INSERT INTO risks(id,opportunity_id,risk_type,severity,description,created_at) 
               VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(id) DO NOTHING`,
              [`rf_${rf.type}_${hash}`, 'o_' + hash, rf.type, rf.severity, rf.description]
            );
          }
        }

        // Auto-publish if passes gates
        if (evidenceQual >= 75 && riskScore <= 60) {
          await client.query("UPDATE opportunities SET status='published',published_at=NOW() WHERE id=$1", ['o_' + hash]);
          published++;
        }

        processed++;
        if (extraction) {
          console.log(`  ✅ ${co.ticker}: score ${oppScore} | ${extraction.eventType} | "${extraction.eventSummary.slice(0, 60)}..."`);
        } else {
          console.log(`  📄 ${co.ticker}: score ${oppScore} | ${bestForm} (no LLM — insufficient text)`);
        }

      } catch (e) { /* duplicate */ }

      // Rate limits: DeepSeek + SEC
      await sleep(1500);

    } catch (e) {
      console.log(`  ⚠ ${co.ticker}: ${e.message.slice(0, 60)}`);
    }
  }

  // ── Final report ──
  console.log(`\n═══════ AI Pipeline Complete ═══════`);
  console.log(`Processed: ${processed} | AI extraction: ${aiExtracted} | Published: ${published}`);

  const counts = await client.query("SELECT status, COUNT(*) as n FROM opportunities GROUP BY status ORDER BY status");
  console.log('\nStatus breakdown:');
  counts.rows.forEach(r => console.log(`  ${r.status}: ${r.n}`));

  // Show top AI-discovered opportunities
  const top = await client.query(`
    SELECT o.title, s.value as score, o.summary
    FROM opportunities o JOIN scores s ON s.opportunity_id = o.id AND s.score_type = 'opportunity'
    WHERE o.status = 'published' AND s.factors::text LIKE '%deepseek-chat%'
    ORDER BY s.value DESC LIMIT 8
  `);

  if (top.rows.length > 0) {
    console.log('\n═══ AI-Discovered Opportunities ═══');
    top.rows.forEach((r, i) => {
      console.log(`\n${i + 1}. [${r.score}] ${r.title.slice(0, 70)}`);
      console.log(`   ${(r.summary || '').slice(0, 150)}`);
    });
  }

  await client.end();
  process.exit(0);
}

function formatMC(val) {
  if (val >= 1e12) return '$' + (val / 1e12).toFixed(1) + 'T';
  if (val >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return '$' + (val / 1e6).toFixed(0) + 'M';
  return '$' + val;
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
