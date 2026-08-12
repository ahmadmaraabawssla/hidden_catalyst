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
});
