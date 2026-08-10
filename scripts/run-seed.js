const { Client } = require('pg');
const fs = require('fs');

async function run() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL
  });
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
  await c.connect();

  const sql = fs.readFileSync('docs/real-discovery-seed.sql', 'utf8');
  // Execute the whole thing as one transaction block
  await c.query(sql);

  const cnt = await c.query('SELECT status, COUNT(*) as n FROM opportunities GROUP BY status ORDER BY status');
  console.log('DONE. Statuses:', JSON.stringify(cnt.rows));

  await c.end();
  process.exit(0);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
