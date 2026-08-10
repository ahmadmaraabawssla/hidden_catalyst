/**
 * Bootstraps the database with ALL real U.S. public companies.
 * 
 * Sources:
 * - SEC company_tickers.json (free, no key)
 * - SEC company_tickers_exchange.json 
 * 
 * Then the connectors watch everything and the scoring engine
 * surfaces the best opportunities automatically.
 */

const { Client } = require('pg');
const DB = process.env.DATABASE_URL;
if (!DB) { console.error('DATABASE_URL required'); process.exit(1); }

async function bootstrap() {
  const client = new Client({ connectionString: DB });
  await client.connect();
  console.log('Connected to Supabase.\n');

  // 1. Fetch ALL SEC-registered companies (free JSON, no API key)
  console.log('Fetching SEC company list...');
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': 'Hidden Catalyst Research contact@hiddencatalyst.com' }
  });

  if (!res.ok) {
    console.error('SEC API returned', res.status);
    process.exit(1);
  }

  const raw = await res.json();
  // SEC format: { "0": { cik_str, ticker, title }, "1": { ... } }
  const companies = Object.values(raw);
  console.log(`Found ${companies.length} total SEC-registered companies.\n`);

  // 2. Filter to likely small-caps (we'll fetch market cap later via Yahoo Finance)
  // For now, insert ALL of them — the market data updater will fill in market caps
  let added = 0, skipped = 0;

  for (const c of companies) {
    const ticker = (c.ticker || '').toUpperCase();
    const cik = String(c.cik_str || '').padStart(10, '0');
    const name = c.title || 'Unknown';

    if (!ticker || !cik) {
      skipped++;
      continue;
    }

    try {
      // Insert company
      await client.query(`
        INSERT INTO companies (id, legal_name, display_name, cik, status, created_at, updated_at) VALUES
        ($1, $2, $2, $3, 'active', NOW(), NOW())
        ON CONFLICT (cik) DO UPDATE SET display_name = $2, updated_at = NOW()
      `, [`company_${cik}`, name, cik]);

      // Insert security
      await client.query(`
        INSERT INTO securities (id, company_id, ticker, exchange, active, created_at, updated_at) VALUES
        ($1, $2, $3, 'NASDAQ', true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [`sec_${cik}`, `company_${cik}`, ticker]);

      added++;
    } catch (e) {
      skipped++;
    }

    if (added % 500 === 0) {
      console.log(`  Progress: ${added} companies added...`);
    }
  }

  console.log(`\nDone! ${added} companies added, ${skipped} skipped.\n`);

  // 3. Now fetch exchange listings for more accurate exchange data
  console.log('Fetching exchange listings...');
  try {
    const xres = await fetch('https://www.sec.gov/files/company_tickers_exchange.json', {
      headers: { 'User-Agent': 'Hidden Catalyst Research contact@hiddencatalyst.com' }
    });
    if (xres.ok) {
      const xdata = await xres.json();
      const fields = xdata.fields || [];
      const data = xdata.data || [];
      const tickerIdx = fields.indexOf('ticker');
      const exchangeIdx = fields.indexOf('exchange');

      let updated = 0;
      for (const row of data) {
        const ticker = row[tickerIdx]?.toUpperCase();
        const exchange = row[exchangeIdx];
        if (ticker && exchange) {
          try {
            await client.query(
              'UPDATE securities SET exchange = $1, updated_at = NOW() WHERE ticker = $2',
              [exchange, ticker]
            );
            updated++;
          } catch {}
        }
      }
      console.log(`  Updated ${updated} exchange listings.\n`);
    }
  } catch (e) {
    console.log('  Exchange data fetch failed (non-critical):', e.message);
  }

  // 4. Count what we have
  const counts = await client.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN market_cap BETWEEN 100000000 AND 10000000000 THEN 1 END) as small_mid_cap,
      COUNT(CASE WHEN avg_dollar_volume >= 1000000 THEN 1 END) as liquid
    FROM securities WHERE active = true
  `);

  console.log('Database stats:');
  console.log(`  Total companies: ${counts.rows[0].total}`);
  console.log(`  In $100M-$10B range: ${counts.rows[0].small_mid_cap}`);
  console.log(`  Liquid (>$1M avg volume): ${counts.rows[0].liquid}`);
  console.log('\nNext step: run market cap + price updater to fill in market caps and volumes.');
  console.log('  node scripts/fmp-updater.js');

  await client.end();
  process.exit(0);
}

bootstrap().catch(e => { console.error(e.message); process.exit(1); });
