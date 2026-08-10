const { Client } = require('pg');
const DB = process.env.DATABASE_URL;
if (!DB) { console.error('DATABASE_URL required'); process.exit(1); }

async function run() {
  const c = new Client({ connectionString: DB });
  await c.connect();

  await c.query(`
    INSERT INTO entities (id, entity_type, canonical_name, attributes, created_at, updated_at) VALUES
    ('entity_fda', 'agency', 'U.S. Food and Drug Administration', '{}', NOW(), NOW()),
    ('entity_uspto', 'agency', 'U.S. Patent and Trademark Office', '{}', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  console.log('Entities: FDA, USPTO added');

  await c.query(`
    INSERT INTO entity_mappings (id, company_id, entity_id, confidence, created_at) VALUES
    ('map_exm', 'company_exm', 'entity_exm', 1.0, NOW()),
    ('map_bpi', 'company_bpi', 'entity_bpi', 1.0, NOW()),
    ('map_gtm', 'company_gtm', 'entity_gtm', 1.0, NOW()),
    ('map_cshi', 'company_cshi', 'entity_cshi', 1.0, NOW()),
    ('map_pmt', 'company_pmt', 'entity_pmt', 1.0, NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  console.log('Mappings: 5 companies');

  await c.query(`
    INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, directness, confidence, evidence_id, created_at) VALUES
    ('rel_exm_doe', 'entity_exm', 'entity_doe', 'awarded_to', 'direct', 1.0, 'ev_1', NOW()),
    ('rel_exm_bechtel', 'entity_exm', 'entity_bechtel', 'partner_of', 'direct', 0.85, NULL, NOW()),
    ('rel_bpi_fda', 'entity_bpi', 'entity_fda', 'regulated_by', 'direct', 1.0, 'ev_3', NOW()),
    ('rel_gtm_doe', 'entity_gtm', 'entity_doe', 'awarded_to', 'direct', 0.9, NULL, NOW()),
    ('rel_cshi_uspto', 'entity_cshi', 'entity_uspto', 'granted_by', 'direct', 1.0, NULL, NOW()),
    ('rel_bechtel_doe', 'entity_bechtel', 'entity_doe', 'awarded_to', 'direct', 0.95, NULL, NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  console.log('Relationships: 6 edges');

  await c.query("UPDATE opportunities SET price_change_pct=2.3, volume_change_pct=15, sector_change_pct=0.4, price_reaction_date=NOW() WHERE id='opp_1'");
  await c.query("UPDATE opportunities SET price_change_pct=4.8, volume_change_pct=32, sector_change_pct=1.1, price_reaction_date=NOW() WHERE id='opp_5'");
  console.log('Market data: opp_1 & opp_5');

  await c.end();
  console.log('Done!');
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
