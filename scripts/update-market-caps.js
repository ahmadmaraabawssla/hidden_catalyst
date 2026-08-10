/**
 * Auto Market Cap Updater — fetches real-time PRICES from Yahoo Finance.
 * NOTE: Yahoo chart API does NOT return market cap — only price/volume.
 * For market caps, use fmp-updater.js (Financial Modeling Prep).
 *
 * Run: node scripts/update-market-caps.js [batch_size=50]
 * Best run periodically (daily/weekly) to keep price values current.
 */
const { Client } = require('pg');
const DB = process.env.DATABASE_URL;
if (!DB) { console.error('DATABASE_URL required'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchQuote(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const d = await res.json();
    const meta = d?.chart?.result?.[0]?.meta;
    if (!meta || !meta.regularMarketPrice) return null;
    return {
      price: meta.regularMarketPrice,
      // Yahoo chart API does NOT include market cap — use FMP for that
    };
  } catch {
    return null;
  }
}

async function main() {
  const N = parseInt(process.argv[2]) || 50;
  const client = new Client({ connectionString: DB });
  await client.connect();

  // Get securities that need updating (oldest first, or null market caps first)
  const secs = await client.query(`
    SELECT id, ticker, market_cap
    FROM securities
    WHERE active = true AND exchange IN ('NYSE','NASDAQ','NYSE American')
      AND ticker NOT LIKE '%.%'
    ORDER BY market_cap IS NULL DESC, updated_at ASC NULLS FIRST
    LIMIT $1
  `, [N]);

  console.log(`Updating prices for ${secs.rows.length} securities...\n`);

  let updated = 0, failed = 0;
  for (const s of secs.rows) {
    const q = await fetchQuote(s.ticker);
    if (q && q.price > 0) {
      // Only update price — market cap comes from FMP
      await client.query(
        'UPDATE securities SET latest_price = $1, latest_price_date = NOW(), updated_at = NOW() WHERE id = $2',
        [q.price, s.id]
      );
      updated++;
      if (updated % 20 === 0) console.log(`  ${updated}/${secs.rows.length} updated...`);
    } else {
      failed++;
    }
    await sleep(300); // Rate limit: ~3 requests/sec
  }

  console.log(`\nDone! ${updated} updated, ${failed} failed.`);

  const cnt = await client.query("SELECT COUNT(*) FROM securities WHERE market_cap IS NOT NULL");
  const inRange = await client.query("SELECT COUNT(*) FROM securities WHERE market_cap BETWEEN 100000000 AND 5000000000");
  console.log(`${cnt.rows[0].count} total with market caps, ${inRange.rows[0].count} in $100M-$5B discovery range.`);

  await client.end();
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
