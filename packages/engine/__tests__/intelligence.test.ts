import { describe, expect, it } from 'vitest';
import {
  buildResearchReport,
  calculatePriceReactionWindows,
  computeMateriality,
  runDeterministicAdversarialCheck,
} from '../src';

describe('computeMateriality', () => {
  it('classifies contract value against revenue', () => {
    const result = computeMateriality({
      eventType: 'contract_award',
      amount: 25_000_000,
      revenue: 100_000_000,
    });

    expect(result.metric).toBe('contract value / revenue');
    expect(result.level).toBe('HIGH');
    expect(result.ratio).toBeCloseTo(0.25);
  });

  it('classifies liabilities against cash', () => {
    const result = computeMateriality({
      eventType: 'liability',
      amount: 8_000_000,
      cash: 10_000_000,
    });

    expect(result.metric).toBe('liability / cash');
    expect(result.level).toBe('EXTREME');
  });

  it('downgrades stale events to UNKNOWN when the denominator is not contemporaneous', () => {
    // A 1993 contract amount compared against "today's" revenue would produce a
    // misleading HIGH/MODERATE. It must be flagged UNKNOWN.
    const result = computeMateriality({
      eventType: 'contract_award',
      amount: 22_000_000_000,
      revenue: 89_000_000_000,
      eventDate: new Date('1993-11-15T00:00:00Z'),
      denominatorAsOf: new Date('2026-08-14T00:00:00Z'),
    });

    expect(result.level).toBe('UNKNOWN');
    expect(result.ratio).toBeNull();
    expect(result.explanation).toContain('contemporaneous');
  });

  it('keeps recent events classified normally', () => {
    const result = computeMateriality({
      eventType: 'contract_award',
      amount: 25_000_000,
      revenue: 100_000_000,
      eventDate: new Date('2026-08-01T00:00:00Z'),
      denominatorAsOf: new Date('2026-08-14T00:00:00Z'),
    });

    expect(result.level).toBe('HIGH');
    expect(result.ratio).toBeCloseTo(0.25);
  });

  it('classifies a negligible event as IMMATERIAL (Abbott $2M / $44B case)', () => {
    const result = computeMateriality({
      eventType: 'contract_award',
      amount: 2_016_396,
      revenue: 44_300_000_000,
    });
    expect(result.level).toBe('IMMATERIAL');
    expect(result.ratio).toBeLessThan(0.0025);
  });
});

describe('calculatePriceReactionWindows', () => {
  it('returns window returns and priced-in score', () => {
    const eventDate = new Date('2026-01-21T00:00:00Z');
    const prices = Array.from({ length: 50 }).map((_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      close: 10 + i * 0.05,
      volume: 100_000 + i * 1_000,
    }));

    const result = calculatePriceReactionWindows(prices, eventDate);

    expect(result.returns.t1).not.toBeNull();
    expect(result.returns.p5).not.toBeNull();
    expect(result.pricedInScore).toBeGreaterThanOrEqual(0);
    expect(result.pricedInScore).toBeLessThanOrEqual(100);
  });
});

describe('runDeterministicAdversarialCheck', () => {
  it('flags weak, low-materiality theses without inventing a prediction', () => {
    const result = runDeterministicAdversarialCheck({
      eventType: 'patent_grant',
      title: 'Patent issued',
      thesis: 'A patent was granted.',
      relationshipConfidence: 45,
      materialityRatio: 0.01,
      evidenceQuality: 50,
      priceReactionScore: 80,
    });

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.confidencePenalty).toBeGreaterThan(0);
  });
});

