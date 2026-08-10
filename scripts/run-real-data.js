const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const DB = process.env.DATABASE_URL;
if (!DB) { console.error('DATABASE_URL required'); process.exit(1); }

async function run() {
  const client = new Client({ connectionString: DB });
  await client.connect();

  const sqlPath = path.join(__dirname, '..', 'docs', 'real-opportunities.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Split by semicolons, filter empty lines and comments
  const statements = sql
    .split(';\n')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Executing ${statements.length} SQL statements...`);
  let ok = 0, err = 0;

  for (const stmt of statements) {
    try {
      await client.query(stmt);
      ok++;
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('conflict')) {
        // silently skip duplicates
      } else {
        console.log(`  Error: ${msg.slice(0, 100)}`);
        err++;
      }
    }
  }

  console.log(`${ok} executed, ${err} errors.`);

  const counts = await client.query('SELECT status, COUNT(*) FROM opportunities GROUP BY status ORDER BY status');
  console.log('\nCurrent opportunity statuses:');
  counts.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

  await client.end();
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
