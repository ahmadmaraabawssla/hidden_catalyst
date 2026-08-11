/**
 * Canonical Write Path — converts any discovery (SEC, FDA, USPTO, etc.) through:
 * Document → Signal → CatalystCluster → Opportunity → Claims/Risks/Scores/Watch
 *
 * Used by both daily-top20.js and source-agnostic-pipeline.js
 */

const { Client } = require('pg');

/**
 * Store a normalized SEC signal from a filing discovery.
 * Returns { signalId, clusterId, opportunityId }
 */
async function writeCanonicalOpportunity(client, params) {
  const {
    runId, engineVersion, hash, cik, accessionNumber,
    ticker, displayName, secId, formType, filingDate,
    title, summary, verificationStatus, hiddenAngle,
    verifiedFacts, inferences, contradictions, missingInfo,
    openQuestions, whatToWatch, overlookedReasons, riskFlags,
    scores, extractedFacts, financialMateriality,
    priceReactionPct, volumeReactionPct,
    materialityScore, confidence, industryProfile,
    capitalStructureComplexity, attentionProfile,
  } = params;

  const oppId = 'o_' + hash;
  const docId = 'd_' + hash;
  const signalId = 'sig_' + hash;
  const clusterId = 'cl_' + hash;

  // ── 1. Document ──
  await client.query(
    `INSERT INTO documents(id, source_id, canonical_url, published_at, retrieved_at, content_hash, title, text, created_at)
     VALUES($1, $2, $3, $4, NOW(), $5, $6, $7, NOW()) ON CONFLICT(content_hash) DO NOTHING`,
    [docId, 'source_sec_edgar',
     `https://www.sec.gov/cgi-bin/browse-edgar?CIK=${cik}`,
     filingDate, hash, title, summary]
  );

  // ── 2. Signal ──
  const entities = [{ name: displayName, type: 'company', identifiers: { ticker, cik } }];
  const amounts = financialMateriality?.amount
    ? [{ value: parseFloat(financialMateriality.amount.replace(/[^0-9.]/g, '')) || 0, currency: 'USD', label: 'maximum_exposure' }]
    : [];
  const signalMetadata = { formType, accessionNumber, industryProfile };

  try {
    await client.query(
      `INSERT INTO signals(id, source_id, document_id, source_type, external_id,
         published_at, retrieved_at, title, raw_text, entities, event_type, amounts,
         source_url, source_quality, raw_metadata, created_at)
       VALUES($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       ON CONFLICT(source_id, external_id) DO NOTHING`,
      [signalId, 'source_sec_edgar', docId, 'sec_filing', accessionNumber,
       filingDate, title, summary.slice(0, 5000), JSON.stringify(entities),
       formType, JSON.stringify(amounts),
       `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${accessionNumber}.txt`,
       70, JSON.stringify(signalMetadata)]
    );
  } catch (e) { console.log(`  [canonical] signal skip: ${(e.message||'').slice(0, 60)}`); }

  // ── 3. CatalystCluster ──
  const researchQs = JSON.stringify(openQuestions || []);
  const materialityJson = financialMateriality ? JSON.stringify(financialMateriality) : null;
  const haClaim = hiddenAngle?.claim || '';

  try {
    await client.query(
      `INSERT INTO catalyst_clusters(id, title, thesis, cluster_type, status, materiality_json,
         research_questions, research_completeness, priority_score, created_at, updated_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT(id) DO NOTHING`,
      [clusterId, title, haClaim, formType,
       verificationStatus === 'verified' ? 'verified' : 'open',
       materialityJson, researchQs, completenessFromParams(params),
       (scores && scores.opportunity) || 50]
    );
  } catch (e) { console.log(`  [canonical] cluster skip: ${(e.message||'').slice(0, 60)}`); }

  // ── 4. CatalystClusterSignal ──
  try {
    await client.query(
      `INSERT INTO catalyst_cluster_signals(id, cluster_id, signal_id, role, confidence, created_at)
       VALUES($1, $2, $3, $4, $5, NOW())
       ON CONFLICT(cluster_id, signal_id) DO NOTHING`,
      ['cs_' + hash, clusterId, signalId, 'primary', confidence || 0.7]
    );
  } catch (e) { console.log(`  [canonical] cs skip: ${(e.message||'').slice(0, 60)}`); }

  // ── 5. Opportunity (always 'candidate' — qualification gate below) ──
  await client.query(
    `INSERT INTO opportunities(id, security_id, title, summary, status, verification_status,
       hidden_angle, detected_at, price_change_pct, volume_change_pct,
       engine_version, run_id, last_researched_at, cluster_id, research_completeness, created_at, updated_at)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, $14, NOW(), NOW())
     ON CONFLICT(id) DO UPDATE SET
       verification_status = EXCLUDED.verification_status,
       hidden_angle = EXCLUDED.hidden_angle,
       price_change_pct = COALESCE(EXCLUDED.price_change_pct, opportunities.price_change_pct),
       cluster_id = COALESCE(EXCLUDED.cluster_id, opportunities.cluster_id),
       updated_at = NOW()`,
    [oppId, secId, title, summary, 'published', verificationStatus || 'candidate',
     hiddenAngle ? JSON.stringify(hiddenAngle) : null,
     filingDate, priceReactionPct || null, volumeReactionPct || null,
     engineVersion || 'v3', runId || 'unknown',
     clusterId, completenessFromParams(params)]
  );

  // ── 6. Claims (verified facts) ──
  const facts = (verifiedFacts || []).slice(0, 10);
  for (let i = 0; i < facts.length; i++) {
    try {
      await client.query(
        `INSERT INTO claims(id, opportunity_id, claim_type, text, confidence, evidence_item_ids, created_at)
         VALUES($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT(id) DO NOTHING`,
        [`cf_${i}_${hash}`, oppId, 'verified_fact',
         typeof facts[i] === 'string' ? facts[i] : (facts[i].fact || facts[i].text || ''),
         confidence || 0.9, '[]']
      );
    } catch (e) { /* skip duplicates */ }
  }

  // ── 7. Inferences ──
  if (inferences) {
    for (let j = 0; j < Math.min(inferences.length, 5); j++) {
      try {
        await client.query(
          `INSERT INTO claims(id, opportunity_id, claim_type, text, confidence, evidence_item_ids, created_at)
           VALUES($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT(id) DO NOTHING`,
          [`ci_${j}_${hash}`, oppId, 'inference', inferences[j].text, inferences[j].confidence || 0.7, '[]']
        );
      } catch (e) { /* skip */ }
    }
  }

  // ── 8. Scores ──
  if (scores) {
    const scoreRows = Object.entries(scores);
    for (let si = 0; si < scoreRows.length; si++) {
      const [st, sv] = scoreRows[si];
      try {
        await client.query(
          `INSERT INTO scores(id, opportunity_id, score_type, value, factors, model_version, calculated_at)
           VALUES($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT(id) DO NOTHING`,
          [`s_${st}_${hash}`, oppId, st, sv,
           JSON.stringify({ mc: params.mc, pipeline: 'daily-top20-v3' }), '3.0.0']
        );
      } catch (e) { /* skip */ }
    }
  }

  // ── 9. Contradictions ──
  if (contradictions) {
    for (let j = 0; j < contradictions.length; j++) {
      try {
        await client.query(
          `INSERT INTO risks(id, opportunity_id, risk_type, severity, description, created_at)
           VALUES($1, $2, $3, $4, $5, NOW())
           ON CONFLICT(id) DO NOTHING`,
          [`ct_${j}_${hash}`, oppId, 'contradiction', 'medium',
           typeof contradictions[j] === 'string' ? contradictions[j] : contradictions[j]]
        );
      } catch (e) { /* skip */ }
    }
  }

  // ── 10. Missing Information ──
  if (missingInfo) {
    for (let j = 0; j < missingInfo.length; j++) {
      try {
        await client.query(
          `INSERT INTO risks(id, opportunity_id, risk_type, severity, description, created_at)
           VALUES($1, $2, $3, $4, $5, NOW())
           ON CONFLICT(id) DO NOTHING`,
          [`mi_${j}_${hash}`, oppId, 'missing_info', 'low', missingInfo[j]]
        );
      } catch (e) { /* skip */ }
    }
  }

  // ── 11. Overlooked Reasons ──
  const reasons = overlookedReasons || [
    `Market cap limited — reduced analyst coverage`,
    `${formType} filing — ${formType === '8-K' ? 'unscheduled disclosure' : 'periodic report'}`,
  ];
  for (let j = 0; j < Math.min(reasons.length, 3); j++) {
    try {
      await client.query(
        `INSERT INTO risks(id, opportunity_id, risk_type, severity, description, created_at)
         VALUES($1, $2, $3, $4, $5, NOW())
         ON CONFLICT(id) DO NOTHING`,
        [`olr_${j}_${hash}`, oppId, `overlooked_reason_${j + 1}`, 'low', reasons[j]]
      );
    } catch (e) { /* skip */ }
  }

  // ── 12. Risk Flags ──
  if (riskFlags) {
    for (let fi = 0; fi < Math.min(riskFlags.length, 5); fi++) {
      const rf = riskFlags[fi];
      try {
        await client.query(
          `INSERT INTO risks(id, opportunity_id, risk_type, severity, description, created_at)
           VALUES($1, $2, $3, $4, $5, NOW())
           ON CONFLICT(id) DO NOTHING`,
          [`rf_${fi}_${hash}`, oppId, rf.type || 'general', rf.severity || 'low', rf.description || '']
        );
      } catch (e) { /* skip */ }
    }
  }

  // ── 13. What to Watch ──
  if (whatToWatch) {
    for (let j = 0; j < whatToWatch.length; j++) {
      try {
        await client.query(
          `INSERT INTO invalidation_rules(id, opportunity_id, rule_type, definition, status, created_at)
           VALUES($1, $2, $3, $4, $5, NOW())
           ON CONFLICT(id) DO NOTHING`,
          [`wt_${j}_${hash}`, oppId, 'confirmation',
           JSON.stringify({ signal: whatToWatch[j] }), 'monitoring']
        );
      } catch (e) { /* skip */ }
    }
  }

  // ── 14. Open Questions ──
  if (openQuestions) {
    for (let j = 0; j < openQuestions.length; j++) {
      try {
        await client.query(
          `INSERT INTO invalidation_rules(id, opportunity_id, rule_type, definition, status, created_at)
           VALUES($1, $2, $3, $4, $5, NOW())
           ON CONFLICT(id) DO NOTHING`,
          [`oq_${j}_${hash}`, oppId, 'open_question',
           JSON.stringify({ question: openQuestions[j] }), 'open']
        );
      } catch (e) { /* skip */ }
    }
  }

  return { opportunityId: oppId, signalId, clusterId, documentId: docId };
}

