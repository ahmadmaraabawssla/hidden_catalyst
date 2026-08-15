/**
 * Attention backfill — populate security.attributes.news_7d for the universe.
 *
 * "news_7d" is the number of news articles about a company in the last 7 days.
 * It is the primary input to computeIgnoredScore(), which decides which
 * companies are worth the expensive AI deep-research pass.
 *
 * FMP Starter ($19/mo) includes the api/v3 /stock_news endpoint (used by the
 * existing catalyst-attention engine). Analyst-count and institutional-ownership
 * endpoints require a higher tier, so those are left null (computeIgnoredScore
 * handles missing data gracefully).
 *
 * Usage (bounded for testing):
 *   LIMIT=50 node scripts/backfill-attention.js
 * Usage (full):
 *   node scripts/backfill-attention.js
 *
 * Resumable: skips securities that already have attributes.news_7d.
 */

const { Client } = require('pg');

const DB = process.env.DATABASE_URL;
const KEY = process.env.FMP_API_KEY;
const FMP_NEWS = 'https://financialmodelingprep.com/api/v3/stock_news';
const LIMIT = Number(process.env.LIMIT || 100000);
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

if (!DB) { console.error('DATABASE_URL required'); process.exit(1); }
if (!KEY) { console.error('FMP_API_KEY required'); process.exit(1); }

async function news7d(ticker) {
  try {
    const res = await fetch(`${FMP_NEWS}?tickers=${ticker}&limit=50&apikey=${KEY}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    const weekAgo = Date.now() - 7 * 86400000;
    let count = 0;
    for (const item of data) {
      const d = item.publishedDate ? new Date(item.publishedDate).getTime() : 0;
      if (d > weekAgo) count++;
    }
    return count;
  } catch {
    return null;
  }
}

async function main() {
  const c = new Client({ connectionString: DB });
  await c.connect();

  const res = await c.query(`
    SELECT s.id, s.ticker
    FROM securities s
    WHERE s.active = true
      AND s.exchange IN ('NYSE','NASDAQ','NYSE American')
      AND s.market_cap IS NOT NULL
      AND s.market_cap >= 10000000
      AND s.market_cap <= 20000000000
      AND (s.attributes->>'news_7d') IS NULL
    ORDER BY s.market_cap ASC
    LIMIT $1
  `, [LIMIT]);

  console.log(`Backfilling news_7d for ${res.rows.length} securities...`);
  let done = 0, fetched = 0, skipped = 0;

  for (const row of res.rows) {
    const count = await news7d(row.ticker);
    if (count == null) {
      skipped++;
    } else {
      await c.query(
        `UPDATE securities SET attributes = COALESCE(attributes,'{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify({ news_7d: count }), row.id]
      );
      fetched++;
    }
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${res.rows.length} (${fetched} fetched, ${skipped} failed)`);
    await SLEEP(250); // ~240 req/min, under the 300/min Starter limit
  }

  console.log(`\nDone: ${fetched} fetched, ${skipped} failed, ${done} total`);
  await c.end();
}

main().catch(async (e) => {
  console.error(e);
  try { process.exit(1); } catch {}
});
