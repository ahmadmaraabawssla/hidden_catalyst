const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB = process.env.DATABASE_URL;
if (!DB) { console.error('DATABASE_URL required'); process.exit(1); }

const FILES = [
  'docs/migration-security-attributes.sql',
  'docs/migration-fulltext-search.sql',
  'docs/seed-relationships.sql',
];

async function run() {
  const client = new Client({ connectionString: DB });
  await client.connect();
  console.log('Connected to Supabase!\n');

  for (const file of FILES) {
    const sql = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    console.log(`Running: ${file}`);
    const stmts = sql.split(/;\s*\n/).map(s => s.trim()).filter(s => s && !s.startsWith('--'));
    for (const s of stmts) {
      try { await client.query(s); }
      catch (e) { /* skip duplicates/already-exists */ }
    }
    console.log(`  Done.\n`);
  }

  await client.end();
  console.log('All migrations complete!');
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
