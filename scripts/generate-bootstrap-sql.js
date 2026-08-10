const fs = require('fs');

async function main() {
  console.log('Fetching SEC company list...');
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': 'Hidden Catalyst Research contact@hiddencatalyst.com' }
  });
  const raw = await res.json();
  const companies = Object.values(raw);
  console.log(`Generating SQL for ${companies.length} companies...`);

  let sql = '-- Bootstrap ALL SEC-registered companies\n';
  sql += '-- Run this in Supabase SQL Editor\n\n';

  // Batch inserts in groups of 500
  let count = 0;
  let batch = [];

  for (const c of companies) {
    const ticker = (c.ticker || '').toUpperCase().replace(/'/g, "''");
    const cik = String(c.cik_str || '').padStart(10, '0');
    const name = (c.title || 'Unknown').replace(/'/g, "''");

    if (!ticker || !cik || ticker.length > 5) continue;

    batch.push(`('company_${cik}', '${name}', '${name}', '${cik}', NOW(), NOW())`);
    batch.push(`('sec_${cik}', 'company_${cik}', '${ticker}', 'NASDAQ', NOW(), NOW())`);

    if (batch.length >= 1000) {
      // Companies
      const compVals = [];
      const secVals = [];
      for (let i = 0; i < batch.length; i += 2) {
        compVals.push(batch[i]);
        secVals.push(batch[i + 1]);
      }

      sql += `INSERT INTO companies (id, legal_name, display_name, cik, created_at, updated_at) VALUES\n${compVals.join(',\n')}\nON CONFLICT (cik) DO UPDATE SET display_name = EXCLUDED.display_name;\n\n`;
      sql += `INSERT INTO securities (id, company_id, ticker, exchange, created_at, updated_at) VALUES\n${secVals.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n\n`;

      count += batch.length / 2;
      console.log(`  ${count} companies...`);
      batch = [];
    }
  }

  // Remaining
  if (batch.length > 0) {
    const compVals = [], secVals = [];
    for (let i = 0; i < batch.length; i += 2) {
      compVals.push(batch[i]);
      secVals.push(batch[i + 1]);
    }
    sql += `INSERT INTO companies (id, legal_name, display_name, cik, created_at, updated_at) VALUES\n${compVals.join(',\n')}\nON CONFLICT (cik) DO UPDATE SET display_name = EXCLUDED.display_name;\n\n`;
    sql += `INSERT INTO securities (id, company_id, ticker, exchange, created_at, updated_at) VALUES\n${secVals.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n\n`;
  }

  fs.writeFileSync('docs/bootstrap-all-companies.sql', sql);
  console.log(`\nDone! SQL written to docs/bootstrap-all-companies.sql`);
  console.log(`${count} companies ready to import.`);
  console.log('\nNow: Open https://aputjchzkvbmwoxoatpu.supabase.co → SQL Editor');
  console.log('Paste the file contents and click Run.');
  console.log('This takes ~30 seconds server-side (instant).');
}

main().catch(e => { console.error(e.message); process.exit(1); });