describe('buildResearchReport', () => {
  it('rejects spot-price substitution for defined contractual variables', () => {
    const materiality = computeMateriality({
      eventType: 'true_up_liability',
      amount: 1_000_000,
    });
    const adversarial = runDeterministicAdversarialCheck({
      eventType: 'true_up_liability',
      title: 'If the stock trades below $0.39912, the company could owe up to $1M',
      thesis: 'Commitment Fee Price is less than the Minimum Price.',
      materialityRatio: materiality.ratio,
      evidenceQuality: 88,
      relationshipConfidence: 80,
    });

    const report = buildResearchReport({
      title: 'True-up clause',
      eventType: 'true_up_liability',
      thesis: 'If the stock trades below $0.39912, the company could owe up to $1M. The Commitment Fee Price is less than the Minimum Price.',
      materiality,
      adversarial,
      signals: [{
        title: 'True-Up Amount = $1,000,000 - (2,505,513 * Commitment Fee Price). Minimum Price threshold: $0.39912',
        sourceType: 'sec_filing',
        rawText: 'The company may have the option to settle the true-up in shares.',
        amounts: [{ value: 1_000_000 }],
        sourceQuality: 88,
      }],
      attentionAvailable: false,
      priceReactionAvailable: false,
    });

    expect(report.rejectedClaims.some((claim) => claim.text.includes('Spot stock price'))).toBe(true);
    expect(report.unverifiedClaims.some((claim) => claim.text.includes('settled in shares'))).toBe(true);
    expect(report.unverifiedClaims.some((claim) => claim.text.includes('Financial materiality'))).toBe(true);
    expect(report.unverifiedClaims.some((claim) => claim.text.includes('overlooked'))).toBe(true);
    expect(report.thesisStatus).toBe('watch');
    expect(report.scenarioTables[0].rows.length).toBeGreaterThan(0);
  });

  it('rejects an economically immaterial event (Abbott-style $2M contract)', () => {
    const materiality = computeMateriality({
      eventType: 'contract_award',
      amount: 2_016_396,
      revenue: 44_300_000_000,
    });
    const adversarial = runDeterministicAdversarialCheck({
      eventType: 'contract_award',
      title: 'Federal contract award',
      thesis: 'A federal contract was awarded.',
      materialityRatio: materiality.ratio,
      evidenceQuality: 90,
      relationshipConfidence: 90,
    });
    const report = buildResearchReport({
      title: 'Federal contract award',
      eventType: 'contract_award',
      thesis: 'A federal contract was awarded.',
      materiality,
      adversarial,
      signals: [{
        title: 'Federal contract award',
        sourceType: 'federal_contract',
        rawText: 'Agency awarded a contract to the recipient.',
        amounts: [{ value: 2_016_396 }],
        sourceQuality: 90,
      }],
      attentionAvailable: true,
      attentionMeasured: false,
      priceReactionAvailable: true,
      priceReactionMeasured: true,
      relationshipConfidence: 90,
    });
    expect(report.thesisStatus).toBe('reject');
    expect(report.qualificationReasons.some((r) => r.includes('immaterial'))).toBe(true);
  });

  it('rejects a clinical trial with no extracted dollar amount (no economic mechanism)', () => {
    const materiality = computeMateriality({
      eventType: 'clinical_trial_result',
      amount: null,
      enterpriseValue: 475_000_000, // market-cap-derived denominator is present
    });
    const adversarial = runDeterministicAdversarialCheck({
      eventType: 'clinical_trial_result',
      title: 'Trial: A Study to Investigate the Effect of a Drug',
      thesis: 'trial thesis',
      materialityRatio: materiality.ratio,
      evidenceQuality: 90,
      relationshipConfidence: 90,
    });
    const report = buildResearchReport({
      title: 'Trial: A Study to Investigate the Effect of a Drug',
      eventType: 'clinical_trial_result',
      thesis: 'trial thesis',
      materiality,
      adversarial,
      signals: [{ title: 'Trial record', sourceType: 'clinical_trials', rawText: 'trial', sourceQuality: 90 }],
      attentionAvailable: true, attentionMeasured: false, priceReactionAvailable: true, priceReactionMeasured: true,
      relationshipConfidence: 90,
    });
    expect(report.thesisStatus).toBe('reject');
    expect(report.qualificationReasons.some((r) => r.includes('no extracted dollar amount'))).toBe(true);
  });

  it('closes out a watch item with no ratio after the shelf-life window', () => {
    const materiality = computeMateriality({ eventType: '8-K', amount: null });
    const adversarial = runDeterministicAdversarialCheck({
      eventType: '8-K', title: 'old filing', thesis: 'x', materialityRatio: materiality.ratio, evidenceQuality: 90, relationshipConfidence: 90,
    });
    const report = buildResearchReport({
      title: 'old filing',
      eventType: '8-K',
      thesis: 'x',
      materiality,
      adversarial,
      signals: [{ title: '8-K', sourceType: 'sec_filing', rawText: 'x', sourceQuality: 90, publishedAt: new Date(Date.now() - 50 * 86400000) }],
      attentionAvailable: false, priceReactionAvailable: false,
      relationshipConfidence: 90,
    });
    expect(report.thesisStatus).toBe('reject');
    expect(report.qualificationReasons.some((r) => r.includes('closing out'))).toBe(true);
  });

  it('enforces the invariant: LLM "routine" verdict rejects regardless of materiality', () => {
    const materiality = computeMateriality({
      eventType: '8-K',
      amount: 270_000,
      revenue: 1_900_000, // ~14% — meaningful, above the immaterial floor
    });
    const adversarial = runDeterministicAdversarialCheck({
      eventType: '8-K',
      title: 'Settlement default',
      thesis: 'Settlement default triggers a $270K claim.',
      materialityRatio: materiality.ratio,
      evidenceQuality: 90,
      relationshipConfidence: 90,
    });
    const report = buildResearchReport({
      title: 'Settlement default',
      eventType: '8-K',
      thesis: 'The disclosed default liability is not a hidden opportunity.',
      materiality,
      adversarial,
      signals: [{
        title: '8-K settlement default',
        sourceType: 'sec_filing',
        rawText: 'Settlement default triggers full $270K claim but warrants create dilution overhang.',
        amounts: [{ value: 270_000 }],
        sourceQuality: 90,
      }],
      attentionAvailable: true,
      attentionMeasured: false,
      priceReactionAvailable: true,
      priceReactionMeasured: true,
      relationshipConfidence: 90,
      deepResearch: { isRoutine: true, direction: 'negative' },
    });
    // The LLM said "routine / not a hidden opportunity" → must NOT be candidate.
    expect(report.thesisStatus).toBe('reject');
    expect(report.qualificationReasons.some((r) => r.includes('routine'))).toBe(true);
  });

  it('assigns a negative direction to a warrant/dilution/liability catalyst', () => {
    const materiality = computeMateriality({ eventType: '8-K', amount: 270_000, revenue: 1_900_000 });
    const adversarial = runDeterministicAdversarialCheck({
      eventType: '8-K', title: 'Settlement', thesis: 't', materialityRatio: materiality.ratio, evidenceQuality: 90, relationshipConfidence: 90,
    });
    const report = buildResearchReport({
      title: 'Settlement default + warrants',
      eventType: '8-K',
      thesis: 'Default liability plus pre-funded warrants.',
      materiality,
      adversarial,
      signals: [{ title: '8-K', sourceType: 'sec_filing', rawText: 'default liability and pre-funded warrant dilution', sourceQuality: 90 }],
      attentionAvailable: true, attentionMeasured: false, priceReactionAvailable: true, priceReactionMeasured: true,
      relationshipConfidence: 90,
    });
    expect(report.direction).toBe('negative');
  });
});
