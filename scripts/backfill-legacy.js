/**
 * Backfill legacy opportunities: create signals, clusters, apply qualification gates
 */
const { Client } = require('pg');
const DB = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString: DB });
  await client.connect();

  // 1. Downgrade candidates with missing materiality or hidden angle → watch
  const d1 = await client.query(
    `UPDATE opportunities SET verification_status='watch', updated_at=NOW()
     WHERE status='published' AND verification_status='candidate'
     AND (hidden_angle IS NULL OR hidden_angle->>'claim' IS NULL
       OR hidden_angle->'cashExposure' IS NULL
       OR hidden_angle->'cashExposure'->>'amount' IS NULL
       OR hidden_angle->'cashExposure'->>'likelihood' LIKE '%uncertain%')`
  );
  console.log('Downgraded candidate→watch:', d1.rowCount);

  // 2. Show current state
  const r = await client.query(
    `SELECT title, verification_status FROM opportunities WHERE status='published' ORDER BY verification_status`
  );
  console.log('\nPublished opportunities:');
  r.rows.forEach(function(row) {
    console.log('  [' + row.verification_status + '] ' + (row.title || '').slice(0, 70));
  });

  // 3. Backfill canonical: signals + clusters for published opps missing them
  const opps = await client.query(
    `SELECT o.id, o.title, o.security_id, o.verification_status, o.hidden_angle,
            o.detected_at, o.summary, o.engine_version, o.run_id,
            s.ticker, c.display_name, c.sector
     FROM opportunities o
     JOIN securities s ON s.id = o.security_id
     JOIN companies c ON c.id = s.company_id
     WHERE o.status = 'published' AND o.cluster_id IS NULL`
  );
  console.log('\nBackfilling ' + opps.rowCount + ' opportunities missing signal/cluster...');

  for (let i = 0; i < opps.rows.length; i++) {
    const o = opps.rows[i];
    const sid = 'sig_back_' + o.id.slice(-16);
    const cid = 'cl_back_' + o.id.slice(-16);
    const ha = o.hidden_angle || {};

    try {
      await client.query(
        `INSERT INTO signals(id, source_id, source_type, external_id, published_at, retrieved_at,
           title, raw_text, entities, source_url, source_quality, raw_metadata, created_at)
         VALUES($1, 'source_sec_edgar', 'sec_filing', $2, $3, NOW(), $4, $5, $6, $7, 60, $8, NOW())
         ON CONFLICT(source_id, external_id) DO NOTHING`,
        [sid, 'backfill_' + o.id.slice(-8), o.detected_at || new Date(), o.title,
         o.summary || '', JSON.stringify([{ name: o.display_name || 'Unknown', type: 'company' }]),
         'https://www.sec.gov', JSON.stringify({ backfilled: true })]
      );
    } catch (e) { /* signal may already exist */ }

    try {
      await client.query(
        `INSERT INTO catalyst_clusters(id, title, thesis, cluster_type, status, research_questions, created_at, updated_at)
         VALUES($1, $2, $3, 'SEC_8K', 'open', $4, NOW(), NOW())
         ON CONFLICT(id) DO NOTHING`,
        [cid, o.title, ha.claim || o.title, JSON.stringify([])]
      );
      await client.query(
        `INSERT INTO catalyst_cluster_signals(id, cluster_id, signal_id, role, confidence, created_at)
         VALUES($1, $2, $3, 'primary', 0.7, NOW())
         ON CONFLICT(cluster_id, signal_id) DO NOTHING`,
        ['cs_back_' + o.id.slice(-16), cid, sid]
      );
      await client.query('UPDATE opportunities SET cluster_id=$1 WHERE id=$2', [cid, o.id]);
      console.log('  Backfilled: ' + (o.title || '').slice(0, 50));
    } catch (e) {
      console.log('  Skip: ' + (e.message || '').slice(0, 60));
    }
  }

  // 4. Compute research completeness for all published
  const all = await client.query(
    `SELECT id, hidden_angle, cluster_id,
            (SELECT COUNT(*) FROM claims WHERE opportunity_id = opportunities.id AND claim_type = 'verified_fact') as fact_count,
            (SELECT COUNT(*) FROM risks WHERE opportunity_id = opportunities.id AND risk_type = 'contradiction') as contradiction_count,
            (SELECT COUNT(*) FROM invalidation_rules WHERE opportunity_id = opportunities.id AND status = 'monitoring') as watch_count,
            price_change_pct
     FROM opportunities WHERE status = 'published'`
  );
  for (const o of all.rows) {
    const ha = o.hidden_angle || {};
    let ok = 0, partial = 0;
    if (o.fact_count > 0) ok++;
    if (ha.claim) ok++;
    if (o.contradiction_count > 0) ok++;
    if (o.watch_count > 0) ok++;
    if (o.price_change_pct != null) ok++;
    if (ha.cashExposure?.amount) partial++;
    if (ha.capitalOverhang) partial++;
    if (o.cluster_id) partial++;
    const pct = Math.round(((ok + partial * 0.5) / 8) * 100);
    await client.query('UPDATE opportunities SET research_completeness=$1 WHERE id=$2', [pct, o.id]);
  }
  console.log('Completeness computed for ' + all.rowCount + ' opportunities.');

  // 5. Final state
  const f = await client.query(
    `SELECT verification_status, COUNT(*) FROM opportunities WHERE status='published' GROUP BY verification_status`
  );
  console.log('\nFinal published:', JSON.stringify(f.rows));

  await client.end();
}

main().catch(function(e) { console.error('Fatal:', e.message); process.exit(1); });
