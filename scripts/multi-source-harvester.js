/**
 * Multi-source signal harvester — FDA + ClinicalTrials + USPTO
 * No Prisma dependency. No API keys required.
 * Outputs normalized signals through the canonical writer.
 */

const { Client } = require('pg');
const { writeCanonicalOpportunity, applyQualificationGate } = require('../packages/engine/src/canonical-writer');

const UA = 'Hidden Catalyst contact@hiddencatalyst.com';

// ─── FDA: openFDA drug/device approvals ───
async function harvestFDA(client, sinceDays = 30) {
  const signals = [];
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString().slice(0, 10);
  
  // Drug approvals
  try {
    const res = await fetch(
      `https://api.fda.gov/drug/drugsfda.json?search=submissions.submission_status_date:[${since}+TO+9999-12-31]&limit=20`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) }
    );
    if (res.ok) {
      const data = await res.json();
      for (const r of (data.results || [])) {
        const sub = r.submissions?.[0];
        if (!sub) continue;
        signals.push({
          source: 'fda',
          sourceType: 'drug_approval',
          title: `FDA ${sub.submission_type || 'action'}: ${r.openfda?.brand_name?.[0] || r.openfda?.substance_name?.[0] || 'Unknown drug'}`,
          rawText: `FDA ${sub.submission_status || 'action'} for ${r.openfda?.brand_name?.[0] || 'Unknown'} on ${sub.submission_status_date || 'unknown date'}`,
          entities: r.openfda?.manufacturer_name?.map(m => ({ name: m, type: 'company' })) || [],
          amounts: [],
          sourceUrl: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${r.application_number || ''}`,
          sourceQuality: 85,
          publishedAt: sub.submission_status_date ? new Date(sub.submission_status_date) : new Date(),
          eventType: 'regulatory_approval',
        });
      }
    }
  } catch (e) { console.log('  [FDA] Drug approvals fetch: ' + (e.message || '').slice(0, 60)); }

  // Device approvals
  try {
    const res2 = await fetch(
      `https://api.fda.gov/device/510k.json?search=decision_date:[${since}+TO+9999-12-31]&limit=10`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) }
    );
    if (res2.ok) {
      const data = await res2.json();
      for (const r of (data.results || [])) {
        signals.push({
          source: 'fda',
          sourceType: 'device_clearance',
          title: `FDA 510(k) Clearance: ${r.device_name || r.openfda?.device_name || 'Unknown device'}`,
          rawText: `FDA cleared ${r.device_name || 'Unknown'} (${r.k_number || 'N/A'}) on ${r.decision_date || 'unknown'}`,
          entities: r.openfda?.applicant?.map(a => ({ name: a, type: 'company' })) || [],
          amounts: [],
          sourceUrl: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${r.k_number || ''}`,
          sourceQuality: 80,
          publishedAt: r.decision_date ? new Date(r.decision_date) : new Date(),
          eventType: 'regulatory_clearance',
        });
      }
    }
  } catch (e) { console.log('  [FDA] Device fetch: ' + (e.message || '').slice(0, 60)); }

  return signals;
}

// ─── USPTO: recent patent grants ───
async function harvestUSPTO(sinceDays = 7) {
  const signals = [];
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString().slice(0, 10);
  
  try {
    const res = await fetch(
      `https://developer.uspto.gov/ibd-api/v1/application/grants?grantFromDate=${since}&start=0&rows=15`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) }
    );
    if (res.ok) {
      const data = await res.json();
      for (const r of (data.results || [])) {
        signals.push({
          source: 'uspto',
          sourceType: 'patent_grant',
          title: `Patent Grant: ${r.patentTitle || r.inventionTitle || 'Unknown patent'}`,
          rawText: `USPTO granted patent ${r.patentNumber || 'N/A'} "${r.patentTitle || ''}" to ${r.assigneeEntityName || r.firstNamedApplicant || 'Unknown'}`,
          entities: [{ name: r.assigneeEntityName || r.firstNamedApplicant || 'Unknown', type: 'company' }],
          amounts: [],
          sourceUrl: r.patentNumber ? `https://patents.google.com/patent/US${r.patentNumber}` : '',
          sourceQuality: 75,
          publishedAt: r.grantDate ? new Date(r.grantDate) : new Date(),
          eventType: 'patent_grant',
        });
      }
    }
  } catch (e) { console.log('  [USPTO] Fetch: ' + (e.message || '').slice(0, 60)); }

  return signals;
}

// ─── Main harvester ───
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const runId = process.env.RUN_ID || ('multi_' + Date.now());
  console.log('═══ Multi-Source Signal Harvester ═══');
  console.log('Sources: FDA (drugs+devices), USPTO (patents)\n');

  // Harvest
  console.log('[1/2] Harvesting FDA...');
  const fdaSignals = await harvestFDA(client);
  console.log(`  FDA: ${fdaSignals.length} signals`);

  console.log('[2/2] Harvesting USPTO...');
  const usptoSignals = await harvestUSPTO();
  console.log(`  USPTO: ${usptoSignals.length} signals`);

  const allSignals = [...fdaSignals, ...usptoSignals];
  console.log(`\nTotal: ${allSignals.length} signals harvested`);

  // Store as normalized signals + create clusters
  let stored = 0;
  for (const sig of allSignals) {
    const sigId = 'sig_multi_' + Date.now() + '_' + stored;
    const clId = 'cl_multi_' + Date.now() + '_' + stored;

    try {
      // Store signal
      await client.query(
        `INSERT INTO signals(id, source_id, source_type, external_id, published_at, retrieved_at,
           title, raw_text, entities, event_type, amounts, source_url, source_quality, created_at)
         VALUES($1, 'source_' || $2, $3, $4, $5, NOW(), $6, $7, $8, $9, '[]', $10, $11, NOW())
         ON CONFLICT DO NOTHING`,
        [sigId, sig.source, sig.sourceType, sigId, sig.publishedAt,
         sig.title, sig.rawText.slice(0, 5000), JSON.stringify(sig.entities),
         sig.eventType, sig.sourceUrl, sig.sourceQuality]
      );

      // Create cluster
      await client.query(
        `INSERT INTO catalyst_clusters(id, title, thesis, cluster_type, status, research_questions, created_at, updated_at)
         VALUES($1, $2, $3, $4, 'open', $5, NOW(), NOW())
         ON CONFLICT(id) DO NOTHING`,
        [clId, sig.title, sig.rawText.slice(0, 200), 'public_signal', '[]']
      );

      // Link signal to cluster
      await client.query(
        `INSERT INTO catalyst_cluster_signals(id, cluster_id, signal_id, role, confidence, created_at)
         VALUES($1, $2, $3, 'primary', 0.8, NOW())
         ON CONFLICT(cluster_id, signal_id) DO NOTHING`,
        ['cs_' + clId.slice(-16), clId, sigId]
      );

      stored++;
    } catch (e) { /* skip duplicates */ }
  }

  console.log(`\nStored: ${stored} signals + clusters`);
  console.log(`Run ID: ${runId}`);

  await client.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
