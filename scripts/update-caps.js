/**
 * update-caps.js — Dual-source market cap pipeline
 *
 * PRIMARY:   FMP historical-market-capitalization (daily exchange feed)
 * FALLBACK:  FMP profile (price × outstandingShares)
 * SANITY:    Cross-validate against price × floatShares, price × dilShares
 *
 * Strategy:
 *  1. If hist-mkt-cap > 0, trust it (independent daily feed)
 *  2. If floatShares > outstandingShares, FMP share data is corrupted →
 *     use max(hist-mkt-cap, price × floatShares, price × dilShares)
 *  3. If all sources diverge >50%, flag for review
 *
 * Run: node scripts/update-caps.js
 */

const { Client } = require('pg');
const DB = process.env.DATABASE_URL;
const KEY = process.env.FMP_API_KEY;
const F = 'https://financialmodelingprep.com/stable';

if (!DB) { console.error('DATABASE_URL required'); process.exit(1); }
if (!KEY) { console.error('FMP_API_KEY required'); process.exit(1); }

async function fmp(path) {
  try {
    const sep = path.includes('?') ? '&' : '?';
    const r = await fetch(F + path + sep + 'apikey=' + KEY, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

function arrVal(arr, idx) {
  return (Array.isArray(arr) && arr.length > 0) ? arr[0] : null;
}

async function resolveMarketCap(ticker) {
  // Fetch 4 sources in parallel
  const [histMc, profile, shsFloat, income] = await Promise.all([
    fmp('/historical-market-capitalization?symbol=' + ticker + '&limit=1'),
    fmp('/profile?symbol=' + ticker),
    fmp('/shares-float?symbol=' + ticker),
    fmp('/income-statement?symbol=' + ticker + '&limit=1'),
  ]);

  const hmc = arrVal(histMc);
  const prof = arrVal(profile);
  const sf = arrVal(shsFloat);
  const inc = arrVal(income);

  const price = (prof && prof.price) ? prof.price : 0;
  if (!price || price <= 0) return { mc: null, source: 'none', warning: 'no price' };

  const histMcVal = (hmc && hmc.marketCap) ? hmc.marketCap : 0;
  const profMcVal = (prof && prof.marketCap) ? prof.marketCap : 0;

  // Computed caps from alternative share counts
  const outMc = (sf && sf.outstandingShares && price) ? price * sf.outstandingShares : 0;
  const floatMc = (sf && sf.floatShares && price) ? price * sf.floatShares : 0;
  const dilMc = (inc && inc.weightedAverageShsOutDil && price) ? price * inc.weightedAverageShsOutDil : 0;

  // Check if FMP share data is corrupted (float can't exceed outstanding)
  var shareDataCorrupted = false;
  if (sf && sf.outstandingShares && sf.floatShares && sf.floatShares > sf.outstandingShares) {
    shareDataCorrupted = true;
  }

  // Resolve: PRIMARY = hist-mkt-cap, FALLBACK = profile
  var mc = null, source = 'unknown';

  if (histMcVal > 0) {
    mc = histMcVal;
    source = 'fmp-hist-mkt-cap';
  } else if (profMcVal > 0) {
    mc = profMcVal;
    source = 'fmp-profile';
  }

  // If share data is corrupted, take the maximum credible value
  if (shareDataCorrupted) {
    const candidates = [histMcVal, profMcVal, floatMc, dilMc].filter(function(v) { return v > 0; });
    mc = Math.max.apply(null, candidates);
    source = 'fmp-corrected';
  }

  // If all sources are within 20% of each other, confidence is high
  var confidence = 'low';
  if (histMcVal > 0 && profMcVal > 0) {
    const ratio = Math.max(histMcVal, profMcVal) / Math.min(histMcVal, profMcVal);
    if (ratio < 1.10) confidence = 'high';
    else if (ratio < 1.30) confidence = 'medium';
  }

  return {
    mc: mc ? Math.round(mc) : null,
    source: source,
    confidence: confidence,
    price: price,
    shareDataCorrupted: shareDataCorrupted,
    histMcVal: histMcVal,
    profMcVal: profMcVal,
    outMc: outMc,
    floatMc: floatMc,
    dilMc: dilMc,
  };
}

async function main() {
  const client = new Client({ connectionString: DB });
  await client.connect();

  const secs = await client.query(`
    SELECT s.id, s.ticker, s.market_cap as old_mc
    FROM securities s
    WHERE s.active = true AND s.exchange IN ('NYSE','NASDAQ','NYSE American')
      AND s.ticker NOT LIKE '%.%'
    ORDER BY s.updated_at ASC NULLS FIRST
    LIMIT 500
  `);

  console.log('Dual-source market cap pipeline — ' + secs.rows.length + ' tickers\n');

  var updated = 0, fixed = 0, flagged = 0;
  for (const s of secs.rows) {
    const result = await resolveMarketCap(s.ticker);

    if (result.mc && result.mc > 0) {
      const oldMc = s.old_mc || 0;
      const newMc = result.mc;

      // Only update if changed significantly (>5%) or was null
      if (oldMc === 0 || Math.abs(newMc - oldMc) / oldMc > 0.05) {
        await client.query(
          'UPDATE securities SET market_cap = $1, latest_price = $2, updated_at = NOW() WHERE id = $3',
          [newMc, result.price, s.id]
        );
        updated++;

        const pct = oldMc > 0 ? (((newMc - oldMc) / oldMc * 100).toFixed(0) + '%') : 'new';
        const arrow = oldMc > 0 ? (newMc > oldMc ? ' → ' : ' ← ') : ' = ';
        console.log(
          '  ' + s.ticker.padEnd(8) +
          (oldMc > 0 ? ('$' + (oldMc / 1e9).toFixed(2) + 'B').padStart(12) : '       NULL') +
          arrow +
          ('$' + (newMc / 1e9).toFixed(2) + 'B').padStart(12) +
          ' [' + result.source + ']' +
          (result.shareDataCorrupted ? ' ⚠ CORRUPTED' : '') +
          ' conf:' + result.confidence
        );

        if (result.shareDataCorrupted) flagged++;
        if (oldMc > 0 && Math.abs(newMc - oldMc) / oldMc > 0.20) fixed++;
      }
    }

    if (updated % 50 === 0 && updated > 0) {
      console.log('  ... ' + updated + ' updated, ' + fixed + ' fixed, ' + flagged + ' flagged');
    }
    await new Promise(function(r) { setTimeout(r, 250); });
  }

  console.log('\nUpdated: ' + updated + ' | Fixed >20%: ' + fixed + ' | Corrupted: ' + flagged);

  const cnt = await client.query('SELECT COUNT(*) FROM securities WHERE market_cap IS NOT NULL');
  const ranges = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE market_cap < 100000000) as nano,
      COUNT(*) FILTER (WHERE market_cap BETWEEN 100000000 AND 300000000) as micro,
      COUNT(*) FILTER (WHERE market_cap BETWEEN 300000000 AND 2000000000) as small,
      COUNT(*) FILTER (WHERE market_cap BETWEEN 2000000000 AND 10000000000) as mid,
      COUNT(*) FILTER (WHERE market_cap > 10000000000) as large
    FROM securities WHERE market_cap IS NOT NULL
  `);
  const r = ranges.rows[0];
  console.log('\nTotal with caps: ' + cnt.rows[0].count);
  console.log('  <$100M:    ' + r.nano);
  console.log('  $100-300M: ' + r.micro);
  console.log('  $300M-2B:  ' + r.small);
  console.log('  $2-10B:    ' + r.mid);
  console.log('  >$10B:     ' + r.large);

  await client.end();
  process.exit(0);
}

main().catch(function(e) { console.error(e.message); process.exit(1); });
