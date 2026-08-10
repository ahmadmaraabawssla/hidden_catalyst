// FMP enrich — uses historical-market-capitalization and company profile
const { Client } = require('pg');
const DB = process.env.DATABASE_URL;
const KEY = process.env.FMP_API_KEY;
const F = 'https://financialmodelingprep.com/stable';

async function fmp(path) {
  try {
    const sep = path.includes('?') ? '&' : '?';
    const r = await fetch(F + path + sep + 'apikey=' + KEY, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function main() {
  const c = new Client({ connectionString: DB });
  await c.connect();

  // Only enrich tickers with missing or corrupted market caps (price values < $10K)
  // Skip manually overridden ones
  const tkrs = await c.query(
    `SELECT DISTINCT s.ticker, s.id
     FROM opportunities o
     JOIN securities s ON s.id = o.security_id
     WHERE o.status = 'published'
       AND (s.market_cap IS NULL OR s.market_cap < 10000)
       AND (s.attributes->>'mc_manual' IS NULL OR s.attributes->>'mc_manual' != 'true')`
  );
  console.log('Enriching ' + tkrs.rows.length + ' tickers (missing/corrupted caps)...\n');

  for (const t of tkrs.rows) {
    const [histMc, profile, grades, consensus] = await Promise.all([
      fmp('/historical-market-capitalization?symbol=' + t.ticker + '&limit=1'),
      fmp('/profile?symbol=' + t.ticker),
      fmp('/grades?symbol=' + t.ticker + '&limit=100'),
      fmp('/grades-consensus?symbol=' + t.ticker),
    ]);

    var mc = null, price = null;
    if (Array.isArray(histMc) && histMc.length > 0) mc = histMc[0].marketCap || null;
    if (Array.isArray(profile) && profile.length > 0) {
      price = profile[0].price || null;
      if (mc == null) mc = profile[0].marketCap || null;
    }

    var attrs = {};
    if (Array.isArray(grades) && grades.length > 0) {
      var firms = new Set(grades.map(function(g) { return g.gradingCompany; }).filter(Boolean));
      attrs.analyst_count = firms.size;
    }
    if (consensus && !Array.isArray(consensus) && Object.keys(consensus).length > 0) {
      var item = Array.isArray(consensus) ? consensus[0] : consensus;
      attrs.consensus_buy = (item.strongBuy || 0) + (item.buy || 0);
      attrs.consensus_hold = item.hold || 0;
      attrs.consensus_sell = (item.sell || 0) + (item.strongSell || 0);
    }

    var updates = [];
    if (mc != null) updates.push("market_cap = " + mc + ", latest_price = " + (price || 0) + ", updated_at = NOW()");
    if (Object.keys(attrs).length > 0) {
      var safe = JSON.stringify(attrs).replace(/'/g, "''");
      updates.push("attributes = COALESCE(attributes, '{}'::jsonb) || '" + safe + "'::jsonb");
    }
    if (updates.length > 0) await c.query("UPDATE securities SET " + updates.join(', ') + " WHERE id = $1", [t.id]);

    var a = attrs.analyst_count != null ? String(attrs.analyst_count) : '?';
    var cap = mc ? (mc / 1e9).toFixed(1) + 'B' : 'no cap';
    console.log('  ' + t.ticker.padEnd(8) + cap.padStart(10) + ' | analysts: ' + a.padStart(3));
  }

  // Show tickers that still have no market cap
  const uncapped = await c.query(
    `SELECT ticker, market_cap FROM securities s
     JOIN opportunities o ON o.security_id = s.id
     WHERE o.status = 'published' AND s.market_cap IS NULL`
  );
  if (uncapped.rows.length > 0) {
    console.log('\nStill missing market caps:');
    uncapped.rows.forEach(function(r) {
      console.log('  ' + r.ticker.padEnd(8) + 'no cap (needs manual)');
    });
  }

  await c.end();
}

main().catch(function(e) { console.error(e.message); process.exit(1); });