/**
 * Compute research completeness from available data (0-100)
 */
function completenessFromParams(params) {
  let ok = 0, partial = 0, total = 10;
  if (params.verifiedFacts?.length > 0) ok++;
  if (params.hiddenAngle?.claim) ok++;
  if (params.contradictions?.length > 0) ok++;
  if (params.whatToWatch?.length > 0) ok++;
  if (params.openQuestions?.length > 0) ok++;
  if (params.priceReactionPct != null) ok++;
  if (params.inferences?.length > 0) partial++;
  if (params.financialMateriality?.level && params.financialMateriality.level !== 'UNCERTAIN') partial++;
  if (params.missingInfo?.length > 0) partial++;
  if (params.scores) partial++;
  return Math.round(((ok + partial * 0.5) / total) * 100);
}

/**
 * Deterministic qualification gate — applies hard rules, not LLM-only.
 * Returns: 'rejected' | 'watch' | 'candidate' | 'verified'
 */
function applyQualificationGate(params) {
  const reasons = [];
  const ha = params.hiddenAngle || {};
  const fm = params.financialMateriality || {};

  if (!params.verifiedFacts || params.verifiedFacts.length === 0) reasons.push('No primary evidence');
  if (!ha.claim) reasons.push('No hidden angle');
  if (params.contradictions?.some(c => typeof c === 'string' && c.toLowerCase().includes('fatal'))) reasons.push('Fatal contradiction');
  if (!fm.level || fm.level === 'UNCERTAIN') reasons.push('Materiality not quantified');
  if (ha.confidence && ha.confidence < 0.5) reasons.push('Hidden angle confidence too low');

  // Fatal: reject
  if (reasons.includes('Fatal contradiction') || reasons.includes('No primary evidence')) {
    return { status: 'rejected', reasons };
  }

  // Missing critical inputs: cap at WATCH
  if (reasons.includes('Materiality not quantified') || reasons.includes('No hidden angle')) {
    return { status: 'watch', reasons };
  }

  // All gates pass → candidate
  if (reasons.length > 0) {
    return { status: 'watch', reasons };
  }

  // Verified: all gates pass + high confidence + cross-doc refs
  if ((ha.confidence || 0) >= 0.85 && completenessFromParams(params) >= 75) {
    return { status: 'verified', reasons };
  }

  return { status: 'candidate', reasons };
}

module.exports = { writeCanonicalOpportunity, applyQualificationGate, completenessFromParams };
