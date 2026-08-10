/**
 * Stale Cap Check — fixes screener caps that are stale due to recent mergers.
 * Compares screener-implied shares vs latest income statement diluted shares.
 * Run: node scripts/stale-cap-check.js
 */
const { Client } = require('pg');
const DB = process.env.DATABASE_URL;
const KEY = process.env.FMP_API_KEY;
if (!DB || !KEY) { console.error('env required'); process.exit(1); }

const SLEEP = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const c = new Client({ connectionString: DB });
  await c.connect();

  const opps = await c.query(`
    SELECT DISTINCT s.ticker, s.id as sec_id, s.market_cap, s.latest_price
    FROM securities s JOIN opportunities o ON o.security_id = s.id
    WHERE o.status = 'published'
      AND s.market_cap IS NOT NULL
      AND (s.attributes->>'mc_manual' IS NULL OR s.attributes->>'mc_manual' != 'true')
  `);

  console.log(`Checking ${opps.rows.length} opps for stale caps...`);
  let fixed = 0;

  for (const op of opps.rows) {
    try {
      const ir = await fetch(
        `https://financialmodelingprep.com/stable/income-statement?symbol=${op.ticker}&period=quarter&limit=1&apikey=${KEY}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const inc = await ir.json();
      if (!Array.isArray(inc) || inc.length === 0) continue;

      const q = inc[0];
      const dil = q.weightedAverageShsOutDil || 0;
      if (dil <= 0 || op.latest_price <= 0) continue;

      const scrShares = op.market_cap / op.latest_price;
      const diff = Math.abs(scrShares - dil) / dil;
      const filingDate = q.filingDate || q.date || '1970-01-01';
      const daysSince = Math.round((Date.now() - new Date(filingDate).getTime()) / 86400000);

      // Flag: screener basic vs latest diluted differs by > 15% and filing > 30 days
      if (diff > 0.15 && daysSince > 30) {
        const realMc = dil * op.latest_price;
        await c.query(
          `UPDATE securities SET market_cap=$1, updated_at=NOW(),
               attributes = COALESCE(attributes,'{}'::jsonb) || '{"mc_auto":true,"mc_note":"post-corp-action, uses diluted"}'::jsonb
           WHERE id=$2`,
          [realMc, op.sec_id]
        );
        console.log(`  ${op.ticker.padEnd(6)} ${Math.round(scrShares / 1e6)}M → ${Math.round(dil / 1e6)}M dil  $${(op.market_cap/1e9).toFixed(1)}B → $${(realMc/1e9).toFixed(1)}B  (${daysSince}d since filing)`);
        fixed++;
      }
    } catch (e) { /* skip */ }
    await SLEEP(250);
  }

  console.log(`\n${fixed} stale caps fixed (corporate actions since last filing)`);
  await c.end();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
