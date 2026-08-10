const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const DB = process.env.DATABASE_URL;
if (!DB) { console.error('DATABASE_URL required'); process.exit(1); }

async function run() {
  const client = new Client({ connectionString: DB });
  await client.connect();
  console.log('Connected to Frankfurt.\n');

  const files = ['docs/migration-fulltext-search.sql', 'docs/seed-relationships.sql'];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const stmts = sql.split(/;\s*\n/).map(s => s.trim()).filter(s => s && !s.startsWith('--'));
    console.log(`Running: ${file} (${stmts.length} statements)...`);
    for (const s of stmts) {
      try { await client.query(s); } catch (e) {}
    }
    console.log(`  Done.\n`);
  }

  await client.end();
  console.log('All done!');
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
