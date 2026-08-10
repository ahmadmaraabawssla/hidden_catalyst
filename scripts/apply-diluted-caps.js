/**
 * Fill & fix market caps for published opportunities.
 * 1. Fills NULL caps from FMP screener
 * 2. Replaces screener basic shares with diluted shares from income statement
 * 3. Skips mc_manual tickers
 * Run: node scripts/apply-diluted-caps.js
 */
const { Client } = require('pg');
const DB = process.env.DATABASE_URL;
const KEY = process.env.FMP_API_KEY;
if (!DB || !KEY) { console.error('DATABASE_URL + FMP_API_KEY required'); process.exit(1); }

const SLEEP = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const c = new Client({ connectionString: DB });
  await c.connect();

  // Step 1: Load screener into memory
  console.log('Loading FMP screener...');
  const all = [];
  for (let p = 0; p < 9; p++) {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/company-screener?marketCapLowerThan=100000000000000&country=US&isActivelyTrading=true&isEtf=false&isFund=false&limit=1000&page=${p}&apikey=${KEY}`
    );
    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
  }
  const bySymbol = new Map();
  for (const x of all) {
    if (x.symbol && x.marketCap && x.marketCap <= 3e12) {
      bySymbol.set(x.symbol.toUpperCase(), { mc: x.marketCap, price: x.price || 0 });
    }
  }
  console.log(`Indexed ${bySymbol.size} stocks.\n`);

  // Step 2: Get published opps
  const opps = await c.query(`
    SELECT s.ticker, s.id as sec_id, s.market_cap, s.latest_price
    FROM securities s JOIN opportunities o ON o.security_id = s.id
    WHERE o.status = 'published'
      AND (s.attributes->>'mc_manual' IS NULL OR s.attributes->>'mc_manual' != 'true')
  `);

  console.log(`Fixing ${opps.rows.length} published opps...\n`);
  let filled = 0, diluted = 0, ok = 0;

  for (const op of opps.rows) {
    const sym = bySymbol.get(op.ticker);
    let mc = op.market_cap || 0;
    const price = op.latest_price || (sym ? sym.price : 0);
    let source = '';

    // Fill from screener if NULL
    if (!mc && sym) {
      mc = sym.mc;
      filled++;
      source = 'screener';
    }
    if (mc <= 0 || price <= 0) continue;

    // Check diluted shares from income statement
    try {
      const ir = await fetch(
        `https://financialmodelingprep.com/stable/income-statement?symbol=${op.ticker}&period=quarter&limit=1&apikey=${KEY}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const inc = await ir.json();
      if (Array.isArray(inc) && inc[0]) {
        const diluted = inc[0].weightedAverageShsOutDil || inc[0].weightedAverageShsOut || 0;
        if (diluted > 0) {
          const scrShares = mc / price;
          const diff = Math.abs(scrShares - diluted) / diluted;
          if (diff > 0.05) {
            mc = diluted * price;
            source = source ? source + '+diluted' : 'diluted';
            diluted++;
          } else {
            source = source || 'ok';
            ok++;
          }
        }
      }
    } catch (e) { /* keep screener value */ }

    if (mc > 0) {
      await c.query(
        `UPDATE securities SET market_cap = $1, latest_price = $2, updated_at = NOW(),
             attributes = COALESCE(attributes,'{}'::jsonb) || $3::jsonb
         WHERE id = $4`,
        [mc, price, JSON.stringify({ mc_source: source }), op.sec_id]
      );
      const shares = (mc / price / 1e6).toFixed(0);
      console.log(`  ${op.ticker.padEnd(6)} ${'$'+(mc/1e9).toFixed(2)+'B'.padEnd(10)} ${shares}M sh  ${source}`);
    }
    await SLEEP(300);
  }

  console.log(`\n${filled} filled from screener, ${diluted} corrected to diluted, ${ok} already correct`);
  await c.end();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
