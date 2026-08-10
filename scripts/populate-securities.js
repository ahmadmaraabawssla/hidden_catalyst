const { Client } = require('pg');
const SEC_URL = 'https://www.sec.gov/files/company_tickers.json';
const UA = 'Hidden Catalyst contact@hiddencatalyst.com';
const DB = process.env.DATABASE_URL;
if (!DB) { console.error('DATABASE_URL required'); process.exit(1); }

async function main() {
  const c = new Client({ connectionString: DB });
  await c.connect();

  // Check current state
  const companiesCount = await c.query('SELECT COUNT(*) FROM companies');
  const securitiesCount = await c.query('SELECT COUNT(*) FROM securities');
  console.log(`Companies: ${companiesCount.rows[0].count}, Securities: ${securitiesCount.rows[0].count}`);

  // Fetch SEC data and populate securities
  const res = await fetch(SEC_URL, { headers: { 'User-Agent': UA } });
  const data = await res.json();
  const all = Object.values(data);

  // Deduplicate by CIK, keep only valid tickers (1-5 uppercase letters)
  const seen = new Map();
  for (const x of all) {
    const cik = String(x.cik_str || '').padStart(10, '0');
    const ticker = (x.ticker || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (ticker.length >= 1 && ticker.length <= 5 && !seen.has(cik)) {
      // Use actual exchange from SEC data, default to NASDAQ if missing
      const exchange = (x.exchange || '').toUpperCase() || 'NASDAQ';
      seen.set(cik, { ticker, exchange });
    }
  }
  console.log(`${seen.size} valid tickers to insert for ${companiesCount.rows[0].count} companies`);

  // Batch insert securities
  const entries = Array.from(seen.entries());
  let added = 0, skipped = 0;

  for (let i = 0; i < entries.length; i += 100) {
    const batch = entries.slice(i, i + 100);
    const vals = batch.map(([cik, { ticker, exchange }]) => {
      const id = `sec_${cik}`;
      const cid = `company_${cik}`;
      return `('${id}','${cid}','${ticker}','${exchange}',NOW(),NOW())`;
    }).join(',');

    try {
      await c.query(`INSERT INTO securities(id,company_id,ticker,exchange,created_at,updated_at) VALUES${vals} ON CONFLICT(id) DO NOTHING`);
      added += batch.length;
    } catch (e) {
      skipped += batch.length;
    }

    if (added % 2000 === 0 && added > 0) {
      console.log(`  Progress: ${added} inserted...`);
    }
  }

  console.log(`\nDone! ${added} securities added, ${skipped} skipped.`);

  // Final count
  const final = await c.query('SELECT COUNT(*) FROM securities WHERE active = true');
  console.log(`Total active securities: ${final.rows[0].count}`);

  await c.end();
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
