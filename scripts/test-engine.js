/**
 * Test harness for the new engine's epistemic discipline.
 * Exercises buildResearchReport (pure TS, no DB) against edge cases:
 *  1. Spot price conflated with a defined contractual variable
 *  2. Unverified share settlement claim
 *  3. Missing materiality denominator
 *  4. Attention not measured
 *  5. Clean case (all inputs present) → candidate/verified
 *
 * Run: node node_modules/.pnpm/tsx@4.23.9/node_modules/tsx/dist/cli.mjs scripts/test-engine.js
 */

const { buildResearchReport } = require('../packages/engine/src/research-report.ts');

function baseMateriality(overrides = {}) {
  return {
    amount: 1000000,
    currency: 'USD',
    ratio: null, // missing denominator by default
    level: 'UNCERTAIN',
    confidence: 'LOW',
    ...overrides,
  };
}

function baseAdversarial(overrides = {}) {
  return {
    fatalContradiction: false,
    findings: [],
    confidence: 0.5,
    ...overrides,
  };
}

function gctkSignals() {
  return [
    {
      title: 'ELOC amendment adds a true-up: $1,000,000 minus (2,505,513 x Commitment Fee Price)',
      sourceType: 'sec_filing',
      sourceUrl: 'https://www.sec.gov/example',
      publishedAt: '2026-08-10',
      rawText: 'If the Commitment Fee Price is less than the Minimum Price of $0.39912, the Company owes the True-Up Amount.',
      sourceQuality: 85,
    },
    {
      title: 'July 14 ELOC Purchase Agreement defines Minimum Price = $0.39912 and ELOC = $50M',
      sourceType: 'sec_filing',
      sourceUrl: 'https://www.sec.gov/referenced-agreement',
      publishedAt: '2026-07-15',
      rawText: 'Minimum Price means $0.39912. Commitment Fee Price is a defined variable.',
      sourceQuality: 90,
    },
  ];
}

function log(name, result) {
  console.log('\n═══════════════════════════════════════════');
  console.log('CASE: ' + name);
  console.log('═══════════════════════════════════════════');
  console.log('Thesis status: ' + result.thesisStatus);
  console.log('Completeness: ' + result.completeness + '%');
  console.log('Confidence: ' + result.confidence + '%');
  console.log('\nQualification reasons:');
  result.qualificationReasons.forEach(r => console.log('  - ' + r));
  console.log('\nRejected claims (overstatements):');
  result.rejectedClaims.forEach(c => console.log('  ✗ ' + c.text + ' → ' + c.reason));
  console.log('\nUnverified claims:');
  result.unverifiedClaims.forEach(c => console.log('  ◐ ' + c.text + ' → ' + c.reason));
  console.log('\nVerified facts:');
  result.verifiedFacts.forEach(c => console.log('  ✓ ' + c.text));
  console.log('\nMissing inputs:');
  result.missingInputs.forEach(m => console.log('  ○ ' + m));
  if (result.scenarioTables.length) {
    console.log('\nScenario tables:');
    result.scenarioTables.forEach(t => {
      console.log('  ' + t.title);
      t.rows.forEach(r => console.log('    ' + r.label + ' → $' + r.output.toLocaleString()));
    });
  }
}

// ─── Case 1: Spot price conflated with CFP ───
log('Spot price presented as the trigger (should REJECT that claim)', buildResearchReport({
  title: 'GCTK ELOC true-up',
  eventType: 'sec_filing',
  thesis: 'If the stock trades below $0.39912, the company owes up to $1M.',
  signals: gctkSignals(),
  materiality: baseMateriality(),
  adversarial: baseAdversarial(),
  priceReactionAvailable: false,
  attentionAvailable: false,
}));

// ─── Case 2: Correct trigger wording, but materiality + attention missing ───
log('Correct trigger, missing materiality + attention (should be WATCH)', buildResearchReport({
  title: 'GCTK ELOC true-up',
  eventType: 'sec_filing',
  thesis: 'If the contractual Commitment Fee Price falls below the Minimum Price, a true-up may apply.',
  signals: gctkSignals(),
  materiality: baseMateriality(),
  adversarial: baseAdversarial(),
  priceReactionAvailable: false,
  attentionAvailable: false,
}));

// ─── Case 3: Unverified share settlement ───
log('Unverified share settlement claim (should flag unverified)', buildResearchReport({
  title: 'GCTK ELOC true-up',
  eventType: 'sec_filing',
  thesis: 'The company may settle the true-up in shares if the Commitment Fee Price falls below Minimum Price.',
  signals: gctkSignals(),
  materiality: baseMateriality(),
  adversarial: baseAdversarial(),
  priceReactionAvailable: false,
  attentionAvailable: false,
}));

// ─── Case 4: Fully resolved (should be CANDIDATE or VERIFIED) ───
log('Fully resolved inputs (should be CANDIDATE/VERIFIED)', buildResearchReport({
  title: 'GCTK ELOC true-up',
  eventType: 'sec_filing',
  thesis: 'If the contractual Commitment Fee Price falls below the Minimum Price of $0.39912, a true-up may apply.',
  signals: gctkSignals(),
  materiality: baseMateriality({ ratio: 0.4, level: 'HIGH', confidence: 'MEDIUM' }),
  adversarial: baseAdversarial({ confidence: 0.8, findings: [{ severity: 'low', description: 'Payment is conditional' }] }),
  priceReactionAvailable: true,
  attentionAvailable: true,
  relationshipConfidence: 95,
}));
